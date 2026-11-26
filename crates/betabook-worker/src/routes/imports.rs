use axum::{
    extract::State,
    http::{HeaderMap, StatusCode, header},
    response::Response,
};
use betabook_db::imports::{self, Batch, ImportError};
use betabook_domain::{grades::ImportGradePreference, password::random_hex, seo::PageMetadata};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use worker::js_sys::{self, Array, Reflect};

use super::actions::{action_err, action_value};
use super::member_pages::no_store_json;
use crate::{
    auth::session::require_member_session,
    state::{ApiError, AppState, now_iso_from_ms},
};

// Receipts created by vinext hash JavaScript's JSON.stringify representation, including the
// original field order. Reuse that serialization so an in-flight batch can retry across cutover.
fn batch_hash(payload: &[u8], grade_scale: &str, conflict: &str) -> Result<String, ApiError> {
    let raw = std::str::from_utf8(payload).map_err(ApiError::internal)?;
    let input =
        js_sys::JSON::parse(raw).map_err(|_| ApiError::internal("Invalid import payload"))?;
    let args = Reflect::get(&input, &"args".into())
        .map_err(|_| ApiError::internal("Missing import arguments"))?;
    let rows = Array::from(&args).get(0);
    let encoded: String = js_sys::JSON::stringify(&rows)
        .map_err(|_| ApiError::internal("Invalid import rows"))?
        .into();
    let request =
        format!(r#"{{"rows":{encoded},"gradeScale":"{grade_scale}","onConflict":"{conflict}"}}"#);
    Ok(hex::encode(Sha256::digest(request.as_bytes())))
}

pub(super) async fn action(
    state: &AppState,
    headers: &HeaderMap,
    name: &str,
    args: &[Value],
    payload: &[u8],
) -> Result<Response, ApiError> {
    let session = match require_member_session(state, headers).await {
        Ok(s) => s,
        Err(e) => return Ok(action_err(e.message)),
    };
    let owner = &session.user.id;
    let rows = args.first().unwrap_or(&Value::Null);
    let result = if name == "importSends" {
        let Some(rows) = rows.as_array() else {
            return Ok(action_err("Invalid import rows"));
        };
        let options = args.get(1).unwrap_or(&Value::Null);
        let (Some(scale), Some(conflict)) = (
            options["gradeScale"].as_str(),
            options["onConflict"].as_str(),
        ) else {
            return Ok(action_err("Invalid import options"));
        };
        let pref = match scale {
            "native" => ImportGradePreference::Native,
            "converted" => ImportGradePreference::Converted,
            _ => return Ok(action_err("Invalid import options")),
        };
        let overwrite = match conflict {
            "skip" => false,
            "overwrite" => true,
            _ => return Ok(action_err("Invalid import options")),
        };
        let batch = match options.get("batchId") {
            None => random_hex(16).map_err(ApiError::internal)?,
            Some(Value::String(id)) if !id.is_empty() && id.encode_utf16().count() <= 128 => {
                id.clone()
            }
            _ => return Ok(action_err("Invalid import options")),
        };
        let hash = batch_hash(payload, scale, conflict)?;
        let now = state.now_ms();
        let iso = now_iso_from_ms(now);
        imports::import_sends(
            state.db(),
            rows,
            Batch {
                owner,
                id: &batch,
                hash: &hash,
                overwrite,
                scale: pref,
                today: iso
                    .get(..10)
                    .ok_or_else(|| ApiError::internal("Invalid current date"))?,
                now,
            },
        )
        .await
        .map(|(value, wrote)| {
            if wrote {
                super::goal_refresh::schedule(state, owner);
            }
            value
        })
    } else {
        imports::candidates(state.db(), rows, name == "resolveImportClimbsInAreas").await
    };
    match result {
        Ok(value) => Ok(action_value(value)),
        Err(ImportError::Invalid(m)) => Ok(action_err(m)),
        Err(ImportError::Db(e)) => Err(e.into()),
        Err(ImportError::Unknown) => Ok(no_store_json(
            StatusCode::OK,
            json!({"ok":false,"error":"The import result could not be confirmed","outcome":"unknown"}),
        )),
    }
}

#[worker::send]
pub async fn html(State(state): State<AppState>) -> Result<Response, ApiError> {
    super::seo::member_shell(
        &state,
        StatusCode::OK,
        &PageMetadata::noindex("Import sends", "Import climbing history into Betabook."),
        "routes/import-route.tsx",
    )
    .await
}

pub(super) fn no_transform(response: &mut Response) {
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        http::HeaderValue::from_static("private, no-store, no-transform"),
    );
}
