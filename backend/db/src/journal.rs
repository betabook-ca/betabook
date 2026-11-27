use betabook_domain::grades::ClimbType;
use betabook_domain::sends::{
    ValidatedJournalInput, ValidatedSendInput, assert_loggable_on_climb, parse_video_list_json,
};
use serde::{Deserialize, Serialize};

use crate::content_access::{
    companions_json_sql, journal_visible_sql, opt_text, send_comment_visible_sql,
};
use crate::executor::{DbError, DbExecutor, DbParam};
use crate::feed::JournalCompanion;
use crate::fts::clamp_page_size;
use crate::member_catalog::get_climb_by_id;
use crate::sends::{
    MutationError, SentJournalInsert, build_companion_insert_stmt,
    build_companion_replacement_stmts, build_journal_entry_guard_stmt,
    build_mirrored_send_update_stmt, build_send_insert_stmt, build_sent_journal_insert_stmt,
    get_sent_journal_entries, get_user_send_for_climb, journal_hashtags_condition,
    map_companion_or_invariant_error,
};

pub const JOURNAL_PAGE_SIZE: usize = 20;
pub const CLIMB_JOURNAL_ENTRY_LIMIT: usize = 4;
const SEND_CHANGED_MESSAGE: &str = "The send changed while this entry was being saved — try again";
const REPEAT_BEFORE_ASCENT_MESSAGE: &str = "A repeat can't be earlier than the recorded ascent";

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub id: i64,
    pub climb_id: Option<i64>,
    #[cfg_attr(
        feature = "api-spec",
        schemars(with = "betabook_domain::wire::JournalKind")
    )]
    pub kind: String,
    pub sent: bool,
    pub entry_date: String,
    pub body: Option<String>,
    pub tags: Vec<String>,
    pub companions: Vec<JournalCompanion>,
    pub climb_name: Option<String>,
    pub climb_type: Option<ClimbType>,
    pub climb_grade: Option<i64>,
    pub climb_broken_on: Option<String>,
    pub reported_grade: Option<i64>,
    pub videos: Option<Vec<String>>,
    pub area_id: Option<i64>,
    pub area_name: Option<String>,
    pub is_ascent: bool,
    pub is_send_comment: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JournalCursor {
    pub entry_date: String,
    pub id: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JournalPage {
    pub entries: Vec<JournalEntry>,
    pub has_more: bool,
    pub next_cursor: Option<JournalCursor>,
}

#[derive(Debug, Clone, Default)]
pub struct JournalFilter {
    pub view: String,
    pub query: Option<String>,
    pub tags: Vec<String>,
    pub friend_ids: Vec<String>,
    pub climb_id: Option<i64>,
    pub date: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub year: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct StoredJournalEntry {
    pub id: i64,
    pub user_id: String,
    pub climb_id: Option<i64>,
    pub kind: String,
    pub sent: bool,
    pub is_ascent: bool,
    pub entry_date: String,
}

pub(crate) fn row_to_journal_entry(row: &crate::executor::DbRow) -> Result<JournalEntry, DbError> {
    let companions_raw = row.get_string("companions")?;
    let companions: Vec<JournalCompanion> =
        serde_json::from_str(&companions_raw).unwrap_or_default();
    let tags_raw = row.get_opt_string("tags")?;
    let tags: Vec<String> = tags_raw
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();
    let videos = parse_video_list_json(row.get_opt_string("videos")?.as_deref());
    let climb_type = row
        .get_opt_string("climbType")?
        .as_deref()
        .and_then(ClimbType::parse);

    Ok(JournalEntry {
        id: row.get_i64("id")?,
        climb_id: row.get_opt_i64("climbId")?,
        kind: row.get_string("kind")?,
        sent: row.get_i64("sent")? == 1,
        entry_date: row.get_string("entryDate")?,
        body: row.get_opt_string("body")?,
        tags,
        companions,
        climb_name: row.get_opt_string("climbName")?,
        climb_type,
        climb_grade: row.get_opt_i64("climbGrade")?,
        climb_broken_on: row.get_opt_string("climbBrokenOn")?,
        reported_grade: row.get_opt_i64("reportedGrade")?,
        videos,
        area_id: row.get_opt_i64("areaId")?,
        area_name: row.get_opt_string("areaName")?,
        is_ascent: row.get_i64("isAscent")? == 1,
        is_send_comment: row.get_i64("isSendComment")? == 1,
    })
}

fn visible_body_sql(viewer_id: Option<&str>, params: &mut Vec<DbParam>) -> String {
    let vis = send_comment_visible_sql(viewer_id, "j.user_id", params);
    format!("CASE WHEN j.is_send_comment = 0 OR {vis} THEN j.body ELSE NULL END")
}

pub(crate) fn journal_entry_select(viewer_id: Option<&str>, params: &mut Vec<DbParam>) -> String {
    journal_entry_columns(viewer_id, params, true)
}

pub(crate) fn journal_entry_columns(
    viewer_id: Option<&str>,
    params: &mut Vec<DbParam>,
    include_companions: bool,
) -> String {
    let body_sql = visible_body_sql(viewer_id, params);
    let companions_sql = if include_companions {
        companions_json_sql(viewer_id, "j.id", params)
    } else {
        "'[]'".to_string()
    };
    let videos_vis = send_comment_visible_sql(viewer_id, "j.user_id", params);

    format!(
        "SELECT
      j.id AS id,
      j.climb_id AS climbId,
      j.kind AS kind,
      j.sent AS sent,
      j.entry_date AS entryDate,
      {body_sql} AS body,
      j.tags AS tags,
      {companions_sql} AS companions,
      climbs.name AS climbName,
      climbs.type AS climbType,
      climbs.grade AS climbGrade,
      climbs.broken_on AS climbBrokenOn,
      reported.suggested_grade AS reportedGrade,
      CASE WHEN j.is_ascent = 1 AND {videos_vis}
        THEN reported.videos ELSE NULL END AS videos,
      climbs.area_id AS areaId,
      areas.name AS areaName,
      j.is_ascent AS isAscent, j.is_send_comment AS isSendComment
    FROM journal_entries j
    LEFT JOIN climbs ON climbs.id = j.climb_id
    LEFT JOIN areas ON areas.id = climbs.area_id
    LEFT JOIN sends reported ON reported.user_id = j.user_id AND reported.climb_id = j.climb_id AND j.sent = 1"
    )
}

pub async fn get_journal_page<D: DbExecutor>(
    db: &D,
    owner_id: &str,
    viewer_id: Option<&str>,
    filter: &JournalFilter,
    cursor: Option<&JournalCursor>,
    page_size: usize,
) -> Result<JournalPage, DbError> {
    if !filter.friend_ids.is_empty() && viewer_id != Some(owner_id) {
        return Ok(JournalPage {
            entries: Vec::new(),
            has_more: false,
            next_cursor: None,
        });
    }
    let limit = clamp_page_size(page_size, JOURNAL_PAGE_SIZE, JOURNAL_PAGE_SIZE);
    let mut params = Vec::new();
    let select_sql = journal_entry_select(viewer_id, &mut params);

    params.push(DbParam::Text(owner_id.to_string()));
    let mut conditions = vec!["j.user_id = ?".to_string()];
    conditions.push(journal_visible_sql(viewer_id, "j.user_id", &mut params));

    match filter.view.as_str() {
        "sessions" => conditions.push("j.kind = 'session'".to_string()),
        "training" => conditions.push("j.kind = 'training'".to_string()),
        _ => {}
    }

    if let Some(ref q) = filter.query
        && !q.is_empty()
    {
        params.push(DbParam::Text(q.clone()));
        let vis_body = visible_body_sql(viewer_id, &mut params);
        params.push(DbParam::Text(q.clone()));
        params.push(DbParam::Text(q.clone()));
        params.push(DbParam::Text(q.clone()));
        conditions.push(format!(
            "(
          instr(lower(COALESCE(climbs.name, '')), lower(?)) > 0
          OR instr(lower(COALESCE({vis_body}, '')), lower(?)) > 0
          OR instr(lower(COALESCE(j.tags, '')), lower(?)) > 0
          OR EXISTS (
            WITH RECURSIVE ancestors(id, parent_id, name) AS (
              SELECT a.id, a.parent_id, a.name FROM areas a WHERE a.id = climbs.area_id
              UNION ALL
              SELECT parent.id, parent.parent_id, parent.name
              FROM areas parent JOIN ancestors child ON parent.id = child.parent_id
            )
            SELECT 1 FROM ancestors WHERE instr(lower(ancestors.name), lower(?)) > 0
          )
        )"
        ));
    }

    if !filter.tags.is_empty() {
        conditions.push(journal_hashtags_condition(
            &filter.tags,
            "j.tags",
            &mut params,
        )?);
    }
    if let Some(climb_id) = filter.climb_id {
        params.push(DbParam::Int(climb_id));
        conditions.push("j.climb_id = ?".to_string());
    }
    if let Some(ref d) = filter.date {
        params.push(DbParam::Text(d.clone()));
        conditions.push("j.entry_date = ?".to_string());
    } else {
        if let Some(ref df) = filter.date_from {
            params.push(DbParam::Text(df.clone()));
            conditions.push("j.entry_date >= ?".to_string());
        }
        if let Some(ref dt) = filter.date_to {
            params.push(DbParam::Text(dt.clone()));
            conditions.push("j.entry_date <= ?".to_string());
        }
    }
    if let Some(year) = filter.year {
        params.push(DbParam::Text(format!("{year}-01-01")));
        params.push(DbParam::Text(format!("{year}-12-31")));
        conditions.push("j.entry_date >= ? AND j.entry_date <= ?".to_string());
    }
    if !filter.friend_ids.is_empty() {
        let friend_json = serde_json::to_string(&filter.friend_ids)?;
        params.push(DbParam::Text(friend_json));
        conditions.push(
            "EXISTS (
          SELECT 1 FROM journal_companions jc INDEXED BY journal_companions_active_idx
          JOIN friendships tagged_friendship ON tagged_friendship.user_id = jc.friendship_user_id
            AND tagged_friendship.friend_id = jc.friendship_friend_id
          WHERE jc.entry_id = j.id AND jc.suppressed = 0
            AND tagged_friendship.status = 'accepted'
            AND jc.user_id IN (SELECT value FROM json_each(?))
        )"
            .to_string(),
        );
    }
    if let Some(c) = cursor {
        params.push(DbParam::Text(c.entry_date.clone()));
        params.push(DbParam::Int(c.id));
        conditions.push("(j.entry_date, j.id) < (?, ?)".to_string());
    }

    params.push(DbParam::Int((limit + 1) as i64));

    let sql = format!(
        "{select_sql}
     WHERE {}
     ORDER BY j.entry_date DESC, j.id DESC
     LIMIT ?",
        conditions.join(" AND ")
    );
    let rows = db.query_all(&sql, &params).await?;
    let has_more = rows.len() > limit;
    let entries = rows
        .iter()
        .take(limit)
        .map(row_to_journal_entry)
        .collect::<Result<Vec<_>, DbError>>()?;
    let next_cursor = if has_more {
        entries.last().map(|last| JournalCursor {
            entry_date: last.entry_date.clone(),
            id: last.id,
        })
    } else {
        None
    };
    Ok(JournalPage {
        entries,
        has_more,
        next_cursor,
    })
}

