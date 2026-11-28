//! Friend send alerts: background fan-out and web push after a new send, the
//! notifications page and the unread badge count.
use axum::{
    extract::{OriginalUri, State},
    http::{HeaderMap, StatusCode},
    response::Response,
};
use betabook_db::send_alerts::{self, PushTarget};
use betabook_domain::web_push::{self, PushFailure, PushOutcome, Subscription, Vapid};
use futures_util::{StreamExt, stream};
use serde_json::json;
use url::form_urlencoded;
use worker::{Fetch, Headers, Method, Request, RequestInit};

use super::member_pages::no_store_json;
use crate::auth::session::require_member_session;
use crate::state::{ApiError, AppState};

/// Push services drop a message nobody fetched within a day.
const PUSH_TTL_SECS: &str = "86400";
/// Deliveries in flight at once, so a large friend list finishes inside `waitUntil`.
const PUSH_CONCURRENCY: usize = 8;
/// Devices pushed per send. Each delivery is a subrequest, and a Worker
/// invocation has a subrequest budget; the in-app alert still reaches everyone.
const MAX_PUSH_DELIVERIES: usize = 400;

/// The configured VAPID identity, or `None` where push is not set up.
pub(crate) fn vapid(state: &AppState) -> Option<Vapid> {
    let key = state.env_var("VAPID_PRIVATE_KEY")?;
    let subject = state.env_var("VAPID_SUBJECT")?;
    match Vapid::new(&key, &subject) {
        Ok(vapid) => Some(vapid),
        Err(error) => {
            crate::observability::background_error("web_push_config", error);
            None
        }
    }
}

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
        let recipients =
            send_alerts::fan_out(background.db(), &actor, &day, background.now_ms()).await;
        let result = match recipients {
            Ok(recipients) => push(&background, &actor, &day, &recipients).await,
            Err(error) => Err(error.into()),
        };
        if let Err(error) = result {
            crate::observability::background_error("send_alerts", error);
        }
    });
}

async fn push(
    state: &AppState,
    actor: &str,
    day: &str,
    recipients: &[String],
) -> Result<(), ApiError> {
    let Some(vapid) = vapid(state) else {
        return Ok(());
    };
    let targets = send_alerts::push_targets(state.db(), recipients).await?;
    if targets.is_empty() {
        return Ok(());
    }
    let Some(summary) = send_alerts::push_summary(state.db(), actor, day).await? else {
        return Ok(());
    };
    let (title, body) = if summary.sends == 1 {
        (
            format!("{} sent {}", summary.name, summary.latest_climb),
            "Tap to see the day.".to_owned(),
        )
    } else {
        (
            format!("{} sent {} climbs", summary.name, summary.sends),
            format!("Latest: {}.", summary.latest_climb),
        )
    };
    let payload = json!({
        "title": title,
        "body": body,
        "url": format!("/users/{actor}/sends?date={day}"),
        "tag": format!("send-alert:{actor}:{day}"),
    })
    .to_string();
    let now_secs = state.now_ms() / 1000;
    let skipped = targets.len().saturating_sub(MAX_PUSH_DELIVERIES);
    let failures: Vec<PushFailure> = stream::iter(targets.iter().take(MAX_PUSH_DELIVERIES))
        .map(|target| deliver(state, &vapid, target, payload.as_bytes(), now_secs))
        .buffer_unordered(PUSH_CONCURRENCY)
        .filter_map(|result| async move { result.err() })
        .collect()
        .await;
    for failure in failures {
        crate::observability::background_error("web_push_delivery", failure);
    }
    if skipped > 0 {
        crate::observability::background_error(
            "web_push_delivery",
            format!("skipped {skipped} devices over the per-send limit"),
        );
    }
    Ok(())
}

async fn deliver(
    state: &AppState,
    vapid: &Vapid,
    target: &PushTarget,
    payload: &[u8],
    now_secs: i64,
) -> Result<(), PushFailure> {
    let (Some(audience), Ok(subscription)) = (
        web_push::push_service_audience(&target.endpoint),
        Subscription::parse(&target.p256dh, &target.auth),
    ) else {
        return forget(state, target).await;
    };
    let body = web_push::encrypt(&subscription, payload).map_err(|_| PushFailure::Encrypt)?;
    let status = post(
        &target.endpoint,
        &vapid.authorization(&audience, now_secs),
        &body,
    )
    .await
    .map_err(|_| PushFailure::Request)?;
    match PushOutcome::from_status(status) {
        PushOutcome::Delivered => Ok(()),
        PushOutcome::Gone => forget(state, target).await,
        PushOutcome::Failed(status) => Err(PushFailure::Status(status)),
    }
}

async fn forget(state: &AppState, target: &PushTarget) -> Result<(), PushFailure> {
    send_alerts::forget_push_endpoint(state.db(), &target.endpoint)
        .await
        .map_err(|_| PushFailure::Storage)
}

async fn post(endpoint: &str, authorization: &str, body: &[u8]) -> worker::Result<u16> {
    let headers = Headers::new();
    headers.set("Authorization", authorization)?;
    headers.set("Content-Encoding", "aes128gcm")?;
    headers.set("Content-Type", "application/octet-stream")?;
    headers.set("TTL", PUSH_TTL_SECS)?;
    headers.set("Urgency", "normal")?;
    let mut init = RequestInit::new();
    init.with_method(Method::Post)
        .with_headers(headers)
        .with_body(Some(worker::js_sys::Uint8Array::from(body).into()));
    let response = Fetch::Request(Request::new_with_init(endpoint, &init)?)
        .send()
        .await?;
    Ok(response.status_code())
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
