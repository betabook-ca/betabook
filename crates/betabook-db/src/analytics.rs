use crate::content_access::{companions_json_sql, journal_visible_sql};
use crate::executor::{DbError, DbExecutor, DbParam};
use crate::sends::journal_hashtags_condition;
use serde_json::{Value, json};

/// A trip supplies a date window; the full profile also includes undated sends.
pub(crate) async fn send_rows<D: DbExecutor>(
    db: &D,
    predicate: &str,
    params: &[DbParam],
) -> Result<Vec<Value>, DbError> {
    let sql = format!("SELECT c.id, c.name, c.type, s.suggested_grade, c.area_id, a.name area_name, s.ascent_style, s.date_sent
        FROM sends s JOIN climbs c ON c.id=s.climb_id JOIN areas a ON a.id=c.area_id
        WHERE {predicate} ORDER BY s.date_sent, s.id");
    let mut sends = Vec::new();
    for row in db.query_all(&sql, params).await? {
        sends.push(json!({
            "climbId": row.get_i64("id")?,
            "climbName": row.get_string("name")?,
            "climbType": row.get_string("type")?,
            "suggestedGrade": row.get_opt_i64("suggested_grade")?,
            "areaId": row.get_i64("area_id")?,
            "areaName": row.get_string("area_name")?,
            "ascentStyle": row.get_string("ascent_style")?,
            "dateSent": row.get_opt_string("date_sent")?,
        }));
    }
    Ok(sends)
}

pub async fn profile_sends<D: DbExecutor>(
    db: &D,
    owner: &str,
    viewer: &str,
    tags: &[String],
) -> Result<Vec<Value>, DbError> {
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
) -> Result<Vec<Value>, DbError> {
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
        let companions = serde_json::from_str::<Value>(&row.get_string("companions")?)?;
        sessions.push(json!({
            "id": row.get_i64("id")?,
            "entryDate": row.get_string("entry_date")?,
            "climbId": row.get_i64("climb_id")?,
            "climbName": row.get_string("name")?,
            "climbType": row.get_string("type")?,
            "sent": row.get_bool("sent")?,
            "isAscent": row.get_bool("is_ascent")?,
            "companions": companions,
        }));
    }
    Ok(sessions)
}

pub async fn overview<D: DbExecutor>(
    db: &D,
    owner: &str,
    viewer: &str,
    month: &str,
) -> Result<Value, DbError> {
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
    Ok(json!({
        "sendCount": send_stats.get_i64("sends")?,
        "areaCount": send_stats.get_i64("areas")?,
        "firstYear": first.and_then(|date| date.get(..4)?.parse::<i32>().ok()),
        "daysOut": days_out,
        "lastOut": last_out,
        "daysThisMonth": recent,
        "month": month,
    }))
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