pub async fn get_journal_for_climb<D: DbExecutor>(
    db: &D,
    owner_id: &str,
    viewer_id: Option<&str>,
    climb_id: i64,
    limit: usize,
) -> Result<Vec<JournalEntry>, DbError> {
    let mut params = Vec::new();
    let select_sql = journal_entry_select(viewer_id, &mut params);
    params.push(DbParam::Text(owner_id.to_string()));
    let vis = journal_visible_sql(viewer_id, "j.user_id", &mut params);
    params.push(DbParam::Int(climb_id));
    params.push(DbParam::Int(limit as i64));

    let sql = format!(
        "{select_sql}
     WHERE j.user_id = ? AND {vis} AND j.climb_id = ?
     ORDER BY j.entry_date DESC, j.id DESC
     LIMIT ?"
    );
    let rows = db.query_all(&sql, &params).await?;
    rows.iter().map(row_to_journal_entry).collect()
}

pub async fn get_ascent_entry_id<D: DbExecutor>(
    db: &D,
    owner_id: &str,
    climb_id: i64,
) -> Result<Option<i64>, DbError> {
    let row = db
        .query_one(
            "SELECT id FROM journal_entries WHERE user_id = ? AND climb_id = ? AND is_ascent = 1 LIMIT 1",
            &[DbParam::Text(owner_id.to_string()), DbParam::Int(climb_id)],
        )
        .await?;
    Ok(row.and_then(|r| r.get_opt_i64("id").ok().flatten()))
}

