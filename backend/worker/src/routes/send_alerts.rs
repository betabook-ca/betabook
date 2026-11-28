//! Friend send alerts: background fan-out after a new send, the notifications
//! page and the unread badge count.
use axum::{
    extract::{OriginalUri, State},
    http::{HeaderMap, StatusCode},
    response::Response,
};
use betabook_db::send_alerts;
use serde_json::json;
use url::form_urlencoded;

use super::member_pages::no_store_json;
use crate::auth::session::require_member_session;
use crate::state::{ApiError, AppState};

/// Alert the climber's friends after the response. A failure leaves the send
/// committed; the next same-day send retries the fan-out.
pub(super) fn schedule(state: &AppState, actor: &str, day: &str) {
    if !send_alerts::alerts_for_day(day, &super::actions::today_utc(state)) {
        return;
    }
    let background = state.clone();
    let actor = actor.to_owned();
    let day = day.to_owned();
    state.ctx().wait_until(async move {
        let result = send_alerts::fan_out(background.db(), &actor, &day, background.now_ms()).await;
        if let Err(error) = result {
            crate::observability::background_error("send_alerts", error);
        }
    });
}

#[worker::send]
pub async fn notifications(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let count_view = form_urlencoded::parse(uri.query().unwrap_or("").as_bytes())
        .any(|(k, v)| k == "view" && v == "count");
    if count_view {
        let count = send_alerts::unread_count(state.db(), &session.user.id).await?;
        return Ok(no_store_json(
            StatusCode::OK,
            json!({ "userId": session.user.id, "count": count }),
        ));
    }
    let alerts = send_alerts::list(state.db(), &session.user.id).await?;
    Ok(no_store_json(StatusCode::OK, json!({ "alerts": alerts })))
}
