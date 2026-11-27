use axum::{
    Json,
    body::Body,
    extract::{Path, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use betabook_db::auth::record_terms_acceptance;
use betabook_db::social::{dismiss_feature_announcement, upsert_product_tour_status};
use betabook_domain::terms::TERMS_VERSION;
use serde::Deserialize;
use serde_json::{Value, json};
use url::Url;

use crate::auth::session::{require_member_session, resolve_optional_session};
use crate::state::{ApiError, AppState, http_post_json};

const MAX_ERROR_BODY_BYTES: usize = 4096;
const CONTACT_TO_EMAIL: &str = "hello@betabook.ca";
const CONTACT_FROM_EMAIL: &str = "Betabook <noreply@betabook.ca>";
const MIN_CONTACT_FILL_MS: f64 = 2000.0;

fn action_ok() -> Response {
    let mut resp = (StatusCode::OK, Json(json!({ "ok": true }))).into_response();
    resp.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store"),
    );
    resp
}

fn action_err(message: impl Into<String>) -> Response {
    let mut resp = (
        StatusCode::OK,
        Json(json!({ "ok": false, "error": message.into() })),
    )
        .into_response();
    resp.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store"),
    );
    resp
}

#[worker::send]
pub async fn client_errors(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    let origin = headers.get(header::ORIGIN).and_then(|v| v.to_str().ok());
    if origin != Some(state.request_origin.as_str()) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let Ok(bytes) = axum::body::to_bytes(body, MAX_ERROR_BODY_BYTES).await else {
        return StatusCode::PAYLOAD_TOO_LARGE.into_response();
    };
    let Ok(report) = serde_json::from_slice::<Value>(&bytes) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    if !report.is_object() {
        return StatusCode::BAD_REQUEST.into_response();
    }
    worker::console_error!("client-error: {report}");
    StatusCode::NO_CONTENT.into_response()
}

#[derive(Deserialize)]
pub struct ActionCallBody {
    #[serde(default)]
    args: Vec<Value>,
}

#[derive(Deserialize)]
struct ContactPayload {
    name: Option<String>,
    email: Option<String>,
    message: Option<String>,
    website: Option<String>,
    elapsed: Option<f64>,
}

async fn handle_contact(state: &AppState, payload: Value) -> Result<Response, ApiError> {
    let parsed: ContactPayload = serde_json::from_value(payload).unwrap_or(ContactPayload {
        name: None,
        email: None,
        message: None,
        website: None,
        elapsed: None,
    });

    let honeypot = parsed.website.as_deref().map(str::trim).unwrap_or("");
    let elapsed = parsed.elapsed.unwrap_or(0.0);
    if !honeypot.is_empty() || !elapsed.is_finite() || elapsed < MIN_CONTACT_FILL_MS {
        return Ok(action_ok());
    }

    let name = parsed
        .name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if let Some(n) = name
        && n.chars().count() > 100
    {
        return Ok(action_err("Name must be 100 characters or fewer"));
    }

    let email = parsed.email.as_deref().map(str::trim).unwrap_or("");
    if email.is_empty() {
        return Ok(action_err("Email is required"));
    }
    if email.chars().count() > 254 {
        return Ok(action_err("Email must be 254 characters or fewer"));
    }
    let valid_email = !email
        .chars()
        .any(|c| c.is_whitespace() || "<>,".contains(c))
        && email
            .split_once('@')
            .is_some_and(|(local, domain)| !local.is_empty() && domain.contains('.'));
    if !valid_email {
        return Ok(action_err("Enter a valid email address"));
    }

    let message = parsed.message.as_deref().map(str::trim).unwrap_or("");
    if message.is_empty() {
        return Ok(action_err("Message is required"));
    }
    if message.chars().count() > 5000 {
        return Ok(action_err("Message must be 5000 characters or fewer"));
    }

    let from_label: String = name
        .unwrap_or(email)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(60)
        .collect();
    let subject = format!("Betabook contact: {from_label}");
    let text = format!(
        "From: {}\nEmail: {email}\n\n{message}",
        name.unwrap_or("(no name given)")
    );

    if let Some(api_key) = state.env_var("RESEND_API_KEY") {
        let body = json!({
            "from": CONTACT_FROM_EMAIL,
            "to": [CONTACT_TO_EMAIL],
            "reply_to": email,
            "subject": subject,
            "text": text,
        });
        let (status, resp_text) =
            http_post_json("https://api.resend.com/emails", Some(&api_key), &body).await?;
        if !(200..300).contains(&status) {
            return Err(ApiError::internal(format!(
                "Resend rejected contact email: {status} {resp_text}"
            )));
        }
    } else {
        let base_url = state.auth_url();
        let parsed_url = Url::parse(&base_url).map_err(ApiError::internal)?;
        let is_local = matches!(
            parsed_url.host_str(),
            Some("localhost" | "127.0.0.1" | "[::1]")
        );
        if !is_local {
            return Err(ApiError::internal("Email delivery is not configured"));
        }
        worker::console_log!("[dev] {subject} to {CONTACT_TO_EMAIL}, reply to {email}:\n{text}");
    }

    Ok(action_ok())
}

#[worker::send]
pub async fn dispatch_action(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
    Json(body): Json<ActionCallBody>,
) -> Result<Response, ApiError> {
    match name.as_str() {
        "acceptTerms" => {
            let Some(session) = resolve_optional_session(&state, &headers).await? else {
                return Ok(action_err("Not signed in"));
            };
            let version = body.args.first().and_then(Value::as_str);
            let agreed = body.args.get(1).and_then(Value::as_bool) == Some(true);
            if !agreed {
                return Ok(action_err("Select the agreement checkbox to continue."));
            }
            if version != Some(TERMS_VERSION) {
                return Ok(action_err(
                    "The terms have changed. Reload this page to review the current version.",
                ));
            }
            record_terms_acceptance(state.db(), &session.user.id, state.now_ms()).await?;
            Ok(action_ok())
        }
        "submitContactMessage" => {
            let payload = body.args.into_iter().next().unwrap_or(Value::Null);
            handle_contact(&state, payload).await
        }
        "dismissFeatureAnnouncement" => {
            let session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            let Some(feature_id) = body.args.first().and_then(Value::as_str) else {
                return Ok(action_err("Invalid feature announcement."));
            };
            if feature_id != "analytics-customize" {
                return Ok(action_err("Invalid feature announcement."));
            }
            dismiss_feature_announcement(state.db(), &session.user.id, feature_id).await?;
            Ok(action_ok())
        }
        "saveProductTourStatus" => {
            let session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            let id = body.args.first().and_then(Value::as_str).unwrap_or("");
            let version = body.args.get(1).and_then(Value::as_i64).unwrap_or(0);
            let status = body.args.get(2).and_then(Value::as_str).unwrap_or("");
            if id != "journal" || version != 7 {
                return Ok(action_err(
                    "This tour has changed. Reload the page and try again.",
                ));
            }
            if status != "dismissed" && status != "completed" {
                return Ok(action_err("Invalid product tour status"));
            }
            upsert_product_tour_status(state.db(), &session.user.id, id, version, status).await?;
            Ok(action_ok())
        }
        _ => Ok(action_err(
            "This action is being migrated onto the Rust Worker in the next stack layer.",
        )),
    }
}
