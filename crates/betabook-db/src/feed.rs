use betabook_domain::grades::{ClimbType, GradePreferences};
use betabook_domain::public_catalog::AreaBreadcrumbItem;
use betabook_domain::sends::{format_goal_title, parse_video_list_json};
use serde::{Deserialize, Serialize};

use crate::content_access::{
    accepted_friend_ids_sql, companions_json_sql, journal_visible_sql, send_comment_visible_sql,
};
use crate::executor::{DbError, DbExecutor, DbParam};
use crate::fts::clamp_page_size;

pub const FEED_PAGE_SIZE: usize = 20;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JournalCompanion {
    pub id: String,
    pub name: String,
    pub image: Option<String>,
    pub is_self: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FeedActivity {
    pub id: i64,
    pub kind: String,
    pub goal_title: Option<String>,
    pub climb_id: Option<i64>,
    pub climb_name: Option<String>,
    pub climb_type: Option<ClimbType>,
    pub climb_grade: Option<i64>,
    pub reported_grade: Option<i64>,
    pub grade_feel: Option<String>,
    pub area_id: Option<i64>,
    pub area_name: Option<String>,
    pub area_ancestors: Vec<AreaBreadcrumbItem>,
    pub ascent_style: Option<String>,
    pub body: Option<String>,
    pub videos: Option<Vec<String>>,
    pub companions: Vec<JournalCompanion>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FeedDay {
    pub user_id: String,
    pub name: String,
    pub image: Option<String>,
    pub date: String,
    pub journal_visible: bool,
    pub sends: i64,
    pub repeats: i64,
    pub sessions: i64,
    pub training: i64,
    pub goals: i64,
    pub activities: Vec<FeedActivity>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FeedPage {
    pub days: Vec<FeedDay>,
    pub has_more: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FeedCursor {
    pub date: String,
    pub user_id: String,
}

pub async fn get_feed_page<D: DbExecutor>(
    db: &D,
    viewer_id: &str,
    view: &str,
    cursor: Option<&FeedCursor>,
    page_size: usize,
    prefs: GradePreferences,
) -> Result<FeedPage, DbError> {
    let limit = clamp_page_size(page_size, FEED_PAGE_SIZE, FEED_PAGE_SIZE);
    let show_all = i64::from(view != "sends");
    let mut params = Vec::new();

    let friends_cte = accepted_friend_ids_sql(viewer_id, &mut params);
    let j_vis = journal_visible_sql(Some(viewer_id), "u.id", &mut params);
    let s_vis = send_comment_visible_sql(Some(viewer_id), "u.id", &mut params);

    let send_cursor = if let Some(c) = cursor {
        params.push(DbParam::Text(c.date.clone()));
        params.push(DbParam::Text(c.user_id.clone()));
        "AND (s.date_sent, s.user_id) < (?, ?)"
    } else {
        ""
    };

    params.push(DbParam::Int(show_all));
    let journal_cursor = if let Some(c) = cursor {
        params.push(DbParam::Text(c.date.clone()));
        params.push(DbParam::Text(c.user_id.clone()));
        "AND (j.entry_date, j.user_id) < (?, ?)"
    } else {
        ""
    };

    params.push(DbParam::Int(show_all));
    let goal_cursor = if let Some(c) = cursor {
        params.push(DbParam::Text(c.date.clone()));
        params.push(DbParam::Text(c.user_id.clone()));
        "AND (completion.completed_date, g.user_id) < (?, ?)"
    } else {
        ""
    };

    let companions_expr = if view != "sends" {
        let companion_entry_id = "(CASE WHEN p.kind = 'send' THEN (
            SELECT ascent.id FROM journal_entries ascent
            WHERE ascent.user_id = p.userId AND ascent.climb_id = p.climbId AND ascent.is_ascent = 1
            LIMIT 1
        ) ELSE p.id END)";
        let inner = companions_json_sql(Some(viewer_id), companion_entry_id, &mut params);
        format!("CASE WHEN p.journalVisible AND p.kind <> 'goal' THEN {inner} ELSE '[]' END")
    } else {
        "'[]'".to_string()
    };

    params.push(DbParam::Int((limit + 1) as i64));

    let sql = format!(
        "WITH friends AS ({friends_cte}), authors AS (
      SELECT u.id, u.name, u.image, {j_vis} AS journalVisible, {s_vis} AS sendCommentVisible
      FROM friends f JOIN user u ON u.id = f.id
      WHERE u.is_private = 0
    ), activity AS (
      SELECT s.user_id AS userId, s.date_sent AS date, s.id, 'send' AS kind,
        s.climb_id AS climbId, s.ascent_style AS ascentStyle,
        CASE WHEN u.sendCommentVisible THEN s.comment ELSE NULL END AS body,
        NULL AS goalDefinition,
        CASE WHEN u.sendCommentVisible THEN s.videos ELSE NULL END AS videos,
        u.name, u.image, u.journalVisible
      FROM authors u JOIN sends s ON s.user_id = u.id
      WHERE s.date_sent IS NOT NULL {send_cursor}
      UNION ALL
      SELECT j.user_id, j.entry_date, j.id,
        CASE WHEN j.kind = 'training' THEN 'training' WHEN j.sent = 1 THEN 'repeat' ELSE 'session' END,
        j.climb_id, NULL,
        CASE WHEN j.is_send_comment = 0 OR u.sendCommentVisible THEN j.body ELSE NULL END,
        NULL, NULL,
        u.name, u.image, u.journalVisible
      FROM authors u JOIN journal_entries j ON j.user_id = u.id
      WHERE ? = 1 AND u.journalVisible AND j.is_ascent = 0 {journal_cursor}
      UNION ALL
      SELECT g.user_id, completion.completed_date, completion.id, 'goal',
        NULL, NULL, NULL, completion.definition, NULL,
        u.name, u.image, u.journalVisible
      FROM authors u JOIN goals g ON g.user_id = u.id
      JOIN goal_completions completion ON completion.goal_id = g.id
      WHERE ? = 1 AND u.journalVisible AND completion.completed_date IS NOT NULL {goal_cursor}
    ), ranked AS (
      SELECT a.*,
        dense_rank() OVER (ORDER BY a.date DESC, a.userId DESC) AS dayRank,
        count(*) FILTER (WHERE a.kind = 'send') OVER day AS sends,
        count(*) FILTER (WHERE a.kind = 'repeat') OVER day AS repeats,
        count(*) FILTER (WHERE a.kind = 'session') OVER day AS sessions,
        count(*) FILTER (WHERE a.kind = 'training') OVER day AS training,
        count(*) FILTER (WHERE a.kind = 'goal') OVER day AS goals,
        row_number() OVER (
          PARTITION BY a.date, a.userId, (a.kind = 'goal') ORDER BY
            CASE a.kind WHEN 'goal' THEN -1 WHEN 'send' THEN 0 WHEN 'repeat' THEN 1 WHEN 'session' THEN 2 ELSE 3 END, a.id
        ) AS position
      FROM activity a
      WINDOW day AS (PARTITION BY a.date, a.userId)
    )
    SELECT p.userId, p.date, p.sends, p.repeats, p.sessions, p.training, p.goals,
      p.name, p.image, p.journalVisible,
      p.id, p.kind, p.climbId, p.ascentStyle, p.goalDefinition, p.videos,
      {companions_expr} AS companions,
      CASE WHEN length(p.body) > 240 THEN substr(p.body, 1, 240) || '…' ELSE p.body END AS body,
      c.name AS climbName, c.type AS climbType, c.grade AS climbGrade,
      reported.suggested_grade AS reportedGrade, reported.grade_feel AS gradeFeel,
      a.id AS areaId, a.name AS areaName,
      area_parent.id AS parentAreaId, area_parent.name AS parentAreaName,
      area_grandparent.id AS grandparentAreaId, area_grandparent.name AS grandparentAreaName
    FROM ranked p
    LEFT JOIN climbs c ON c.id = p.climbId
    LEFT JOIN areas a ON a.id = c.area_id
    LEFT JOIN sends reported ON reported.user_id = p.userId AND reported.climb_id = p.climbId
      AND p.kind IN ('send', 'repeat')
    LEFT JOIN areas area_parent ON area_parent.id = a.parent_id
    LEFT JOIN areas area_grandparent ON area_grandparent.id = area_parent.parent_id
    WHERE p.dayRank <= ? AND (p.position <= 3 OR p.kind = 'goal')
    ORDER BY p.date DESC, p.userId DESC, (p.kind = 'goal') DESC, p.position"
    );

    let rows = db.query_all(&sql, &params).await?;
    let mut days: Vec<FeedDay> = Vec::new();
    let mut index_by_key = std::collections::HashMap::<(String, String), usize>::new();

    for row in rows {
        let user_id = row.get_string("userId")?;
        let date = row.get_string("date")?;
        let key = (date.clone(), user_id.clone());
        let day_idx = match index_by_key.get(&key) {
            Some(&idx) => idx,
            None => {
                let idx = days.len();
                index_by_key.insert(key, idx);
                days.push(FeedDay {
                    user_id,
                    name: row.get_string("name")?,
                    image: row.get_opt_string("image")?,
                    date,
                    journal_visible: row.get_i64("journalVisible")? == 1,
                    sends: row.get_i64("sends")?,
                    repeats: row.get_i64("repeats")?,
                    sessions: row.get_i64("sessions")?,
                    training: row.get_i64("training")?,
                    goals: row.get_i64("goals")?,
                    activities: Vec::new(),
                });
                idx
            }
        };

        let mut ancestors = Vec::new();
        if let (Some(gid), Some(gname)) = (
            row.get_opt_i64("grandparentAreaId")?,
            row.get_opt_string("grandparentAreaName")?,
        ) {
            ancestors.push(AreaBreadcrumbItem {
                id: gid,
                name: gname,
            });
        }
        if let (Some(pid), Some(pname)) = (
            row.get_opt_i64("parentAreaId")?,
            row.get_opt_string("parentAreaName")?,
        ) {
            ancestors.push(AreaBreadcrumbItem {
                id: pid,
                name: pname,
            });
        }

        let goal_def = row.get_opt_string("goalDefinition")?;
        let goal_title = goal_def
            .as_deref()
            .and_then(|json| format_goal_title(json, prefs));
        let companions_raw = row.get_string("companions")?;
        let companions: Vec<JournalCompanion> =
            serde_json::from_str(&companions_raw).unwrap_or_default();
        let climb_type = row
            .get_opt_string("climbType")?
            .as_deref()
            .and_then(ClimbType::parse);
        let videos = parse_video_list_json(row.get_opt_string("videos")?.as_deref());

        days[day_idx].activities.push(FeedActivity {
            id: row.get_i64("id")?,
            kind: row.get_string("kind")?,
            goal_title,
            climb_id: row.get_opt_i64("climbId")?,
            climb_name: row.get_opt_string("climbName")?,
            climb_type,
            climb_grade: row.get_opt_i64("climbGrade")?,
            reported_grade: row.get_opt_i64("reportedGrade")?,
            grade_feel: row.get_opt_string("gradeFeel")?,
            area_id: row.get_opt_i64("areaId")?,
            area_name: row.get_opt_string("areaName")?,
            area_ancestors: ancestors,
            ascent_style: row.get_opt_string("ascentStyle")?,
            body: row.get_opt_string("body")?,
            videos,
            companions,
        });
    }

    let has_more = days.len() > limit;
    days.truncate(limit);
    Ok(FeedPage { days, has_more })
}
