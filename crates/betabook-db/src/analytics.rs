use crate::content_access::{companions_json_sql, journal_visible_sql};
use crate::executor::{DbError, DbExecutor, DbParam};
use crate::sends::journal_hashtags_condition;
use serde_json::Value;

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsSend {
    climb_id: i64,
    climb_name: String,
    #[cfg_attr(
        feature = "api-spec",
        schemars(with = "betabook_domain::grades::ClimbType")
    )]
    pub(crate) climb_type: String,
    suggested_grade: Option<i64>,
    area_id: i64,
    area_name: String,
    #[cfg_attr(
        feature = "api-spec",
        schemars(with = "betabook_domain::wire::AscentStyle")
    )]
    ascent_style: String,
    date_sent: Option<String>,
}
#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsSession {
    pub(crate) entry_date: String,
    #[cfg_attr(
        feature = "api-spec",
        schemars(with = "betabook_domain::grades::ClimbType")
    )]
    pub(crate) climb_type: String,
    pub(crate) count: i64,
}
#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HighlightSession {
    id: i64,
    pub(crate) entry_date: String,
    climb_id: i64,
    climb_name: String,
    #[cfg_attr(
        feature = "api-spec",
        schemars(with = "betabook_domain::grades::ClimbType")
    )]
    pub(crate) climb_type: String,
    sent: bool,
    is_ascent: bool,
    companions: Vec<crate::feed::JournalCompanion>,
}
#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClimberOverview {
    send_count: i64,
    area_count: i64,
    first_year: Option<i32>,
    days_out: Option<i64>,
    last_out: Option<String>,
    days_this_month: i64,
    month: String,
}