pub async fn get_journal_entry<D: DbExecutor>(
    db: &D,
    entry_id: i64,
    owner_id: &str,
) -> Result<Option<StoredJournalEntry>, DbError> {
    let Some(row) = db
        .query_one(
            "SELECT id, user_id AS userId, climb_id AS climbId, kind, sent, is_ascent AS isAscent, entry_date AS entryDate
             FROM journal_entries WHERE id = ? AND user_id = ? LIMIT 1",
            &[DbParam::Int(entry_id), DbParam::Text(owner_id.to_string())],
        )
        .await?
    else {
        return Ok(None);
    };
    Ok(Some(StoredJournalEntry {
        id: row.get_i64("id")?,
        user_id: row.get_string("userId")?,
        climb_id: row.get_opt_i64("climbId")?,
        kind: row.get_string("kind")?,
        sent: row.get_i64("sent")? == 1,
        is_ascent: row.get_i64("isAscent")? == 1,
        entry_date: row.get_string("entryDate")?,
    }))
}

pub async fn get_journal_entry_for_edit<D: DbExecutor>(
    db: &D,
    entry_id: i64,
    owner_id: &str,
) -> Result<Option<JournalEntry>, DbError> {
    let mut params = Vec::new();
    let select_sql = journal_entry_select(Some(owner_id), &mut params);
    params.push(DbParam::Int(entry_id));
    params.push(DbParam::Text(owner_id.to_string()));
    let sql = format!("{select_sql} WHERE j.id = ? AND j.user_id = ?");
    let row = db.query_one(&sql, &params).await?;
    row.as_ref().map(row_to_journal_entry).transpose()
}

