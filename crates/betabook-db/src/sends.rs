use std::collections::BTreeMap;

use betabook_domain::grades::{ClimbType, GradePreferences, format_grade};
use betabook_domain::public_catalog::MAX_RATING;
use betabook_domain::sends::{
    ASCENT_STYLES, ValidatedSendInput, assert_loggable_on_climb, parse_video_list_json,
};
use serde::{Deserialize, Serialize};

use crate::content_access::{opt_text, send_comment_visible_sql};
use crate::executor::{DbError, DbExecutor, DbParam};
use crate::fts::{clamp_page_size, discipline_grade_conditions, to_fts_prefix_query};
use crate::member_catalog::{area_id_condition, area_name_condition};
use crate::social::get_climb_send_stats;

pub const CLIMB_SENDS_PAGE_SIZE: usize = 10;
pub const USER_SENDS_PAGE_SIZE: usize = 10;
pub const EXPORT_SENDS_PAGE_SIZE: usize = 200;

#[derive(Debug)]
pub enum MutationError {
    Validation(String),
    Db(DbError),
}

impl From<DbError> for MutationError {
    fn from(value: DbError) -> Self {
        Self::Db(value)
    }
}

pub fn map_companion_or_invariant_error(err: DbError, invariant_message: &str) -> MutationError {
    let msg = err.to_string();
    if msg.contains("journal companion:") {
        return MutationError::Validation(
            "A selected friend is no longer available for this entry. Refresh and update your tagged friends."
                .to_string(),
        );
    }
    if msg.contains("journal/send invariant:")
        || msg.contains("NOT NULL constraint failed: journal_entries.user_id")
        || msg.contains("NOT NULL constraint failed: sends.user_id")
    {
        return MutationError::Validation(invariant_message.to_string());
    }
    MutationError::Db(err)
}

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EditableSend {
    pub id: i64,
    #[cfg_attr(
        feature = "api-spec",
        schemars(with = "betabook_domain::wire::AscentStyle")
    )]
    pub ascent_style: String,
    pub date_sent: Option<String>,
    pub comment: Option<String>,
    pub rating: Option<i64>,
    pub suggested_grade: Option<i64>,
    #[cfg_attr(
        feature = "api-spec",
        schemars(with = "betabook_domain::wire::GradeFeel")
    )]
    pub grade_feel: String,
    pub videos: Option<Vec<String>>,
}

#[derive(Debug, Clone)]
pub struct SendRecord {
    pub id: i64,
    pub user_id: String,
    pub climb_id: i64,
    pub ascent_style: String,
    pub date_sent: Option<String>,
    pub comment: Option<String>,
    pub rating: Option<i64>,
    pub suggested_grade: Option<i64>,
    pub grade_feel: String,
    pub videos: Option<Vec<String>>,
}