/// A trip supplies a date window; the full profile also includes undated sends.
pub(crate) async fn send_rows<D: DbExecutor>(
    db: &D,
    predicate: &str,
    params: &[DbParam],
) -> Result<Vec<AnalyticsSend>, DbError> {
    let sql = format!("SELECT c.id, c.name, c.type, s.suggested_grade, c.area_id, a.name area_name, s.ascent_style, s.date_sent
        FROM sends s JOIN climbs c ON c.id=s.climb_id JOIN areas a ON a.id=c.area_id
        WHERE {predicate} ORDER BY s.date_sent, s.id");
    let mut sends = Vec::new();
    for row in db.query_all(&sql, params).await? {
        sends.push(AnalyticsSend {
            climb_id: row.get_i64("id")?,
            climb_name: row.get_string("name")?,
            climb_type: row.get_string("type")?,
            suggested_grade: row.get_opt_i64("suggested_grade")?,
            area_id: row.get_i64("area_id")?,
            area_name: row.get_string("area_name")?,
            ascent_style: row.get_string("ascent_style")?,
            date_sent: row.get_opt_string("date_sent")?,
        });
    }
    Ok(sends)
}

pub async fn profile_sends<D: DbExecutor>(
    db: &D,
    owner: &str,
    viewer: &str,
    tags: &[String],
) -> Result<Vec<AnalyticsSend>, DbError> {
    let mut params = vec![owner.into(), viewer.into()];
    let mut condition = "s.user_id=? AND EXISTS (SELECT 1 FROM user u WHERE u.id=s.user_id AND (u.id=? OR u.is_private=0))".to_owned();
    if !tags.is_empty() {
        condition.push_str(" AND ");
        condition.push_str(&crate::sends::send_hashtag_condition_for(
            tags,
            Some(viewer),
            "s",
            &mut params,
        )?);
    }
    send_rows(db, &condition, &params).await
}

/// Each highlight row represents one session. The SPA also groups these same
/// visible rows into date/discipline counts for the dashboard.
pub async fn profile_sessions<D: DbExecutor>(
    db: &D,
    owner: &str,
    viewer: &str,
    tags: &[String],
) -> Result<Vec<HighlightSession>, DbError> {
    let mut params = Vec::new();
    let companions = companions_json_sql(Some(viewer), "j.id", &mut params);
    params.push(owner.into());
    let visible = journal_visible_sql(Some(viewer), "j.user_id", &mut params);
    let tag_filter = if tags.is_empty() {
        String::new()
    } else {
        format!(
            " AND {}",
            journal_hashtags_condition(tags, "j.tags", &mut params)?
        )
    };
    let sql = format!(
        "SELECT j.id, j.entry_date, c.id climb_id, c.name, c.type,
        j.sent, j.is_ascent, {companions} companions FROM journal_entries j
        JOIN climbs c ON c.id=j.climb_id WHERE j.user_id=? AND j.kind='session'
        AND {visible}{tag_filter} ORDER BY j.entry_date, j.id"
    );
    let mut sessions = Vec::new();
    for row in db.query_all(&sql, &params).await? {
        sessions.push(HighlightSession {
            id: row.get_i64("id")?,
            entry_date: row.get_string("entry_date")?,
            climb_id: row.get_i64("climb_id")?,
            climb_name: row.get_string("name")?,
            climb_type: row.get_string("type")?,
            sent: row.get_bool("sent")?,
            is_ascent: row.get_bool("is_ascent")?,
            companions: serde_json::from_str(&row.get_string("companions")?)?,
        });
    }
    Ok(sessions)
}

pub async fn overview<D: DbExecutor>(
    db: &D,
    owner: &str,
    viewer: &str,
    month: &str,
) -> Result<ClimberOverview, DbError> {
    let send_stats = db.query_one("SELECT COUNT(*) sends, COUNT(DISTINCT c.area_id) areas, MIN(s.date_sent) first,
        MAX(s.date_sent) last, COUNT(DISTINCT s.date_sent) FILTER (WHERE substr(s.date_sent,1,7)=?) recent
        FROM sends s JOIN climbs c ON c.id=s.climb_id JOIN user u ON u.id=s.user_id
        WHERE s.user_id=? AND (u.id=? OR u.is_private=0)", &[month.into(), owner.into(), viewer.into()]).await?.ok_or(DbError::Column("sends"))?;
    let mut params = vec![month.into(), owner.into()];
    let vis = journal_visible_sql(Some(viewer), "u.id", &mut params);
    let sql = format!("SELECT MIN(j.entry_date) first,
        MAX(j.entry_date) FILTER (WHERE j.kind='session') last,
        COUNT(DISTINCT j.entry_date) FILTER (WHERE j.kind='session') days,
        COUNT(DISTINCT j.entry_date) FILTER (WHERE j.kind='session' AND substr(j.entry_date,1,7)=?) recent
        FROM user u LEFT JOIN journal_entries j ON j.user_id=u.id WHERE u.id=? AND {vis} GROUP BY u.id");
    let journal = db.query_one(&sql, &params).await?;
    let mut first = send_stats.get_opt_string("first")?;
    let (days_out, last_out, recent) = if let Some(r) = journal {
        if let Some(date) = r.get_opt_string("first")? {
            first = Some(first.map_or(date.clone(), |s| s.min(date)));
        }
        (
            Some(r.get_i64("days")?),
            r.get_opt_string("last")?,
            r.get_i64("recent")?,
        )
    } else {
        (
            None,
            send_stats.get_opt_string("last")?,
            send_stats.get_i64("recent")?,
        )
    };
    Ok(ClimberOverview {
        send_count: send_stats.get_i64("sends")?,
        area_count: send_stats.get_i64("areas")?,
        first_year: first.and_then(|date| date.get(..4)?.parse::<i32>().ok()),
        days_out,
        last_out,
        days_this_month: recent,
        month: month.to_owned(),
    })
}

pub async fn owner_preferences<D: DbExecutor>(
    db: &D,
    owner: &str,
) -> Result<(Option<betabook_domain::analytics_layout::Layout>, bool), DbError> {
    let row = db.query_one("SELECT (SELECT layout FROM user_analytics_layouts WHERE user_id=?) layout,
        EXISTS(SELECT 1 FROM feature_announcement_dismissals WHERE user_id=? AND feature_id='analytics-customize') dismissed",
        &[owner.into(),owner.into()]).await?.ok_or(DbError::Column("layout"))?;
    Ok((
        row.get_opt_string("layout")?
            .and_then(|s| serde_json::from_str(&s).ok()),
        row.get_bool("dismissed")?,
    ))
}

pub async fn save_layout<D: DbExecutor>(
    db: &D,
    owner: &str,
    layout: &Value,
) -> Result<(), DbError> {
    db.execute("INSERT INTO user_analytics_layouts(user_id,layout) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET layout=excluded.layout",
        &[owner.into(),serde_json::to_string(layout)?.into()]).await?;
    Ok(())
}
