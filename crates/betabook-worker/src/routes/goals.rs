use axum::{
    extract::{OriginalUri, Path, State},
    http::{HeaderMap, StatusCode},
    response::Response,
};
use betabook_db::{
    content_access::can_read_journal, goal_history::PAGE_SIZE, goals, journal::get_user_hashtags,
};
use betabook_domain::{
    public_catalog::{MAX_PAGINATION_OFFSET, parse_id, parse_offset},
    sends::is_real_iso_date,
};
use serde_json::{Value, json};

use super::actions::{
    JOURNAL_RATE_LIMIT_MESSAGE, action_err, action_ok, action_value, allow_rate_limit,
    map_mutation_result,
};
use super::goal_refresh;
use super::member_pages::{first_param, no_store_json, parse_query_map};
use crate::{
    auth::session::require_member_session,
    state::{ApiError, AppState},
};

fn bad_request(message: &str) -> ApiError {
    ApiError::new(StatusCode::BAD_REQUEST, message).no_store()
}

#[worker::send]
pub async fn overview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(owner): Path<String>,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    if session.user.id != owner {
        return Err(ApiError::new(StatusCode::NOT_FOUND, "Climber not found").no_store());
    }
    let now = state.now_ms();
    let today = |zone: &str| goal_refresh::today(zone, now);
    let timezone = state.cf_timezone.as_deref().unwrap_or("UTC");
    let summary = goals::overview(state.db(), &owner, &owner, &today).await?;
    let grades = goals::next_grades(state.db(), &owner, &owner).await?;
    let tags = get_user_hashtags(state.db(), &owner, Some(&owner), false, true).await?;
    goal_refresh::schedule(&state, &owner);
    Ok(no_store_json(
        StatusCode::OK,
        json!({"initialActive":summary["active"],"initialCompleted":summary["completed"],"nextGrades":grades,"availableTags":tags,"timezone":timezone,"today":today(timezone)?}),
    ))
}

#[worker::send]
pub async fn read(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(owner): Path<String>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let viewer = &session.user.id;
    let db = state.db();
    if !can_read_journal(db, &owner, Some(viewer)).await? {
        return Err(ApiError::new(StatusCode::NOT_FOUND, "Journal not found").no_store());
    }
    let pairs = parse_query_map(uri.query().unwrap_or(""));
    let param = |key: &str| first_param(&pairs, key);
    let year = param("year")
        .map(|v| {
            v.trim()
                .parse::<f64>()
                .ok()
                .filter(|n| n.fract() == 0.0 && (1.0..=9999.0).contains(n))
                .map(|n| n as i64)
                .ok_or_else(|| bad_request("Invalid page"))
        })
        .transpose()?;
    let offset = parse_offset(param("offset"));
    let anchor = param("anchor");
    if anchor.is_some_and(|month| !is_real_iso_date(&format!("{month}-01"))) {
        return Err(bad_request("Invalid history cursor"));
    }
    let now = state.now_ms();
    let today = |zone: &str| goal_refresh::today(zone, now);
    let response = if let Some(id) = param("historyId") {
        let id = parse_id(id).ok_or_else(|| bad_request("Invalid goal"))?;
        if let Some(offset) = offset {
            let mut history =
                goals::history(db, &owner, viewer, id, offset, anchor, &today).await?;
            if history["nextOffset"]
                .as_u64()
                .is_some_and(|n| n > MAX_PAGINATION_OFFSET as u64)
            {
                history["hasMore"] = Value::Bool(false);
            }
            history
        } else {
            json!({"periods":[],"hasMore":false})
        }
    } else if let Some(raw_id) = param("goalId") {
        let id = parse_id(raw_id).ok_or_else(|| bad_request("Invalid goal period"))?;
        let start = param("periodStart").unwrap_or("");
        let end = param("periodEnd");
        if !is_real_iso_date(start) || end.is_some_and(|e| !is_real_iso_date(e) || e < start) {
            return Err(bad_request("Invalid goal period"));
        }
        json!({"items":goals::contributions(db,&owner,viewer,id,start,end,&today).await?})
    } else {
        let view = param("view").unwrap_or("active");
        if !matches!(view, "active" | "completed") {
            return Err(bad_request("Invalid page"));
        }
        if let Some(offset) = offset {
            let mut page = goals::page(db, &owner, viewer, view, offset, year, &today).await?;
            if offset + PAGE_SIZE > MAX_PAGINATION_OFFSET {
                page["hasMore"] = Value::Bool(false);
            }
            if viewer == &owner {
                goal_refresh::schedule(&state, &owner);
            }
            page
        } else {
            json!({"goals":[],"hasMore":false})
        }
    };
    Ok(no_store_json(StatusCode::OK, response))
}

pub(super) async fn action(
    state: &AppState,
    headers: &HeaderMap,
    name: &str,
    args: &[Value],
) -> Result<Response, ApiError> {
    let session = match require_member_session(state, headers).await {
        Ok(s) => s,
        Err(e) => return Ok(action_err(e.message)),
    };
    let owner = &session.user.id;
    if name != "deleteGoal" && !allow_rate_limit(state, "JOURNAL_RATE_LIMITER", owner).await {
        return Ok(action_err(JOURNAL_RATE_LIMIT_MESSAGE));
    }
    let positive = |value: &Value| value.as_i64().filter(|n| *n > 0);
    let id = match args.first() {
        Some(Value::Null) if name == "saveGoal" => None,
        Some(v) if positive(v).is_some() => positive(v),
        _ => return Ok(action_err("Goal not found.")),
    };
    let now = state.now_ms();
    let today = |zone: &str| goal_refresh::today(zone, now);
    match (name, id) {
        ("saveGoal", id) => {
            let retry = match args.get(2) {
                None | Some(Value::Null) => None,
                Some(v) => match positive(v) {
                    Some(n) => Some(n),
                    None => return Ok(action_err("Goal not found.")),
                },
            };
            if retry.is_some() && id.is_some() {
                return Ok(action_err("A retry must create a new goal."));
            }
            map_mutation_result(
                goals::save(
                    state.db(),
                    owner,
                    id,
                    args.get(1).unwrap_or(&Value::Null),
                    retry,
                    &today,
                )
                .await,
                |id| {
                    goal_refresh::schedule(state, owner);
                    action_value(id)
                },
            )
        }
        (_, Some(id)) => {
            let result = match name {
                "archiveGoal" => goals::archive(state.db(), owner, id, &today).await,
                "deleteGoal" => goals::delete(state.db(), owner, id).await,
                _ => return Ok(action_err("Unknown goal action")),
            };
            map_mutation_result(result, |()| {
                goal_refresh::schedule(state, owner);
                action_ok()
            })
        }
        _ => Ok(action_err("Goal not found.")),
    }
}
