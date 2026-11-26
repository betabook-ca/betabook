//! The live goal-period projection used by both pagination and achievements.
#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
enum GoalKind {
    Volume,
    Grade,
    Training,
    Days,
    NewAreas,
}
#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "lowercase")]
enum GoalCadence {
    None,
    Week,
    Month,
    Year,
}
#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "lowercase")]
enum GoalTimeframe {
    Week,
    Month,
    Year,
    Custom,
}
#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
enum GoalGradeMatch {
    Exact,
    AtLeast,
}

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalRecord {
    id: i64,
    user_id: String,
    kind: GoalKind,
    target: i64,
    #[cfg_attr(
        feature = "api-spec",
        schemars(with = "Option<betabook_domain::grades::ClimbType>")
    )]
    discipline: Option<String>,
    grade: Option<i64>,
    timeframe: GoalTimeframe,
    repeat: GoalCadence,
    start_date: String,
    end_date: String,
    timezone: String,
    grade_match: GoalGradeMatch,
    tags: Vec<String>,
    archived: bool,
    recurring_end_date: Option<String>,
    today: String,
    period_start: String,
    period_end: String,
    progress: i64,
    completed_date: Option<String>,
}

/// Parse the SQLite text discriminator into the same enum used for serialization.
fn enum_column<T: serde::de::DeserializeOwned>(
    row: &crate::DbRow,
    column: &'static str,
) -> Result<T, crate::DbError> {
    let value = row.get_string(column)?;
    T::deserialize(serde::de::value::StrDeserializer::<serde::de::value::Error>::new(&value))
        .map_err(|_| crate::DbError::Column(column))
}

impl GoalRecord {
    pub(super) fn from_row(row: &crate::DbRow) -> Result<Self, crate::DbError> {
        Ok(Self {
            id: row.get_i64("id")?,
            user_id: row.get_string("userId")?,
            kind: enum_column(row, "kind")?,
            target: row.get_i64("target")?,
            discipline: row.get_opt_string("discipline")?,
            grade: row.get_opt_i64("grade")?,
            timeframe: enum_column(row, "timeframe")?,
            repeat: enum_column(row, "repeat")?,
            start_date: row.get_string("startDate")?,
            end_date: row.get_string("endDate")?,
            timezone: row.get_string("timezone")?,
            grade_match: enum_column(row, "gradeMatch")?,
            archived: row.get_bool("archived")?,
            recurring_end_date: row.get_opt_string("recurringEndDate")?,
            today: row.get_string("today")?,
            period_start: row.get_string("periodStart")?,
            period_end: row.get_string("periodEnd")?,
            progress: row.get_i64("progress")?,
            completed_date: row.get_opt_string("completedDate")?,
            tags: serde_json::from_str(&row.get_string("tags")?)?,
        })
    }
}
