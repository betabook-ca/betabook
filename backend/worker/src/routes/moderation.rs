use super::{
    actions::{FormFields, action_err, action_ok, action_value, map_mutation_result, today_utc},
    member_pages::no_store_json,
};
use crate::{
    auth::{
        email::notify_moderation_decision,
        session::{require_admin_session, require_member_session, resolve_optional_session},
    },
    state::{ApiError, AppState},
};
use axum::{
    extract::{OriginalUri, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Redirect, Response},
};
use betabook_db::moderation;
use betabook_domain::{
    seo::PageMetadata, site::SITE_DESCRIPTION, terms::has_accepted_current_terms,
};
use serde_json::{Value, json};

#[worker::send]
pub async fn html(State(state): State<AppState>, headers: HeaderMap) -> Result<Response, ApiError> {
    let member = resolve_optional_session(&state, &headers)
        .await?
        .filter(|s| {
            has_accepted_current_terms(s.user.terms_version.as_deref(), s.user.terms_accepted_at)
        });
    if member
        .as_ref()
        .is_some_and(|s| s.user.role.as_deref() != Some("admin"))
    {
        let mut response = Redirect::temporary("/").into_response();
        response.headers_mut().insert(
            header::CACHE_CONTROL,
            http::HeaderValue::from_static("private, no-store"),
        );
        return Ok(response);
    }
    super::seo::member_shell(
        &state,
        StatusCode::OK,
        &PageMetadata::noindex("Review requests", SITE_DESCRIPTION),
        "routes/admin-requests-route.tsx",
    )
    .await
}

#[worker::send]
pub async fn queue(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let session = require_admin_session(&state, &headers).await?;
    let pairs = super::member_pages::parse_query_map(uri.query().unwrap_or(""));
    let parse = |k| {
        super::member_pages::first_param(&pairs, k)
            .and_then(|v| v.parse::<i64>().ok())
            .filter(|n| (0..=9007199254740991).contains(n))
    };
    let cursor = parse("after").filter(|n| *n > 0).zip(parse("at"));
    let data = moderation::review_queue(state.db(), &session.user.id, cursor).await;
    match data {
        Ok(value) => Ok(no_store_json(StatusCode::OK, value)),
        Err(betabook_db::sends::MutationError::Db(e)) => Err(e.into()),
        Err(betabook_db::sends::MutationError::Validation(e)) => {
            Err(ApiError::new(StatusCode::BAD_REQUEST, e).no_store())
        }
    }
}

fn positive(raw: Option<&Value>, msg: &'static str) -> Result<i64, &'static str> {
    raw.and_then(Value::as_f64)
        .filter(|n| n.fract() == 0.0 && (1.0..=9007199254740991.0).contains(n))
        .map(|n| n as i64)
        .ok_or(msg)
}

fn submission(name: &str, args: &[Value]) -> Result<(&'static str, i64, Value), &'static str> {
    let id = positive(
        args.first(),
        if name.starts_with("requestArea") {
            "Area not found"
        } else {
            "Climb not found"
        },
    )?;
    let arg = args.get(1);
    let (kind, payload) = match name {
        "requestAreaEdit" => {
            let f = FormFields::from_arg(arg)?;
            ("area_edit", json!({"name":f.get("name")}))
        }
        "requestAreaDelete" => ("area_delete", json!({})),
        "requestAreaReparent" => (
            "area_reparent",
            json!({"newParentId":positive(arg,"Parent area not found")?}),
        ),
        "requestClimbEdit" => {
            let f = FormFields::from_arg(arg)?;
            (
                "climb_edit",
                json!({"name":f.get("name"),"type":f.get("type"),"grade":f.get("grade")}),
            )
        }
        "requestClimbDelete" => ("climb_delete", json!({})),
        "requestClimbMove" => (
            "climb_move",
            json!({"newAreaId":positive(arg,"Area not found")?}),
        ),
        "requestClimbMerge" => (
            "climb_merge",
            json!({"targetClimbId":positive(arg,"Target climb not found")?,"overrides":args.get(2)}),
        ),
        "requestClimbBreak" => {
            let f = FormFields::from_arg(arg)?;
            (
                "climb_break",
                json!({"brokenOn":f.get("brokenOn"),"reason":f.get("reason")}),
            )
        }
        _ => return Err("Invalid request type"),
    };
    Ok((kind, id, payload))
}

pub(super) async fn request(
    state: &AppState,
    headers: &HeaderMap,
    name: &str,
    args: &[Value],
) -> Result<Response, ApiError> {
    let session = match require_member_session(state, headers).await {
        Ok(s) => s,
        Err(e) => return crate::routes::actions::session_error(e),
    };
    let (kind, id, input) = match submission(name, args) {
        Ok(v) => v,
        Err(e) => return Ok(action_err(e)),
    };
    let res = moderation::submit(
        state.db(),
        &session.user.id,
        kind,
        id,
        input,
        &today_utc(state),
    )
    .await;
    map_mutation_result(res, |status| action_value(json!({"status":status})))
}

pub(super) async fn review(
    state: &AppState,
    headers: &HeaderMap,
    name: &str,
    args: &[Value],
) -> Result<Response, ApiError> {
    let session = match require_admin_session(state, headers).await {
        Ok(s) => s,
        Err(e) => return crate::routes::actions::session_error(e),
    };
    let id = match positive(args.first(), "Request not found") {
        Ok(i) => i,
        Err(e) => return Ok(action_err(e)),
    };
    let approve = name == "approveChangeRequest";
    let note = args
        .get(1)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .map(|s| {
            s.chars()
                .scan(0, |len, c| {
                    *len += c.len_utf16();
                    (*len <= 2000).then_some(c)
                })
                .collect()
        });
    let decision = match moderation::review(
        state.db(),
        &session.user.id,
        id,
        approve,
        note,
        &today_utc(state),
    )
    .await
    {
        Ok(d) => d,
        Err(betabook_db::sends::MutationError::Validation(e)) => return Ok(action_err(e)),
        Err(betabook_db::sends::MutationError::Db(e)) => return Err(e.into()),
    };
    if let Some(email) = decision.email {
        let background = state.clone();
        state.ctx().wait_until(async move {
            if notify_moderation_decision(&background, &email)
                .await
                .is_err()
            {
                worker::console_error!("Moderation decision email failed");
            }
        });
    }
    if approve {
        Ok(action_value(
            json!({"decision":if decision.awaiting{"awaiting"}else{"applied"}}),
        ))
    } else {
        Ok(action_ok())
    }
}
