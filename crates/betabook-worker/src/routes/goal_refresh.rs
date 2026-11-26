use axum::{http::HeaderMap, response::Response};
use betabook_db::{DbError, goal_achievements};
use serde_json::Value;

use super::actions::{action_err, action_ok};
use crate::auth::session::require_member_session;
use crate::state::{ApiError, AppState, now_iso_from_ms};
use worker::js_sys::{
    self, Array, Date, Function,
    Intl::{
        DateTimeFormat, DateTimeFormatOptions, DateTimeFormatPart, DateTimeFormatPartType,
        DayFormat, MonthFormat, YearFormat,
    },
    Reflect,
};
use worker::wasm_bindgen::{JsCast, JsValue};

/// Resolve one instant in the goal's IANA timezone using the Worker's ICU data.
pub(crate) fn today(timezone: &str, now_ms: i64) -> Result<String, DbError> {
    let invalid_zone = || DbError::Query("Invalid timezone".to_owned());
    let options = DateTimeFormatOptions::new();
    options.set_time_zone(timezone);
    options.set_year(YearFormat::Numeric);
    options.set_month(MonthFormat::TwoDigit);
    options.set_day(DayFormat::TwoDigit);

    // The typed js-sys constructor does not catch the RangeError for an
    // unrecognized user-supplied timezone. Reflect::construct does.
    let intl = Reflect::get(&js_sys::global(), &"Intl".into()).map_err(|_| invalid_zone())?;
    let constructor: Function = Reflect::get(&intl, &"DateTimeFormat".into())
        .map_err(|_| invalid_zone())?
        .dyn_into()
        .map_err(|_| invalid_zone())?;
    let formatter: DateTimeFormat =
        Reflect::construct(&constructor, &Array::of2(&"en-CA".into(), &options))
            .map_err(|_| invalid_zone())?
            .unchecked_into();
    let parts = formatter.format_to_parts(&Date::new(&JsValue::from_f64(now_ms as f64)));
    let mut date = [String::new(), String::new(), String::new()];
    for part in parts {
        let part: DateTimeFormatPart = part.unchecked_into();
        let index = match part.type_() {
            DateTimeFormatPartType::Year => 0,
            DateTimeFormatPartType::Month => 1,
            DateTimeFormatPartType::Day => 2,
            _ => continue,
        };
        date[index] = part.value().into();
    }
    Ok(date.join("-"))
}

/// Refresh after the response. A failed projection leaves the committed
/// journal/write intact; the next relevant owner write or Goals visit retries.
pub(super) fn schedule(state: &AppState, owner: &str) {
    let background = state.clone();
    let owner = owner.to_owned();
    state.ctx().wait_until(async move {
        let now = background.now_ms();
        let result =
            goal_achievements::refresh(background.db(), &owner, &now_iso_from_ms(now), &|zone| {
                today(zone, now)
            })
            .await;
        if let Err(error) = result {
            crate::observability::background_error("goal_refresh", error);
        }
    });
}

pub(super) async fn acknowledge(
    state: &AppState,
    headers: &HeaderMap,
    keys: Option<&Value>,
) -> Result<Response, ApiError> {
    let session = match require_member_session(state, headers).await {
        Ok(session) => session,
        Err(error) => return crate::routes::actions::session_error(error),
    };
    let Some(keys) = goal_achievements::AchievementKey::parse_many(keys) else {
        return Ok(action_err("Invalid achievements."));
    };
    goal_achievements::acknowledge(
        state.db(),
        &session.user.id,
        &keys,
        &now_iso_from_ms(state.now_ms()),
    )
    .await?;
    Ok(action_ok())
}
