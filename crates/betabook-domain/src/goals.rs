//! Civil-date windows and validation shared by goal reads and writes.
use serde::Deserialize;
use serde_json::Value;
use time::{Date, Duration, Month};

use crate::grades::{ClimbType, native_grade_array};
use crate::sends::{is_real_iso_date, normalize_tags};

const ORDER: &str = "End date must be on or after start date.";

fn date(value: &str) -> Option<Date> {
    if !is_real_iso_date(value) {
        return None;
    }
    Date::from_calendar_date(
        value.get(..4)?.parse().ok()?,
        Month::try_from(value.get(5..7)?.parse::<u8>().ok()?).ok()?,
        value.get(8..)?.parse().ok()?,
    )
    .ok()
}

pub fn next_date(value: &str) -> Option<String> {
    date(value)?.next_day().map(|d| d.to_string())
}

pub fn missed_archive_date(deadline: &str) -> Option<String> {
    let first = date(deadline)?.next_day()?;
    let month = first.month().next();
    let year = first.year() + i32::from(month == Month::January);
    let day = first.day().min(month.length(year));
    Date::from_calendar_date(year, month, day)
        .ok()
        .map(|d| d.to_string())
}

pub fn goal_window(
    timeframe: &str,
    today: &str,
    end: &str,
    start: Option<&str>,
) -> Result<(String, String), String> {
    let invalid = || "Choose valid start and end dates.".to_string();
    let current = date(today).ok_or_else(invalid)?;
    let (start, end) = match timeframe {
        "custom" => {
            let start = date(start.unwrap_or(today)).ok_or_else(invalid)?;
            let end = date(end).ok_or_else(invalid)?;
            if end < start {
                return Err(ORDER.into());
            }
            (start, end)
        }
        "week" => {
            let monday = current
                .checked_sub(Duration::days(i64::from(
                    current.weekday().number_days_from_monday(),
                )))
                .ok_or_else(invalid)?;
            (
                monday,
                monday.checked_add(Duration::days(6)).ok_or_else(invalid)?,
            )
        }
        "month" => (
            current.replace_day(1).map_err(|_| invalid())?,
            current
                .replace_day(current.month().length(current.year()))
                .map_err(|_| invalid())?,
        ),
        "year" => (
            Date::from_calendar_date(current.year(), Month::January, 1).map_err(|_| invalid())?,
            Date::from_calendar_date(current.year(), Month::December, 31).map_err(|_| invalid())?,
        ),
        _ => return Err(invalid()),
    };
    Ok((start.to_string(), end.to_string()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalInput {
    pub kind: String,
    pub target: i64,
    #[serde(default, deserialize_with = "tags_or_empty")]
    pub tags: Vec<String>,
    pub discipline: Option<ClimbType>,
    pub grade: Option<i64>,
    #[serde(default = "exact")]
    pub grade_match: String,
    pub timeframe: String,
    pub start_date: Option<String>,
    pub end_date: String,
    pub recurring_end_date: Option<String>,
    pub repeat: String,
    pub timezone: String,
}

fn tags_or_empty<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Vec<String>, D::Error> {
    Ok(Option::<Vec<String>>::deserialize(d)?.unwrap_or_default())
}

fn exact() -> String {
    "exact".into()
}

impl GoalInput {
    pub fn parse(raw: &Value) -> Result<Self, String> {
        let invalid = || "Check your goal fields.".to_string();
        if raw.get("grade").is_none()
            || raw.get("discipline").is_none()
            || raw.get("startDate").is_some_and(Value::is_null)
        {
            return Err(invalid());
        }
        let mut input: Self = serde_json::from_value(raw.clone()).map_err(|_| invalid())?;
        if !matches!(
            input.kind.as_str(),
            "volume" | "grade" | "training" | "days" | "new-areas"
        ) || !(1..=1000).contains(&input.target)
            || !matches!(
                input.timeframe.as_str(),
                "week" | "month" | "year" | "custom"
            )
            || !matches!(input.repeat.as_str(), "none" | "week" | "month" | "year")
            || !matches!(input.grade_match.as_str(), "exact" | "at-least")
            || input.timezone.is_empty()
            || input.timezone.len() > 100
            || !is_real_iso_date(&input.end_date)
            || input
                .start_date
                .as_ref()
                .is_some_and(|s| !is_real_iso_date(s))
            || input
                .recurring_end_date
                .as_ref()
                .is_some_and(|s| !is_real_iso_date(s))
        {
            return Err(invalid());
        }
        input.tags = normalize_tags(&input.tags)?;
        input.tags.sort();
        if input.timeframe == "custom"
            && input.repeat == "none"
            && input
                .start_date
                .as_ref()
                .is_some_and(|s| s > &input.end_date)
        {
            return Err(ORDER.into());
        }
        if input.repeat == "none" && input.recurring_end_date.is_some() {
            return Err("Only recurring goals have a recurrence end date.".into());
        }
        if input.grade_match == "at-least" && (input.kind != "volume" || input.grade.is_none()) {
            return Err("Choose a grade for an or-harder volume goal.".into());
        }
        if matches!(input.kind.as_str(), "volume" | "grade") {
            if !input.discipline.is_some_and(|d| {
                input
                    .grade
                    .is_none_or(|g| (0..native_grade_array(d).len() as i64).contains(&g))
            }) {
                return Err("Choose a valid discipline and grade.".into());
            }
        } else if input.discipline.is_some() || input.grade.is_some() {
            return Err("Only climbing goals can specify a grade.".into());
        }
        if input.kind == "grade" {
            if input.grade.is_none() || input.target != 1 {
                return Err("A new-grade goal needs one climb at a specific grade.".into());
            }
            if input.repeat != "none" {
                return Err("A first-grade goal cannot recur.".into());
            }
        }
        if input.kind == "training" && (input.repeat == "year" || input.timeframe == "year") {
            return Err("Choose a week, month, or custom dates for training.".into());
        }
        Ok(input)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn clamps_decision_month_and_anchors_to_monday() {
        assert_eq!(
            missed_archive_date("2024-01-30").as_deref(),
            Some("2024-02-29")
        );
        assert_eq!(
            goal_window("week", "2023-01-01", "", None).expect("valid week"),
            ("2022-12-26".into(), "2023-01-01".into())
        );
        assert_eq!(
            goal_window("month", "2024-02-01", "", None).expect("valid month"),
            ("2024-02-01".into(), "2024-02-29".into())
        );
    }
}