impl SendRecord {
    pub fn into_editable(self) -> EditableSend {
        EditableSend {
            id: self.id,
            ascent_style: self.ascent_style,
            date_sent: self.date_sent,
            comment: self.comment,
            rating: self.rating,
            suggested_grade: self.suggested_grade,
            grade_feel: self.grade_feel,
            videos: self.videos,
        }
    }
}

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClimbSendRow {
    pub id: i64,
    pub user_id: Option<String>,
    pub user_name: Option<String>,
    pub user_image: Option<String>,
    #[cfg_attr(
        feature = "api-spec",
        schemars(with = "betabook_domain::wire::AscentStyle")
    )]
    pub ascent_style: String,
    pub date_sent: Option<String>,
    pub comment: Option<String>,
    pub rating: Option<i64>,
    pub suggested_grade: Option<i64>,
    #[cfg_attr(
        feature = "api-spec",
        schemars(with = "betabook_domain::wire::GradeFeel")
    )]
    pub grade_feel: String,
    pub videos: Option<Vec<String>>,
}

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClimbSendsPage {
    pub sends: Vec<ClimbSendRow>,
    pub has_more: bool,
}

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SuggestedGradeCount {
    pub grade: i64,
    #[cfg_attr(
        feature = "api-spec",
        schemars(with = "betabook_domain::wire::GradeFeel")
    )]
    pub feel: String,
    pub count: i64,
}

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClimbSendSummary {
    pub avg_rating: Option<f64>,
    pub send_count: i64,
    pub avg_suggested_grade: Option<f64>,
    pub style_breakdown: BTreeMap<String, i64>,
    pub suggested_grade_counts: Vec<SuggestedGradeCount>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UserSendRow {
    pub id: i64,
    pub climb_id: i64,
    pub climb_name: String,
    pub climb_type: ClimbType,
    pub climb_grade: Option<i64>,
    pub area_id: i64,
    pub area_name: String,
    pub ascent_style: String,
    pub date_sent: Option<String>,
    pub rating: Option<i64>,
    pub suggested_grade: Option<i64>,
    pub grade_feel: String,
    pub comment: Option<String>,
    pub videos: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UserSendsPage {
    pub sends: Vec<UserSendRow>,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UserSendsExportCursor {
    pub date_sent: Option<String>,
    pub id: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UserSendsExportPage {
    pub sends: Vec<UserSendRow>,
    pub next_cursor: Option<UserSendsExportCursor>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TopDisciplineSummary {
    #[serde(rename = "type")]
    pub climb_type: ClimbType,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UserStatsSummary {
    pub send_count: i64,
    pub area_count: i64,
    pub peak_grade: Option<String>,
    pub most_logged_discipline: Option<TopDisciplineSummary>,
    pub latest_send_date: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct UserSendsFilter {
    pub filter: betabook_domain::public_catalog::DisciplineGradeFilter,
    pub date: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub tags: Vec<String>,
    pub name: Option<String>,
    pub area_name: Option<String>,
    pub area_id: Option<i64>,
    pub sort: String,
    pub ascent_styles: Vec<String>,
    pub min_rating: i64,
    pub max_rating: i64,
}

fn row_to_send_record(row: &crate::executor::DbRow) -> Result<SendRecord, DbError> {
    let videos = parse_video_list_json(row.get_opt_string("videos")?.as_deref());
    Ok(SendRecord {
        id: row.get_i64("id")?,
        user_id: row.get_string("userId")?,
        climb_id: row.get_i64("climbId")?,
        ascent_style: row.get_string("ascentStyle")?,
        date_sent: row.get_opt_string("dateSent")?,
        comment: row.get_opt_string("comment")?,
        rating: row.get_opt_i64("rating")?,
        suggested_grade: row.get_opt_i64("suggestedGrade")?,
        grade_feel: row.get_string("gradeFeel")?,
        videos,
    })
}

pub async fn get_user_send_for_climb<D: DbExecutor>(
    db: &D,
    user_id: &str,
    climb_id: i64,
) -> Result<Option<SendRecord>, DbError> {
    let row = db
        .query_one(
            "SELECT id, user_id AS userId, climb_id AS climbId, ascent_style AS ascentStyle,
                    date_sent AS dateSent, comment, rating, suggested_grade AS suggestedGrade,
                    grade_feel AS gradeFeel, videos
             FROM sends
             WHERE user_id = ? AND climb_id = ?
             LIMIT 1",
            &[DbParam::Text(user_id.to_string()), DbParam::Int(climb_id)],
        )
        .await?;
    row.as_ref().map(row_to_send_record).transpose()
}

pub async fn get_send_by_id<D: DbExecutor>(
    db: &D,
    send_id: i64,
) -> Result<Option<SendRecord>, DbError> {
    let row = db
        .query_one(
            "SELECT id, user_id AS userId, climb_id AS climbId, ascent_style AS ascentStyle,
                    date_sent AS dateSent, comment, rating, suggested_grade AS suggestedGrade,
                    grade_feel AS gradeFeel, videos
             FROM sends
             WHERE id = ?
             LIMIT 1",
            &[DbParam::Int(send_id)],
        )
        .await?;
    row.as_ref().map(row_to_send_record).transpose()
}

pub async fn get_sends_for_climb<D: DbExecutor>(
    db: &D,
    climb_id: i64,
    offset: usize,
    page_size: usize,
    viewer_id: Option<&str>,
) -> Result<ClimbSendsPage, DbError> {
    let limit = clamp_page_size(page_size, CLIMB_SENDS_PAGE_SIZE, CLIMB_SENDS_PAGE_SIZE);
    let mut params = Vec::new();
    let v = opt_text(viewer_id);

    // Three anonymous checks: id, userId, userName, userImage, dateSent
    params.push(v.clone());
    params.push(v.clone());
    params.push(v.clone());
    params.push(v.clone());
    params.push(v);

    let comment_vis = send_comment_visible_sql(viewer_id, "sends.user_id", &mut params);
    let video_vis = send_comment_visible_sql(viewer_id, "sends.user_id", &mut params);

    params.push(DbParam::Int(climb_id));
    params.push(DbParam::Int((limit + 1) as i64));
    params.push(DbParam::Int(offset as i64));

    let sql = format!(
        "SELECT
      CASE WHEN (user.is_private = 1 AND sends.user_id IS NOT ?)
        THEN -(ROW_NUMBER() OVER (ORDER BY sends.date_sent DESC, sends.id ASC))
        ELSE sends.id END AS id,
      CASE WHEN (user.is_private = 1 AND sends.user_id IS NOT ?) THEN NULL ELSE sends.user_id END AS userId,
      CASE WHEN (user.is_private = 1 AND sends.user_id IS NOT ?) THEN NULL ELSE user.name END AS userName,
      CASE WHEN (user.is_private = 1 AND sends.user_id IS NOT ?) THEN NULL ELSE user.image END AS userImage,
      sends.ascent_style AS ascentStyle,
      CASE WHEN (user.is_private = 1 AND sends.user_id IS NOT ?)
        THEN substr(sends.date_sent, 1, 7) ELSE sends.date_sent END AS dateSent,
      CASE WHEN {comment_vis} THEN sends.comment ELSE NULL END AS comment,
      CASE WHEN {video_vis} THEN sends.videos ELSE NULL END AS videos,
      sends.rating AS rating,
      sends.suggested_grade AS suggestedGrade,
      sends.grade_feel AS gradeFeel
    FROM sends
    INNER JOIN user ON sends.user_id = user.id
    WHERE sends.climb_id = ?
    ORDER BY sends.date_sent DESC, sends.id ASC
    LIMIT ? OFFSET ?"
    );

    let rows = db.query_all(&sql, &params).await?;
    let has_more = rows.len() > limit;
    let sends = rows
        .into_iter()
        .take(limit)
        .map(|row| {
            let videos = parse_video_list_json(row.get_opt_string("videos")?.as_deref());
            Ok(ClimbSendRow {
                id: row.get_i64("id")?,
                user_id: row.get_opt_string("userId")?,
                user_name: row.get_opt_string("userName")?,
                user_image: row.get_opt_string("userImage")?,
                ascent_style: row.get_string("ascentStyle")?,
                date_sent: row.get_opt_string("dateSent")?,
                comment: row.get_opt_string("comment")?,
                rating: row.get_opt_i64("rating")?,
                suggested_grade: row.get_opt_i64("suggestedGrade")?,
                grade_feel: row.get_string("gradeFeel")?,
                videos,
            })
        })
        .collect::<Result<Vec<_>, DbError>>()?;

    Ok(ClimbSendsPage { sends, has_more })
}

pub async fn get_climb_send_summary<D: DbExecutor>(
    db: &D,
    climb_id: i64,
) -> Result<ClimbSendSummary, DbError> {
    let mut style_breakdown = BTreeMap::new();
    for style in ASCENT_STYLES {
        style_breakdown.insert(style.to_string(), 0);
    }

    let stats_map = get_climb_send_stats(db, &[climb_id]).await?;
    let base = stats_map.get(&climb_id);

    let style_rows = db
        .query_all(
            "SELECT ascent_style AS ascentStyle, COUNT(*) AS count
             FROM sends WHERE climb_id = ? GROUP BY ascent_style",
            &[DbParam::Int(climb_id)],
        )
        .await?;
    for row in style_rows {
        style_breakdown.insert(row.get_string("ascentStyle")?, row.get_i64("count")?);
    }

    let grade_rows = db
        .query_all(
            "SELECT suggested_grade AS grade, grade_feel AS feel, COUNT(*) AS count
             FROM sends WHERE climb_id = ? AND suggested_grade IS NOT NULL
             GROUP BY suggested_grade, grade_feel",
            &[DbParam::Int(climb_id)],
        )
        .await?;
    let suggested_grade_counts = grade_rows
        .into_iter()
        .map(|row| {
            Ok(SuggestedGradeCount {
                grade: row.get_i64("grade")?,
                feel: row.get_string("feel")?,
                count: row.get_i64("count")?,
            })
        })
        .collect::<Result<Vec<_>, DbError>>()?;

    Ok(ClimbSendSummary {
        avg_rating: base.and_then(|s| s.avg_rating),
        send_count: base.map(|s| s.send_count).unwrap_or(0),
        avg_suggested_grade: base.and_then(|s| s.avg_suggested_grade),
        style_breakdown,
        suggested_grade_counts,
    })
}

pub fn journal_hashtags_condition(
    tags: &[String],
    column: &str,
    params: &mut Vec<DbParam>,
) -> Result<String, DbError> {
    let tags_json = serde_json::to_string(tags)?;
    params.push(DbParam::Text(tags_json));
    Ok(format!(
        "NOT EXISTS (
      SELECT 1 FROM json_each(?) requested_tag
      WHERE NOT EXISTS (
        SELECT 1 FROM json_each({column}) actual_tag WHERE actual_tag.value = requested_tag.value
      )
    )"
    ))
}

pub fn send_hashtag_condition(
    tags: &[String],
    viewer_id: Option<&str>,
    params: &mut Vec<DbParam>,
) -> Result<String, DbError> {
    send_hashtag_condition_for(tags, viewer_id, "sends", params)
}

pub(crate) fn send_hashtag_condition_for(
    tags: &[String],
    viewer_id: Option<&str>,
    sends: &str,
    params: &mut Vec<DbParam>,
) -> Result<String, DbError> {
    let tags_cond = journal_hashtags_condition(tags, "tagged_ascent.tags", params)?;
    let vis =
        crate::content_access::journal_visible_sql(viewer_id, "tagged_ascent.user_id", params);
    Ok(format!(
        "EXISTS (
      SELECT 1 FROM journal_entries tagged_ascent
      WHERE tagged_ascent.user_id = {sends}.user_id AND tagged_ascent.climb_id = {sends}.climb_id
        AND tagged_ascent.is_ascent = 1 AND {tags_cond} AND {vis}
    )"
    ))
}

pub(crate) fn user_send_columns(viewer_id: Option<&str>, params: &mut Vec<DbParam>) -> String {
    let c_vis = send_comment_visible_sql(viewer_id, "sends.user_id", params);
    let v_vis = send_comment_visible_sql(viewer_id, "sends.user_id", params);
    format!(
        "sends.id AS id,
      sends.climb_id AS climbId,
      climbs.name AS climbName,
      climbs.type AS climbType,
      climbs.grade AS climbGrade,
      climbs.area_id AS areaId,
      areas.name AS areaName,
      sends.ascent_style AS ascentStyle,
      sends.date_sent AS dateSent,
      sends.rating AS rating,
      sends.suggested_grade AS suggestedGrade,
      sends.grade_feel AS gradeFeel,
      CASE WHEN {c_vis} THEN sends.comment ELSE NULL END AS comment,
      CASE WHEN {v_vis} THEN sends.videos ELSE NULL END AS videos"
    )
}

pub(crate) fn row_to_user_send(row: &crate::executor::DbRow) -> Result<UserSendRow, DbError> {
    let raw_type = row.get_string("climbType")?;
    let climb_type = ClimbType::parse(&raw_type).ok_or(DbError::Column("climbType"))?;
    let videos = parse_video_list_json(row.get_opt_string("videos")?.as_deref());
    Ok(UserSendRow {
        id: row.get_i64("id")?,
        climb_id: row.get_i64("climbId")?,
        climb_name: row.get_string("climbName")?,
        climb_type,
        climb_grade: row.get_opt_i64("climbGrade")?,
        area_id: row.get_i64("areaId")?,
        area_name: row.get_string("areaName")?,
        ascent_style: row.get_string("ascentStyle")?,
        date_sent: row.get_opt_string("dateSent")?,
        rating: row.get_opt_i64("rating")?,
        suggested_grade: row.get_opt_i64("suggestedGrade")?,
        grade_feel: row.get_string("gradeFeel")?,
        comment: row.get_opt_string("comment")?,
        videos,
    })
}

pub async fn get_sends_for_user_page<D: DbExecutor>(
    db: &D,
    user_id: &str,
    filter: &UserSendsFilter,
    offset: usize,
    page_size: usize,
    viewer_id: Option<&str>,
) -> Result<UserSendsPage, DbError> {
    let limit = clamp_page_size(page_size, USER_SENDS_PAGE_SIZE, USER_SENDS_PAGE_SIZE);
    let mut params = Vec::new();
    let cols = user_send_columns(viewer_id, &mut params);

    params.push(DbParam::Text(user_id.to_string()));
    let mut conditions = vec!["sends.user_id = ?".to_string()];

    let discipline_clauses = discipline_grade_conditions(&filter.filter, &mut params);
    if !discipline_clauses.is_empty() {
        conditions.push(format!("({})", discipline_clauses.join(" OR ")));
    }
    if !filter.tags.is_empty() {
        conditions.push(send_hashtag_condition(
            &filter.tags,
            viewer_id,
            &mut params,
        )?);
    }
    if let Some(ref d) = filter.date {
        params.push(DbParam::Text(d.clone()));
        conditions.push("sends.date_sent = ?".to_string());
    } else {
        if let Some(ref df) = filter.date_from {
            params.push(DbParam::Text(df.clone()));
            conditions.push("sends.date_sent >= ?".to_string());
        }
        if let Some(ref dt) = filter.date_to {
            params.push(DbParam::Text(dt.clone()));
            conditions.push("sends.date_sent <= ?".to_string());
        }
    }
    if !filter.ascent_styles.is_empty() {
        let placeholders = vec!["?"; filter.ascent_styles.len()].join(", ");
        for s in &filter.ascent_styles {
            params.push(DbParam::Text(s.clone()));
        }
        conditions.push(format!("sends.ascent_style IN ({placeholders})"));
    }
    if filter.max_rating > 0 && filter.max_rating < MAX_RATING {
        params.push(DbParam::Int(filter.max_rating));
        conditions.push("sends.rating <= ?".to_string());
    }
    if filter.min_rating > 1 {
        params.push(DbParam::Int(filter.min_rating));
        conditions.push("sends.rating >= ?".to_string());
    }
    if let Some(ref name) = filter.name
        && !name.is_empty()
    {
        let fts = to_fts_prefix_query(name);
        if fts.is_empty() {
            conditions.push("0".to_string());
        } else {
            params.push(DbParam::Text(fts));
            conditions.push(
                "sends.climb_id IN (SELECT rowid FROM climbs_fts WHERE climbs_fts MATCH ?)"
                    .to_string(),
            );
        }
    }
    if let Some(area_id) = filter.area_id {
        conditions.push(area_id_condition(area_id, &mut params));
    } else if let Some(area_cond) = area_name_condition(filter.area_name.as_deref(), &mut params) {
        conditions.push(area_cond);
    }

    let order_by = match filter.sort.as_str() {
        "date_asc" => "sends.date_sent ASC NULLS LAST",
        "grade_desc" => "climbs.grade DESC",
        "grade_asc" => "climbs.grade ASC NULLS LAST",
        "rating_desc" => "sends.rating DESC",
        "rating_asc" => "sends.rating ASC NULLS LAST",
        _ => "sends.date_sent DESC",
    };

    params.push(DbParam::Int((limit + 1) as i64));
    params.push(DbParam::Int(offset as i64));

    let sql = format!(
        "SELECT {cols}
     FROM sends
     JOIN climbs ON climbs.id = sends.climb_id
     JOIN areas ON areas.id = climbs.area_id
     WHERE {}
     ORDER BY {order_by}, sends.id DESC
     LIMIT ? OFFSET ?",
        conditions.join(" AND ")
    );

    let rows = db.query_all(&sql, &params).await?;
    let has_more = rows.len() > limit;
    let sends = rows
        .iter()
        .take(limit)
        .map(row_to_user_send)
        .collect::<Result<Vec<_>, DbError>>()?;
    Ok(UserSendsPage { sends, has_more })
}

async fn get_user_export_rows<D: DbExecutor>(
    db: &D,
    user_id: &str,
    range_sql: &str,
    range_params: Vec<DbParam>,
    limit: usize,
) -> Result<Vec<UserSendRow>, DbError> {
    let mut params = Vec::new();
    let cols = user_send_columns(Some(user_id), &mut params);
    params.push(DbParam::Text(user_id.to_string()));
    params.extend(range_params);
    params.push(DbParam::Int(limit as i64));
    let sql = format!(
        "SELECT {cols}
     FROM sends INDEXED BY sends_user_date_idx
     JOIN climbs ON climbs.id = sends.climb_id
     JOIN areas ON areas.id = climbs.area_id
     WHERE sends.user_id = ? AND ({range_sql})
     ORDER BY sends.date_sent DESC, sends.id DESC
     LIMIT ?"
    );
    let rows = db.query_all(&sql, &params).await?;
    rows.iter().map(row_to_user_send).collect()
}

pub async fn get_sends_for_user_export_page<D: DbExecutor>(
    db: &D,
    user_id: &str,
    cursor: Option<&UserSendsExportCursor>,
) -> Result<UserSendsExportPage, DbError> {
    let mut rows: Vec<UserSendRow> = Vec::new();
    let fetch_dated = match cursor {
        None => true,
        Some(c) => c.date_sent.is_some(),
    };
    if fetch_dated {
        let (sql, rparams) = match cursor {
            None => ("sends.date_sent IS NOT NULL", Vec::new()),
            Some(c) => (
                "sends.date_sent IS NOT NULL AND (sends.date_sent, sends.id) < (?, ?)",
                vec![
                    DbParam::Text(c.date_sent.clone().unwrap_or_default()),
                    DbParam::Int(c.id),
                ],
            ),
        };
        rows.extend(
            get_user_export_rows(db, user_id, sql, rparams, EXPORT_SENDS_PAGE_SIZE + 1).await?,
        );
    }

    if rows.len() <= EXPORT_SENDS_PAGE_SIZE {
        let remaining = EXPORT_SENDS_PAGE_SIZE + 1 - rows.len();
        let (sql, rparams) = match cursor {
            Some(c) if c.date_sent.is_none() => (
                "sends.date_sent IS NULL AND sends.id < ?",
                vec![DbParam::Int(c.id)],
            ),
            _ => ("sends.date_sent IS NULL", Vec::new()),
        };
        rows.extend(get_user_export_rows(db, user_id, sql, rparams, remaining).await?);
    }

    let has_more = rows.len() > EXPORT_SENDS_PAGE_SIZE;
    rows.truncate(EXPORT_SENDS_PAGE_SIZE);
    let next_cursor = if has_more {
        rows.last().map(|last| UserSendsExportCursor {
            date_sent: last.date_sent.clone(),
            id: last.id,
        })
    } else {
        None
    };
    Ok(UserSendsExportPage {
        sends: rows,
        next_cursor,
    })
}

pub async fn has_user_sends<D: DbExecutor>(db: &D, user_id: &str) -> Result<bool, DbError> {
    let row = db
        .query_one(
            "SELECT EXISTS (SELECT 1 FROM sends WHERE user_id = ?) AS found",
            &[DbParam::Text(user_id.to_string())],
        )
        .await?;
    Ok(row.and_then(|r| r.get_opt_i64("found").ok().flatten()) == Some(1))
}

pub async fn get_user_sends_summary<D: DbExecutor>(
    db: &D,
    user_id: &str,
    prefs: GradePreferences,
) -> Result<UserStatsSummary, DbError> {
    let Some(totals) = db
        .query_one(
            "SELECT COUNT(*) AS sendCount, COUNT(DISTINCT climbs.area_id) AS areaCount,
                    MAX(sends.date_sent) AS latestSendDate
             FROM sends JOIN climbs ON climbs.id = sends.climb_id
             WHERE sends.user_id = ?",
            &[DbParam::Text(user_id.to_string())],
        )
        .await?
    else {
        return Ok(UserStatsSummary {
            send_count: 0,
            area_count: 0,
            peak_grade: None,
            most_logged_discipline: None,
            latest_send_date: None,
        });
    };
    let send_count = totals.get_i64("sendCount")?;
    if send_count == 0 {
        return Ok(UserStatsSummary {
            send_count: 0,
            area_count: 0,
            peak_grade: None,
            most_logged_discipline: None,
            latest_send_date: None,
        });
    }
    let area_count = totals.get_i64("areaCount")?;
    let latest_send_date = totals.get_opt_string("latestSendDate")?;

    let top = db
        .query_one(
            "SELECT climbs.type AS type, COUNT(*) AS count, MAX(climbs.grade) AS maxGrade
             FROM sends JOIN climbs ON climbs.id = sends.climb_id
             WHERE sends.user_id = ?
             GROUP BY climbs.type
             ORDER BY count DESC
             LIMIT 1",
            &[DbParam::Text(user_id.to_string())],
        )
        .await?;

    let (most_logged_discipline, peak_grade) = match top {
        Some(row) => {
            let ct = ClimbType::parse(&row.get_string("type")?).ok_or(DbError::Column("type"))?;
            let count = row.get_i64("count")?;
            let max_grade = row.get_opt_i64("maxGrade")?;
            let peak = max_grade.map(|g| format_grade(ct, Some(g), prefs).to_string());
            (
                Some(TopDisciplineSummary {
                    climb_type: ct,
                    count,
                }),
                peak,
            )
        }
        None => (None, None),
    };

    Ok(UserStatsSummary {
        send_count,
        area_count,
        peak_grade,
        most_logged_discipline,
        latest_send_date,
    })
}

pub fn build_companion_insert_stmt(
    owner_id: &str,
    ids: &[String],
    entry_id_sql: &str,
    entry_id_param: Option<DbParam>,
) -> Result<(String, Vec<DbParam>), DbError> {
    let ids_json = serde_json::to_string(ids)?;
    let mut params = Vec::new();
    if let Some(p) = entry_id_param {
        params.push(p);
    }
    params.push(DbParam::Text(owner_id.to_string()));
    params.push(DbParam::Text(owner_id.to_string()));
    params.push(DbParam::Text(ids_json));
    let sql = format!(
        "INSERT INTO journal_companions (entry_id, user_id, friendship_user_id, friendship_friend_id, suppressed)
         WITH entry AS MATERIALIZED (SELECT {entry_id_sql} AS id)
         SELECT entry.id, selection.value, min(?, selection.value), max(?, selection.value), 0
         FROM entry CROSS JOIN json_each(?) selection WHERE true
         ON CONFLICT DO NOTHING"
    );
    Ok((sql, params))
}

pub fn build_companion_replacement_stmts(
    owner_id: &str,
    entry_id: i64,
    companions: Option<&[String]>,
) -> Result<Vec<(String, Vec<DbParam>)>, DbError> {
    let Some(ids) = companions else {
        return Ok(Vec::new());
    };
    let mut stmts = Vec::new();
    if ids.is_empty() {
        stmts.push((
            "DELETE FROM journal_companions WHERE entry_id = ? AND suppressed = 0".to_string(),
            vec![DbParam::Int(entry_id)],
        ));
    } else {
        let ids_json = serde_json::to_string(ids)?;
        stmts.push((
            "DELETE FROM journal_companions
             WHERE entry_id = ? AND suppressed = 0
               AND user_id NOT IN (SELECT value FROM json_each(?))"
                .to_string(),
            vec![DbParam::Int(entry_id), DbParam::Text(ids_json)],
        ));
        stmts.push(build_companion_insert_stmt(
            owner_id,
            ids,
            "?",
            Some(DbParam::Int(entry_id)),
        )?);
    }
    Ok(stmts)
}

pub async fn create_undated_send<D: DbExecutor>(
    db: &D,
    user_id: &str,
    climb_id: i64,
    climb_type: ClimbType,
    input: &ValidatedSendInput,
    now_ms: i64,
) -> Result<(), MutationError> {
    let videos_param = match &input.videos {
        Some(Some(v)) => DbParam::Text(serde_json::to_string(v).map_err(DbError::from)?),
        _ => DbParam::Null,
    };
    db.execute(
        "INSERT INTO sends (user_id, climb_id, ascent_style, date_sent, comment, rating, suggested_grade, grade_feel, videos, created_at, updated_at)
         VALUES (?, (SELECT c.id FROM climbs c WHERE c.id = ? AND c.type = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        &[
            DbParam::Text(user_id.to_string()),
            DbParam::Int(climb_id),
            DbParam::Text(climb_type.as_str().to_string()),
            DbParam::Text(input.ascent_style.clone()),
            opt_text(input.date_sent.as_deref()),
            opt_text(input.comment.as_deref()),
            DbParam::from(input.rating),
            DbParam::Int(input.suggested_grade),
            DbParam::Text(input.grade_feel.clone()),
            videos_param,
            DbParam::Int(now_ms),
            DbParam::Int(now_ms),
        ],
    )
    .await?;
    Ok(())
}

pub fn build_send_insert_stmt(
    user_id: &str,
    climb_id: i64,
    climb_type: ClimbType,
    input: &ValidatedSendInput,
    now_ms: i64,
) -> Result<(String, Vec<DbParam>), DbError> {
    let videos_param = match &input.videos {
        Some(Some(v)) => DbParam::Text(serde_json::to_string(v)?),
        _ => DbParam::Null,
    };
    Ok((
        "INSERT INTO sends (user_id, climb_id, ascent_style, date_sent, comment, rating, suggested_grade, grade_feel, videos, created_at, updated_at)
         VALUES (?, (SELECT c.id FROM climbs c WHERE c.id = ? AND c.type = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?)".to_string(),
        vec![
            DbParam::Text(user_id.to_string()),
            DbParam::Int(climb_id),
            DbParam::Text(climb_type.as_str().to_string()),
            DbParam::Text(input.ascent_style.clone()),
            opt_text(input.date_sent.as_deref()),
            opt_text(input.comment.as_deref()),
            DbParam::from(input.rating),
            DbParam::Int(input.suggested_grade),
            DbParam::Text(input.grade_feel.clone()),
            videos_param,
            DbParam::Int(now_ms),
            DbParam::Int(now_ms),
        ],
    ))
}

#[derive(Debug, Clone)]
pub struct SentJournalRow {
    pub id: i64,
    pub climb_id: Option<i64>,
    pub entry_date: String,
    pub is_ascent: bool,
}

pub async fn get_sent_journal_entries<D: DbExecutor>(
    db: &D,
    user_id: &str,
    climb_id: i64,
) -> Result<Vec<SentJournalRow>, DbError> {
    let rows = db
        .query_all(
            "SELECT id, climb_id AS climbId, entry_date AS entryDate, is_ascent AS isAscent
             FROM journal_entries
             WHERE user_id = ? AND sent = 1 AND climb_id = ?
             ORDER BY climb_id ASC, entry_date ASC, id ASC",
            &[DbParam::Text(user_id.to_string()), DbParam::Int(climb_id)],
        )
        .await?;
    rows.into_iter()
        .map(|row| {
            Ok(SentJournalRow {
                id: row.get_i64("id")?,
                climb_id: row.get_opt_i64("climbId")?,
                entry_date: row.get_string("entryDate")?,
                is_ascent: row.get_i64("isAscent")? == 1,
            })
        })
        .collect()
}

pub fn build_journal_entry_guard_stmt(
    id: i64,
    user_id: &str,
    climb_id: Option<i64>,
    sent: bool,
    is_ascent: bool,
) -> (String, Vec<DbParam>) {
    (
        "UPDATE journal_entries
         SET user_id = NULL, updated_at = updated_at
         WHERE id = ? AND NOT (
           user_id = ? AND climb_id IS ? AND sent = ? AND is_ascent = ?
         )"
        .to_string(),
        vec![
            DbParam::Int(id),
            DbParam::Text(user_id.to_string()),
            DbParam::from(climb_id),
            DbParam::Int(i64::from(sent)),
            DbParam::Int(i64::from(is_ascent)),
        ],
    )
}

pub struct SentJournalInsert<'a> {
    pub user_id: &'a str,
    pub climb_id: i64,
    pub kind: &'a str,
    pub is_ascent: bool,
    pub entry_date: &'a str,
    pub body: Option<&'a str>,
    pub tags: Option<&'a [String]>,
    pub now_ms: i64,
}

pub fn build_sent_journal_insert_stmt(
    item: &SentJournalInsert<'_>,
) -> Result<(String, Vec<DbParam>), DbError> {
    let tags_param = match item.tags {
        Some(t) if !t.is_empty() => DbParam::Text(serde_json::to_string(t)?),
        _ => DbParam::Null,
    };
    Ok((
        "INSERT INTO journal_entries (user_id, climb_id, kind, sent, is_ascent, entry_date, body, tags, created_at, updated_at)
         VALUES (
           (SELECT s.user_id FROM sends s WHERE s.user_id = ? AND s.climb_id = ? AND (s.date_sent IS NULL OR ? >= s.date_sent)),
           ?, ?, 1, ?, ?, ?, ?, ?, ?
         )".to_string(),
        vec![
            DbParam::Text(item.user_id.to_string()),
            DbParam::Int(item.climb_id),
            DbParam::Text(item.entry_date.to_string()),
            DbParam::Int(item.climb_id),
            DbParam::Text(item.kind.to_string()),
            DbParam::Int(i64::from(item.is_ascent)),
            DbParam::Text(item.entry_date.to_string()),
            opt_text(item.body),
            tags_param,
            DbParam::Int(item.now_ms),
            DbParam::Int(item.now_ms),
        ],
    ))
}

#[allow(clippy::too_many_arguments)]
pub fn build_mirrored_send_update_stmt(
    user_id: &str,
    climb_id: i64,
    send_id: i64,
    date_sent: Option<&str>,
    comment: Option<&str>,
    full_input: Option<&ValidatedSendInput>,
    ascent_entry_id: Option<i64>,
    now_ms: i64,
) -> Result<(String, Vec<DbParam>), DbError> {
    let mut set_clauses = Vec::new();
    let mut params = Vec::new();

    if let Some(input) = full_input {
        set_clauses.push("ascent_style = ?");
        params.push(DbParam::Text(input.ascent_style.clone()));
        set_clauses.push("date_sent = ?");
        params.push(opt_text(input.date_sent.as_deref()));
        set_clauses.push("comment = ?");
        params.push(opt_text(input.comment.as_deref()));
        set_clauses.push("rating = ?");
        params.push(DbParam::from(input.rating));
        set_clauses.push("suggested_grade = ?");
        params.push(DbParam::Int(input.suggested_grade));
        set_clauses.push("grade_feel = ?");
        params.push(DbParam::Text(input.grade_feel.clone()));
        if let Some(ref vids) = input.videos {
            set_clauses.push("videos = ?");
            match vids {
                Some(list) => params.push(DbParam::Text(serde_json::to_string(list)?)),
                None => params.push(DbParam::Null),
            }
        }
    } else {
        set_clauses.push("date_sent = ?");
        params.push(opt_text(date_sent));
        set_clauses.push("comment = ?");
        params.push(opt_text(comment));
    }

    set_clauses.push("updated_at = ?");
    params.push(DbParam::Int(now_ms));

    // Mirror guard for user_id
    params.push(DbParam::Text(user_id.to_string()));
    params.push(DbParam::Int(climb_id));
    let guard_sql = match ascent_entry_id {
        None => {
            params.push(DbParam::Text(user_id.to_string()));
            params.push(DbParam::Int(climb_id));
            "NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j.user_id = ? AND j.climb_id = ? AND j.is_ascent = 1)".to_string()
        }
        Some(eid) => {
            params.push(opt_text(date_sent));
            params.push(DbParam::Text(user_id.to_string()));
            params.push(DbParam::Int(climb_id));
            params.push(DbParam::Int(eid));
            "? IS NOT NULL AND EXISTS (SELECT 1 FROM journal_entries j WHERE j.user_id = ? AND j.climb_id = ? AND j.is_ascent = 1 AND j.id = ?)".to_string()
        }
    };
    params.push(DbParam::Text(user_id.to_string()));
    params.push(DbParam::Int(climb_id));
    params.push(opt_text(date_sent));

    // WHERE clause
    params.push(DbParam::Text(user_id.to_string()));
    params.push(DbParam::Int(climb_id));
    params.push(DbParam::Int(send_id));

    let sql = format!(
        "UPDATE sends
     SET {},
       user_id = (
         SELECT s.user_id FROM sends s
         WHERE s.user_id = ? AND s.climb_id = ? AND (
           {guard_sql}
           AND NOT EXISTS (
             SELECT 1 FROM journal_entries j
             WHERE j.user_id = ? AND j.climb_id = ? AND j.sent = 1 AND j.is_ascent = 0 AND j.entry_date < ?
           )
         )
       )
     WHERE user_id = ? AND climb_id = ? AND id = ?",
        set_clauses.join(", ")
    );
    Ok((sql, params))
}

#[allow(clippy::too_many_arguments)]
pub async fn update_send_with_journal<D: DbExecutor>(
    db: &D,
    user_id: &str,
    send_id: i64,
    input: &ValidatedSendInput,
    companions: Option<&[String]>,
    expected_journal_entry_id: Option<&str>,
    tags_changed: bool,
    normalized_tags: Option<&[String]>,
    now_ms: i64,
) -> Result<(), MutationError> {
    let existing = get_send_by_id(db, send_id)
        .await?
        .filter(|s| s.user_id == user_id)
        .ok_or_else(|| MutationError::Validation("Send not found".to_string()))?;

    let climb = crate::member_catalog::get_climb_by_id(db, existing.climb_id)
        .await?
        .ok_or_else(|| MutationError::Validation("Climb not found".to_string()))?;

    if input.date_sent != existing.date_sent
        && let Err(msg) =
            assert_loggable_on_climb(climb.broken_on.as_deref(), input.date_sent.as_deref())
    {
        return Err(MutationError::Validation(msg));
    }

    if companions.is_some_and(|c| !c.is_empty()) && input.date_sent.is_none() {
        return Err(MutationError::Validation(
            "Add a date to tag friends".to_string(),
        ));
    }

    let sent_entries = get_sent_journal_entries(db, user_id, existing.climb_id).await?;
    let ascent = sent_entries.iter().find(|e| e.is_ascent);

    if let Some(expected) = expected_journal_entry_id {
        let actual_str = ascent.map(|a| a.id.to_string()).unwrap_or_default();
        if expected != actual_str {
            return Err(MutationError::Validation(
                "The journal changed — refresh and try again".to_string(),
            ));
        }
    }

    if tags_changed
        && let Some(tags) = normalized_tags
        && !tags.is_empty()
        && input.date_sent.is_none()
    {
        return Err(MutationError::Validation(
            "Add a date to keep tags".to_string(),
        ));
    }

    if ascent.is_some() && input.date_sent.is_none() {
        return Err(MutationError::Validation(
            "A send with journal history must keep its date".to_string(),
        ));
    }

    let (send_sql, send_params) = build_mirrored_send_update_stmt(
        user_id,
        existing.climb_id,
        send_id,
        input.date_sent.as_deref(),
        input.comment.as_deref(),
        Some(input),
        ascent.map(|a| a.id),
        now_ms,
    )?;

    if let Some(ref date_sent) = input.date_sent {
        if sent_entries
            .iter()
            .any(|e| !e.is_ascent && e.entry_date.as_str() < date_sent.as_str())
        {
            return Err(MutationError::Validation(
                "The ascent date can't be later than a logged repeat".to_string(),
            ));
        }

        let mut stmts = Vec::new();
        if let Some(asc) = ascent {
            stmts.push(build_journal_entry_guard_stmt(
                asc.id,
                user_id,
                Some(existing.climb_id),
                true,
                true,
            ));
            let mut j_params = vec![
                DbParam::Text(date_sent.clone()),
                opt_text(input.comment.as_deref()),
            ];
            let tags_sql = if tags_changed {
                let tag_param = match normalized_tags {
                    Some(t) if !t.is_empty() => {
                        DbParam::Text(serde_json::to_string(t).map_err(DbError::from)?)
                    }
                    _ => DbParam::Null,
                };
                j_params.push(tag_param);
                ", tags = ?"
            } else {
                ""
            };
            j_params.push(DbParam::Int(now_ms));
            j_params.push(DbParam::Int(asc.id));
            stmts.push((
                format!("UPDATE journal_entries SET entry_date = ?, body = ?{tags_sql}, updated_at = ? WHERE id = ?"),
                j_params,
            ));
            stmts.push((send_sql, send_params));
            stmts.extend(build_companion_replacement_stmts(
                user_id, asc.id, companions,
            )?);
        } else {
            stmts.push((send_sql, send_params));
            let insert_tags = if tags_changed {
                normalized_tags.filter(|t| !t.is_empty())
            } else {
                None
            };
            stmts.push(build_sent_journal_insert_stmt(&SentJournalInsert {
                user_id,
                climb_id: existing.climb_id,
                kind: "session",
                is_ascent: true,
                entry_date: date_sent,
                body: input.comment.as_deref(),
                tags: insert_tags,
                now_ms,
            })?);
            if let Some(c) = companions
                && !c.is_empty()
            {
                stmts.push(build_companion_insert_stmt(
                    user_id,
                    c,
                    "last_insert_rowid()",
                    None,
                )?);
            }
        }

        if let Err(err) = db.batch(stmts).await {
            return Err(map_companion_or_invariant_error(
                err,
                "The journal changed while this send was being saved — try again",
            ));
        }
    } else {
        db.execute(&send_sql, &send_params).await?;
    }

    Ok(())
}

pub async fn delete_user_send<D: DbExecutor>(
    db: &D,
    user_id: &str,
    send_id: i64,
) -> Result<bool, MutationError> {
    let Some(existing) = get_send_by_id(db, send_id).await? else {
        return Err(MutationError::Validation("Send not found".to_string()));
    };
    if existing.user_id != user_id {
        return Err(MutationError::Validation("Send not found".to_string()));
    }
    db.execute(
        "DELETE FROM sends WHERE id = ? AND user_id = ?",
        &[DbParam::Int(send_id), DbParam::Text(user_id.to_string())],
    )
    .await?;
    Ok(true)
}