pub async fn has_journal_entries<D: DbExecutor>(
    db: &D,
    owner_id: &str,
    viewer_id: Option<&str>,
) -> Result<bool, DbError> {
    let mut params = vec![DbParam::Text(owner_id.to_string())];
    let vis = journal_visible_sql(viewer_id, "j.user_id", &mut params);
    let sql = format!(
        "SELECT EXISTS (SELECT 1 FROM journal_entries j WHERE j.user_id = ? AND {vis}) AS found"
    );
    let row = db.query_one(&sql, &params).await?;
    Ok(row.and_then(|r| r.get_opt_i64("found").ok().flatten()) == Some(1))
}

pub async fn get_user_hashtags<D: DbExecutor>(
    db: &D,
    owner_id: &str,
    viewer_id: Option<&str>,
    ascents_only: bool,
    include_training: bool,
) -> Result<Vec<String>, DbError> {
    let mut params = vec![DbParam::Text(owner_id.to_string())];
    let training_cond = if include_training {
        ""
    } else {
        "AND j.kind = 'session'"
    };
    let vis = journal_visible_sql(viewer_id, "j.user_id", &mut params);
    let ascent_cond = if ascents_only {
        "AND j.is_ascent = 1"
    } else {
        ""
    };

    let sql = format!(
        "SELECT DISTINCT tag.value AS tag
         FROM journal_entries j, json_each(j.tags) tag
         WHERE j.user_id = ? {training_cond} AND {vis} {ascent_cond}
         ORDER BY tag.value"
    );
    let rows = db.query_all(&sql, &params).await?;
    rows.into_iter().map(|r| r.get_string("tag")).collect()
}

