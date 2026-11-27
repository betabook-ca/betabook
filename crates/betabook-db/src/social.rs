use std::collections::{BTreeMap, BTreeSet};

use serde::Serialize;

use crate::executor::{DbError, DbExecutor, DbParam};
use crate::fts::{clamp_offset, clamp_page_size, literal_prefix_condition};

pub const FRIENDS_PAGE_SIZE: usize = 10;
pub const CLIMBERS_PAGE_SIZE: usize = 20;
pub const AREA_SEARCH_PAGE_SIZE: usize = 25;
pub const CLIMB_VIDEO_LIMIT: i64 = 8;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClimbVideo {
    pub video_url: String,
    pub user_id: Option<String>,
    pub user_name: String,
    pub user_image: Option<String>,
    pub ascent_style: String,
    pub date_sent: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClimbVideos {
    pub videos: Vec<ClimbVideo>,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClimberRow {
    pub id: String,
    pub name: String,
    pub image: Option<String>,
    pub friendship_status: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClimbersPage {
    pub climbers: Vec<ClimberRow>,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FriendRow {
    pub id: String,
    pub name: String,
    pub image: Option<String>,
    pub is_private: bool,
    pub friendship_status: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FriendsPage {
    pub friends: Vec<FriendRow>,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SuggestedClimberRow {
    pub id: String,
    pub name: String,
    pub image: Option<String>,
    pub friendship_status: String,
    pub mutual_friend_count: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClimbSendStats {
    pub avg_rating: Option<f64>,
    pub send_count: i64,
    pub avg_suggested_grade: Option<f64>,
}

fn opt_text_param(value: Option<&str>) -> DbParam {
    match value {
        Some(text) => DbParam::Text(text.to_string()),
        None => DbParam::Null,
    }
}

pub async fn get_climb_videos<D: DbExecutor>(
    db: &D,
    climb_id: i64,
    viewer_id: Option<&str>,
    limit: i64,
) -> Result<ClimbVideos, DbError> {
    let viewer = opt_text_param(viewer_id);
    let rows = db
        .query_all(
            "SELECT
      link.value AS videoUrl,
      CASE WHEN ? IS NOT NULL THEN sends.user_id END AS userId,
      user.name AS userName,
      user.image AS userImage,
      sends.ascent_style AS ascentStyle,
      sends.date_sent AS dateSent,
      count(*) OVER () AS total
    FROM sends
    JOIN user ON user.id = sends.user_id
    JOIN json_each(sends.videos) AS link
    WHERE sends.climb_id = ?
      AND EXISTS (
        SELECT 1 FROM user content_owner
        WHERE content_owner.id = sends.user_id AND (
          content_owner.id = ? OR (content_owner.is_private = 0 AND (
            content_owner.send_comment_visibility = 'everyone' OR (? IS NOT NULL AND (
              content_owner.send_comment_visibility = 'public' OR (
                content_owner.send_comment_visibility = 'friends' AND EXISTS (
                  SELECT 1 FROM friendships WHERE user_id = min(content_owner.id, ?)
                    AND friend_id = max(content_owner.id, ?) AND status = 'accepted'
                )
              )
            ))
          ))
        )
      )
    ORDER BY sends.date_sent DESC, sends.id ASC, link.key ASC
    LIMIT ?",
            &[
                viewer.clone(),
                DbParam::Int(climb_id),
                viewer.clone(),
                viewer.clone(),
                viewer.clone(),
                viewer,
                DbParam::Int(limit),
            ],
        )
        .await?;

    let total = rows
        .first()
        .and_then(|r| r.get_opt_i64("total").ok().flatten())
        .unwrap_or(0);
    let videos = rows
        .into_iter()
        .map(|row| {
            Ok(ClimbVideo {
                video_url: row.get_string("videoUrl")?,
                user_id: row.get_opt_string("userId")?,
                user_name: row.get_string("userName")?,
                user_image: row.get_opt_string("userImage")?,
                ascent_style: row.get_string("ascentStyle")?,
                date_sent: row.get_opt_string("dateSent")?,
            })
        })
        .collect::<Result<Vec<_>, DbError>>()?;

    Ok(ClimbVideos { videos, total })
}

pub async fn get_pending_friend_request_count<D: DbExecutor>(
    db: &D,
    viewer_id: &str,
) -> Result<i64, DbError> {
    let row = db
        .query_one(
            "SELECT count(*) AS count FROM (
      SELECT friend_id AS id, requested_by FROM friendships WHERE user_id = ? AND status = 'pending'
      UNION ALL
      SELECT user_id AS id, requested_by FROM friendships WHERE friend_id = ? AND status = 'pending'
    ) WHERE requested_by <> ?",
            &[
                DbParam::Text(viewer_id.to_string()),
                DbParam::Text(viewer_id.to_string()),
                DbParam::Text(viewer_id.to_string()),
            ],
        )
        .await?;
    Ok(row
        .and_then(|r| r.get_opt_i64("count").ok().flatten())
        .unwrap_or(0))
}

pub async fn get_friends_page<D: DbExecutor>(
    db: &D,
    viewer_id: &str,
    requests_only: bool,
    offset: usize,
) -> Result<FriendsPage, DbError> {
    let start = clamp_offset(offset);
    let status = if requests_only { "pending" } else { "accepted" };
    let (status_col, order_by, mut params) = if requests_only {
        (
            "CASE WHEN c.requested_by = ? THEN 'outgoing' ELSE 'incoming' END AS friendshipStatus",
            "c.created_at DESC, u.id DESC",
            vec![
                DbParam::Text(viewer_id.to_string()),
                DbParam::Text(status.to_string()),
                DbParam::Text(viewer_id.to_string()),
                DbParam::Text(status.to_string()),
                DbParam::Text(viewer_id.to_string()),
            ],
        )
    } else {
        (
            "'friends' AS friendshipStatus",
            "u.name COLLATE NOCASE, u.id",
            vec![
                DbParam::Text(viewer_id.to_string()),
                DbParam::Text(status.to_string()),
                DbParam::Text(viewer_id.to_string()),
                DbParam::Text(status.to_string()),
            ],
        )
    };
    params.push(DbParam::Int((FRIENDS_PAGE_SIZE + 1) as i64));
    params.push(DbParam::Int(start as i64));

    let sql = format!(
        "WITH counterparts AS (
      SELECT friend_id AS id, requested_by, created_at FROM friendships WHERE user_id = ? AND status = ?
      UNION ALL
      SELECT user_id AS id, requested_by, created_at FROM friendships WHERE friend_id = ? AND status = ?
    )
    SELECT u.id, u.name, u.image, u.is_private AS isPrivate, {status_col}
    FROM counterparts c CROSS JOIN user u ON u.id = c.id
    ORDER BY {order_by}
    LIMIT ? OFFSET ?"
    );

    let rows = db.query_all(&sql, &params).await?;
    let has_more = rows.len() > FRIENDS_PAGE_SIZE;
    let friends = rows
        .into_iter()
        .take(FRIENDS_PAGE_SIZE)
        .map(|row| {
            Ok(FriendRow {
                id: row.get_string("id")?,
                name: row.get_string("name")?,
                image: row.get_opt_string("image")?,
                is_private: row.get_i64("isPrivate")? == 1,
                friendship_status: row.get_string("friendshipStatus")?,
            })
        })
        .collect::<Result<Vec<_>, DbError>>()?;

    Ok(FriendsPage { friends, has_more })
}

pub async fn get_climbers_page<D: DbExecutor>(
    db: &D,
    viewer_id: Option<&str>,
    name: &str,
    offset: usize,
    page_size: usize,
) -> Result<ClimbersPage, DbError> {
    let query: String = name.trim().chars().take(100).collect();
    if query.is_empty() {
        return Ok(ClimbersPage {
            climbers: Vec::new(),
            has_more: false,
        });
    }
    let limit = clamp_page_size(page_size, CLIMBERS_PAGE_SIZE, CLIMBERS_PAGE_SIZE);
    let start = clamp_offset(offset);
    let viewer = opt_text_param(viewer_id);

    let mut params = vec![
        viewer.clone(),
        viewer.clone(),
        viewer.clone(),
        viewer.clone(),
        viewer,
    ];
    let prefix_cond = literal_prefix_condition("u.name", &query, &mut params);
    params.push(DbParam::Text(query));
    params.push(DbParam::Int((limit + 1) as i64));
    params.push(DbParam::Int(start as i64));

    let sql = format!(
        "SELECT u.id, u.name, u.image,
      CASE WHEN f.status = 'accepted' THEN 'friends' WHEN f.requested_by = ? THEN 'outgoing'
        WHEN f.status = 'pending' THEN 'incoming' ELSE 'none' END AS friendshipStatus
    FROM user u LEFT JOIN friendships f ON f.user_id = min(u.id, ?) AND f.friend_id = max(u.id, ?)
    WHERE u.is_private = 0 AND (? IS NULL OR u.id <> ?)
      AND {prefix_cond}
    ORDER BY (u.name = ? COLLATE NOCASE) DESC, u.name COLLATE NOCASE, u.id
    LIMIT ? OFFSET ?"
    );

    let rows = db.query_all(&sql, &params).await?;
    let has_more = rows.len() > limit;
    let climbers = rows
        .into_iter()
        .take(limit)
        .map(|row| {
            Ok(ClimberRow {
                id: row.get_string("id")?,
                name: row.get_string("name")?,
                image: row.get_opt_string("image")?,
                friendship_status: row.get_string("friendshipStatus")?,
            })
        })
        .collect::<Result<Vec<_>, DbError>>()?;

    Ok(ClimbersPage { climbers, has_more })
}

pub async fn get_climber_suggestions<D: DbExecutor>(
    db: &D,
    viewer_id: &str,
    limit: usize,
) -> Result<Vec<SuggestedClimberRow>, DbError> {
    let count = clamp_page_size(limit, 6, 20);
    let v = DbParam::Text(viewer_id.to_string());
    let rows = db
        .query_all(
            "WITH friends AS (
      SELECT friend_id AS id FROM friendships WHERE user_id = ? AND status = 'accepted'
      UNION ALL
      SELECT user_id AS id FROM friendships WHERE friend_id = ? AND status = 'accepted'
    ),
    via AS (SELECT friends.id FROM friends JOIN user u ON u.id = friends.id WHERE u.is_private = 0),
    reachable AS (
      SELECT f.friend_id AS id FROM via JOIN friendships f ON f.user_id = via.id AND f.status = 'accepted'
      UNION ALL
      SELECT f.user_id FROM via JOIN friendships f ON f.friend_id = via.id AND f.status = 'accepted'
    ),
    candidates AS (
      SELECT id, count(*) AS mutualFriendCount FROM reachable WHERE id <> ? GROUP BY id
    )
    SELECT u.id, u.name, u.image, 'none' AS friendshipStatus, c.mutualFriendCount
    FROM candidates c JOIN user u ON u.id = c.id
    WHERE u.is_private = 0
      AND NOT EXISTS (
        SELECT 1 FROM friendships f
        WHERE f.user_id = min(u.id, ?) AND f.friend_id = max(u.id, ?)
      )
    ORDER BY c.mutualFriendCount DESC, u.name COLLATE NOCASE, u.id
    LIMIT ?",
            &[
                v.clone(),
                v.clone(),
                v.clone(),
                v.clone(),
                v,
                DbParam::Int(count as i64),
            ],
        )
        .await?;

    rows.into_iter()
        .map(|row| {
            Ok(SuggestedClimberRow {
                id: row.get_string("id")?,
                name: row.get_string("name")?,
                image: row.get_opt_string("image")?,
                friendship_status: row.get_string("friendshipStatus")?,
                mutual_friend_count: row.get_i64("mutualFriendCount")?,
            })
        })
        .collect()
}

pub async fn get_climb_send_stats<D: DbExecutor>(
    db: &D,
    climb_ids: &[i64],
) -> Result<BTreeMap<i64, ClimbSendStats>, DbError> {
    let distinct: Vec<i64> = climb_ids
        .iter()
        .copied()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let mut stats: BTreeMap<i64, ClimbSendStats> = distinct
        .iter()
        .map(|&id| {
            (
                id,
                ClimbSendStats {
                    avg_rating: None,
                    send_count: 0,
                    avg_suggested_grade: None,
                },
            )
        })
        .collect();
    if distinct.is_empty() {
        return Ok(stats);
    }

    let ids_json = serde_json::to_string(&distinct)?;
    let rows = db
        .query_all(
            "SELECT climb_id AS climbId, AVG(rating) AS avgRating, COUNT(*) AS sendCount,
           AVG(suggested_grade + CASE grade_feel
                 WHEN 'low' THEN -0.3
                 WHEN 'high' THEN 0.3
                 ELSE 0 END) AS avgSuggestedGrade
    FROM sends
    WHERE climb_id IN (
      SELECT CAST(value AS INTEGER) FROM json_each(?)
    )
    GROUP BY climb_id",
            &[DbParam::Text(ids_json)],
        )
        .await?;

    for row in rows {
        let climb_id = row.get_i64("climbId")?;
        stats.insert(
            climb_id,
            ClimbSendStats {
                avg_rating: row.get_opt_f64("avgRating")?,
                send_count: row.get_i64("sendCount")?,
                avg_suggested_grade: row.get_opt_f64("avgSuggestedGrade")?,
            },
        );
    }
    Ok(stats)
}

pub async fn get_user_sent_climb_ids<D: DbExecutor>(
    db: &D,
    user_id: &str,
    climb_ids: &[i64],
) -> Result<Vec<i64>, DbError> {
    let distinct: Vec<i64> = climb_ids
        .iter()
        .copied()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    if distinct.is_empty() {
        return Ok(Vec::new());
    }
    let ids_json = serde_json::to_string(&distinct)?;
    let rows = db
        .query_all(
            "SELECT DISTINCT sends.climb_id AS climbId
    FROM sends
    WHERE sends.user_id = ?
      AND sends.climb_id IN (
        SELECT CAST(value AS INTEGER) FROM json_each(?)
      )",
            &[DbParam::Text(user_id.to_string()), DbParam::Text(ids_json)],
        )
        .await?;

    rows.into_iter().map(|row| row.get_i64("climbId")).collect()
}

pub async fn dismiss_feature_announcement<D: DbExecutor>(
    db: &D,
    user_id: &str,
    feature_id: &str,
) -> Result<(), DbError> {
    db.execute(
        "INSERT OR IGNORE INTO feature_announcement_dismissals (user_id, feature_id) VALUES (?, ?)",
        &[
            DbParam::Text(user_id.to_string()),
            DbParam::Text(feature_id.to_string()),
        ],
    )
    .await?;
    Ok(())
}

pub async fn upsert_product_tour_status<D: DbExecutor>(
    db: &D,
    user_id: &str,
    tour_id: &str,
    version: i64,
    status: &str,
) -> Result<(), DbError> {
    db.execute(
        "INSERT INTO user_product_tours (user_id, tour_id, version, status)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, tour_id) DO UPDATE SET
           version = excluded.version,
           status = excluded.status
         WHERE user_product_tours.version <= excluded.version
           AND (
             excluded.status <> 'dismissed'
             OR user_product_tours.version < excluded.version
             OR user_product_tours.status <> 'completed'
           )",
        &[
            DbParam::Text(user_id.to_string()),
            DbParam::Text(tour_id.to_string()),
            DbParam::Int(version),
            DbParam::Text(status.to_string()),
        ],
    )
    .await?;
    Ok(())
}