pub async fn create_journal_entry_with_sync<D: DbExecutor>(
    db: &D,
    user_id: &str,
    input: &ValidatedJournalInput,
    send_input_if_new_ascent: Option<&ValidatedSendInput>,
    carries_send_fields: bool,
    companions: Option<&[String]>,
    now_ms: i64,
) -> Result<(), MutationError> {
    let climb = match input.climb_id {
        None => None,
        Some(cid) => Some(
            get_climb_by_id(db, cid)
                .await?
                .ok_or_else(|| MutationError::Validation("Climb not found".to_string()))?,
        ),
    };

    if let Some(ref c) = climb
        && let Err(msg) = assert_loggable_on_climb(c.broken_on.as_deref(), Some(&input.entry_date))
    {
        return Err(MutationError::Validation(msg));
    }

    if !input.sent && carries_send_fields {
        return Err(MutationError::Validation(
            "A session doesn't carry a rating or a grade".to_string(),
        ));
    }

    let companion_list = companions.filter(|c| !c.is_empty());

    if input.sent
        && let Some(ref c) = climb
    {
        let existing_send = get_user_send_for_climb(db, user_id, c.id).await?;
        let Some(existing) = existing_send else {
            let send_input = send_input_if_new_ascent
                .ok_or_else(|| MutationError::Validation(SEND_CHANGED_MESSAGE.to_string()))?;
            let mut stmts = vec![
                build_send_insert_stmt(user_id, c.id, c.climb_type, send_input, now_ms)?,
                build_sent_journal_insert_stmt(&SentJournalInsert {
                    user_id,
                    climb_id: c.id,
                    kind: &input.kind,
                    is_ascent: true,
                    entry_date: &input.entry_date,
                    body: input.body.as_deref(),
                    tags: input.tags.as_deref(),
                    now_ms,
                })?,
            ];
            if let Some(comp) = companion_list {
                stmts.push(build_companion_insert_stmt(
                    user_id,
                    comp,
                    "last_insert_rowid()",
                    None,
                )?);
            }
            if let Err(err) = db.batch(stmts).await {
                if err
                    .to_string()
                    .contains("UNIQUE constraint failed: sends.user_id, sends.climb_id")
                {
                    return Err(MutationError::Validation(SEND_CHANGED_MESSAGE.into()));
                }
                return Err(map_companion_or_invariant_error(err, SEND_CHANGED_MESSAGE));
            }
            return Ok(());
        };

        if send_input_if_new_ascent.is_some() {
            return Err(MutationError::Validation(SEND_CHANGED_MESSAGE.into()));
        }
        if carries_send_fields {
            return Err(MutationError::Validation(
                "A repeat doesn't carry a rating or a grade".to_string(),
            ));
        }

        let sent_entries = get_sent_journal_entries(db, user_id, c.id).await?;
        if !sent_entries.iter().any(|e| e.is_ascent)
            && let Some(ref date_sent) = existing.date_sent
        {
            if input.entry_date < *date_sent {
                return Err(MutationError::Validation(
                    REPEAT_BEFORE_ASCENT_MESSAGE.to_string(),
                ));
            }
            let mut stmts = vec![
                build_mirrored_send_update_stmt(
                    user_id,
                    c.id,
                    existing.id,
                    Some(date_sent),
                    existing.comment.as_deref(),
                    None,
                    None,
                    now_ms,
                )?,
                build_sent_journal_insert_stmt(&SentJournalInsert {
                    user_id,
                    climb_id: c.id,
                    kind: "session",
                    is_ascent: true,
                    entry_date: date_sent,
                    body: existing.comment.as_deref(),
                    tags: None,
                    now_ms,
                })?,
                build_sent_journal_insert_stmt(&SentJournalInsert {
                    user_id,
                    climb_id: c.id,
                    kind: &input.kind,
                    is_ascent: false,
                    entry_date: &input.entry_date,
                    body: input.body.as_deref(),
                    tags: input.tags.as_deref(),
                    now_ms,
                })?,
            ];
            if let Some(comp) = companion_list {
                stmts.push(build_companion_insert_stmt(
                    user_id,
                    comp,
                    "last_insert_rowid()",
                    None,
                )?);
            }
            if let Err(err) = db.batch(stmts).await {
                return Err(map_companion_or_invariant_error(err, SEND_CHANGED_MESSAGE));
            }
            return Ok(());
        }

        if let Some(asc) = sent_entries.iter().find(|e| e.is_ascent)
            && input.entry_date < asc.entry_date
        {
            return Err(MutationError::Validation(
                REPEAT_BEFORE_ASCENT_MESSAGE.to_string(),
            ));
        }

        let mut stmts = vec![build_sent_journal_insert_stmt(&SentJournalInsert {
            user_id,
            climb_id: c.id,
            kind: &input.kind,
            is_ascent: false,
            entry_date: &input.entry_date,
            body: input.body.as_deref(),
            tags: input.tags.as_deref(),
            now_ms,
        })?];
        if let Some(comp) = companion_list {
            stmts.push(build_companion_insert_stmt(
                user_id,
                comp,
                "last_insert_rowid()",
                None,
            )?);
        }
        if let Err(err) = db.batch(stmts).await {
            return Err(map_companion_or_invariant_error(err, SEND_CHANGED_MESSAGE));
        }
        return Ok(());
    }

    let tags_param = match &input.tags {
        Some(t) if !t.is_empty() => DbParam::Text(serde_json::to_string(t).map_err(DbError::from)?),
        _ => DbParam::Null,
    };
    let mut stmts = vec![(
        "INSERT INTO journal_entries (user_id, climb_id, kind, sent, is_ascent, entry_date, body, tags, created_at, updated_at)
         VALUES (?, ?, ?, 0, 0, ?, ?, ?, ?, ?)".to_string(),
        vec![
            DbParam::Text(user_id.to_string()),
            DbParam::from(input.climb_id),
            DbParam::Text(input.kind.clone()),
            DbParam::Text(input.entry_date.clone()),
            opt_text(input.body.as_deref()),
            tags_param,
            DbParam::Int(now_ms),
            DbParam::Int(now_ms),
        ],
    )];
    if let Some(comp) = companion_list {
        stmts.push(build_companion_insert_stmt(
            user_id,
            comp,
            "last_insert_rowid()",
            None,
        )?);
    }
    if let Err(err) = db.batch(stmts).await {
        return Err(map_companion_or_invariant_error(err, SEND_CHANGED_MESSAGE));
    }
    Ok(())
}

pub async fn update_journal_entry_with_sync<D: DbExecutor>(
    db: &D,
    user_id: &str,
    entry_id: i64,
    input: &ValidatedJournalInput,
    carries_send_fields: bool,
    companions: Option<&[String]>,
    now_ms: i64,
) -> Result<(), MutationError> {
    let existing = get_journal_entry(db, entry_id, user_id)
        .await?
        .ok_or_else(|| MutationError::Validation("Entry not found".to_string()))?;

    if !input.sent && carries_send_fields {
        return Err(MutationError::Validation(
            "A session doesn't carry a rating or a grade".to_string(),
        ));
    }
    if input.sent != existing.sent {
        return Err(MutationError::Validation(
            if input.sent {
                "Log the ascent from the climb page — an existing entry can't be turned into a send"
            } else {
                "Delete the entry instead — an ascent can't be un-sent by editing it"
            }
            .to_string(),
        ));
    }
    if input.climb_id != existing.climb_id {
        return Err(MutationError::Validation(
            "Delete this entry and log a new one against the other climb".to_string(),
        ));
    }
    if existing.sent && input.entry_date != existing.entry_date {
        return Err(MutationError::Validation(
            "A sent session's date can't be changed after it is logged".to_string(),
        ));
    }
    if let Some(cid) = existing.climb_id
        && input.entry_date != existing.entry_date
    {
        let climb = get_climb_by_id(db, cid)
            .await?
            .ok_or_else(|| MutationError::Validation("Climb not found".to_string()))?;
        if let Err(msg) =
            assert_loggable_on_climb(climb.broken_on.as_deref(), Some(&input.entry_date))
        {
            return Err(MutationError::Validation(msg));
        }
    }

    let tags_param = match &input.tags {
        Some(t) if !t.is_empty() => DbParam::Text(serde_json::to_string(t).map_err(DbError::from)?),
        _ => DbParam::Null,
    };

    let mut stmts = vec![
        build_journal_entry_guard_stmt(
            existing.id,
            &existing.user_id,
            existing.climb_id,
            existing.sent,
            existing.is_ascent,
        ),
        (
            "UPDATE journal_entries SET kind = ?, entry_date = ?, body = ?, tags = ?, updated_at = ?
             WHERE id = ? AND user_id = ?"
                .to_string(),
            vec![
                DbParam::Text(input.kind.clone()),
                DbParam::Text(input.entry_date.clone()),
                opt_text(input.body.as_deref()),
                tags_param,
                DbParam::Int(now_ms),
                DbParam::Int(entry_id),
                DbParam::Text(user_id.to_string()),
            ],
        ),
    ];
    stmts.extend(build_companion_replacement_stmts(
        user_id, entry_id, companions,
    )?);

    if existing.is_ascent
        && let Some(cid) = existing.climb_id
    {
        stmts.push((
            "UPDATE sends SET comment = ?, updated_at = ?
             WHERE user_id = ? AND climb_id = ? AND EXISTS (
               SELECT 1 FROM journal_entries j
               WHERE j.id = ? AND j.user_id = ? AND j.climb_id = ? AND j.is_ascent = 1
             )"
            .to_string(),
            vec![
                opt_text(input.body.as_deref()),
                DbParam::Int(now_ms),
                DbParam::Text(user_id.to_string()),
                DbParam::Int(cid),
                DbParam::Int(entry_id),
                DbParam::Text(user_id.to_string()),
                DbParam::Int(cid),
            ],
        ));
    }

    if let Err(err) = db.batch(stmts).await {
        return Err(map_companion_or_invariant_error(
            err,
            "The entry changed — refresh and try again",
        ));
    }
    Ok(())
}

pub async fn delete_journal_entry_with_sync<D: DbExecutor>(
    db: &D,
    user_id: &str,
    entry_id: i64,
) -> Result<(), MutationError> {
    let existing = get_journal_entry(db, entry_id, user_id)
        .await?
        .ok_or_else(|| MutationError::Validation("Entry not found".to_string()))?;

    let mut stmts = vec![build_journal_entry_guard_stmt(
        existing.id,
        &existing.user_id,
        existing.climb_id,
        existing.sent,
        existing.is_ascent,
    )];

    if existing.is_ascent
        && let Some(cid) = existing.climb_id
    {
        stmts.push((
            "DELETE FROM sends
             WHERE user_id = ? AND climb_id = ?
               AND (SELECT j.id FROM journal_entries j WHERE j.user_id = ? AND j.climb_id = ? AND j.is_ascent = 1 LIMIT 1) = ?"
                .to_string(),
            vec![
                DbParam::Text(user_id.to_string()),
                DbParam::Int(cid),
                DbParam::Text(user_id.to_string()),
                DbParam::Int(cid),
                DbParam::Int(entry_id),
            ],
        ));
    }

    stmts.push((
        "DELETE FROM journal_entries WHERE id = ? AND user_id = ?".to_string(),
        vec![DbParam::Int(entry_id), DbParam::Text(user_id.to_string())],
    ));

    if let Err(err) = db.batch(stmts).await {
        return Err(map_companion_or_invariant_error(
            err,
            "The entry changed — refresh and try again",
        ));
    }
    Ok(())
}

pub async fn remove_my_journal_tag<D: DbExecutor>(
    db: &D,
    user_id: &str,
    entry_id: i64,
) -> Result<(), MutationError> {
    let mut params = vec![DbParam::Int(entry_id), DbParam::Text(user_id.to_string())];
    params.push(DbParam::Int(entry_id));
    let vis = journal_visible_sql(Some(user_id), "j.user_id", &mut params);
    let sql = format!(
        "UPDATE journal_companions SET suppressed = 1
         WHERE entry_id = ? AND user_id = ?
           AND EXISTS (SELECT 1 FROM journal_entries j WHERE j.id = ? AND {vis})
         RETURNING entry_id AS entryId"
    );
    let row = db.query_one(&sql, &params).await?;
    if row.is_none() {
        return Err(MutationError::Validation(
            "This tag is no longer available".to_string(),
        ));
    }
    Ok(())
}
