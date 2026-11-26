use std::collections::{BTreeMap, BTreeSet};

use betabook_domain::grades::{ClimbType, GradePreferences, format_grade};
use betabook_domain::password::random_hex;
use betabook_domain::profile_share::friendship_pair;
use serde::Serialize;

use crate::content_access::accepted_friend_ids_sql;
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

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CompanionOption {
    pub id: String,
    pub name: String,
    pub image: Option<String>,
}

pub async fn search_companion_friends<D: DbExecutor>(
    db: &D,
    owner_id: &str,
    name: &str,
) -> Result<Vec<CompanionOption>, DbError> {
    let query: String = name.trim().chars().take(100).collect();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let mut params = Vec::new();
    let friends_cte = accepted_friend_ids_sql(owner_id, &mut params);
    params.push(DbParam::Text(query.clone()));
    params.push(DbParam::Text(query));
    let sql = format!(
        "WITH friends AS ({friends_cte})
         SELECT u.id, u.name, u.image FROM friends f CROSS JOIN user u ON u.id = f.id
         WHERE substr(u.name, 1, length(?)) = ? COLLATE NOCASE
         ORDER BY u.name COLLATE NOCASE, u.id LIMIT 20"
    );
    let rows = db.query_all(&sql, &params).await?;
    rows.into_iter()
        .map(|row| {
            Ok(CompanionOption {
                id: row.get_string("id")?,
                name: row.get_string("name")?,
                image: row.get_opt_string("image")?,
            })
        })
        .collect()
}

pub async fn get_journal_filter_friends<D: DbExecutor>(
    db: &D,
    owner_id: &str,
) -> Result<Vec<CompanionOption>, DbError> {
    let mut params = Vec::new();
    let friends_cte = accepted_friend_ids_sql(owner_id, &mut params);
    let sql = format!(
        "WITH friends AS ({friends_cte})
         SELECT u.id, u.name, u.image FROM friends f CROSS JOIN user u ON u.id = f.id
         ORDER BY u.name COLLATE NOCASE, u.id"
    );
    let rows = db.query_all(&sql, &params).await?;
    rows.into_iter()
        .map(|row| {
            Ok(CompanionOption {
                id: row.get_string("id")?,
                name: row.get_string("name")?,
                image: row.get_opt_string("image")?,
            })
        })
        .collect()
}

pub async fn get_friendship_status<D: DbExecutor>(
    db: &D,
    viewer_id: &str,
    target_id: &str,
) -> Result<String, DbError> {
    let (u1, u2) = friendship_pair(viewer_id, target_id);
    let Some(row) = db
        .query_one(
            "SELECT status, requested_by AS requestedBy
             FROM friendships WHERE user_id = ? AND friend_id = ? LIMIT 1",
            &[DbParam::Text(u1.to_string()), DbParam::Text(u2.to_string())],
        )
        .await?
    else {
        return Ok("none".to_string());
    };
    let status = row.get_string("status")?;
    if status == "accepted" {
        return Ok("friends".to_string());
    }
    let requested_by = row.get_string("requestedBy")?;
    Ok(if requested_by == viewer_id {
        "outgoing".to_string()
    } else {
        "incoming".to_string()
    })
}

pub async fn accept_friend_request<D: DbExecutor>(
    db: &D,
    viewer_id: &str,
    target_id: &str,
) -> Result<bool, DbError> {
    let (u1, u2) = friendship_pair(viewer_id, target_id);
    let row = db
        .query_one(
            "UPDATE friendships SET status = 'accepted'
             WHERE user_id = ? AND friend_id = ? AND requested_by = ?
             RETURNING user_id",
            &[
                DbParam::Text(u1.to_string()),
                DbParam::Text(u2.to_string()),
                DbParam::Text(target_id.to_string()),
            ],
        )
        .await?;
    Ok(row.is_some())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FriendshipEndOp {
    Cancel,
    Decline,
    Remove,
}

pub async fn end_friendship_relationship<D: DbExecutor>(
    db: &D,
    viewer_id: &str,
    target_id: &str,
    op: FriendshipEndOp,
) -> Result<bool, DbError> {
    let (u1, u2) = friendship_pair(viewer_id, target_id);
    let row = match op {
        FriendshipEndOp::Remove => {
            db.query_one(
                "DELETE FROM friendships WHERE user_id = ? AND friend_id = ? AND status = 'accepted' RETURNING user_id",
                &[DbParam::Text(u1.to_string()), DbParam::Text(u2.to_string())],
            )
            .await?
        }
        FriendshipEndOp::Cancel => {
            db.query_one(
                "DELETE FROM friendships WHERE user_id = ? AND friend_id = ? AND status = 'pending' AND requested_by = ? RETURNING user_id",
                &[
                    DbParam::Text(u1.to_string()),
                    DbParam::Text(u2.to_string()),
                    DbParam::Text(viewer_id.to_string()),
                ],
            )
            .await?
        }
        FriendshipEndOp::Decline => {
            db.query_one(
                "DELETE FROM friendships WHERE user_id = ? AND friend_id = ? AND status = 'pending' AND requested_by = ? RETURNING user_id",
                &[
                    DbParam::Text(u1.to_string()),
                    DbParam::Text(u2.to_string()),
                    DbParam::Text(target_id.to_string()),
                ],
            )
            .await?
        }
    };
    if row.is_some() {
        return Ok(true);
    }
    Ok(get_friendship_status(db, viewer_id, target_id).await? == "none")
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UserProfileRow {
    pub id: String,
    pub name: String,
    pub image: Option<String>,
    pub is_private: bool,
}

pub async fn get_user_profile<D: DbExecutor>(
    db: &D,
    user_id: &str,
) -> Result<Option<UserProfileRow>, DbError> {
    let Some(row) = db
        .query_one(
            "SELECT id, name, image, is_private AS isPrivate FROM user WHERE id = ? LIMIT 1",
            &[DbParam::Text(user_id.to_string())],
        )
        .await?
    else {
        return Ok(None);
    };
    Ok(Some(UserProfileRow {
        id: row.get_string("id")?,
        name: row.get_string("name")?,
        image: row.get_opt_string("image")?,
        is_private: row.get_i64("isPrivate")? == 1,
    }))
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AccountUserRow {
    pub id: String,
    pub name: String,
    pub email: String,
    pub image: Option<String>,
    pub role: Option<String>,
    pub is_private: bool,
    pub journal_visibility: String,
    pub send_comment_visibility: String,
    pub trip_visibility: String,
    pub climb_list_visibility: String,
    pub boulder_grade_scale: String,
    pub rope_grade_scale: String,
}

pub async fn get_account_user<D: DbExecutor>(
    db: &D,
    user_id: &str,
) -> Result<Option<AccountUserRow>, DbError> {
    let Some(row) = db
        .query_one(
            "SELECT id, name, email, image, role, is_private AS isPrivate,
                    journal_visibility AS journalVisibility,
                    send_comment_visibility AS sendCommentVisibility,
                    trip_visibility AS tripVisibility,
                    climb_list_visibility AS climbListVisibility,
                    boulder_grade_scale AS boulderGradeScale,
                    rope_grade_scale AS ropeGradeScale
             FROM user WHERE id = ? LIMIT 1",
            &[DbParam::Text(user_id.to_string())],
        )
        .await?
    else {
        return Ok(None);
    };
    Ok(Some(AccountUserRow {
        id: row.get_string("id")?,
        name: row.get_string("name")?,
        email: row.get_string("email")?,
        image: row.get_opt_string("image")?,
        role: row.get_opt_string("role")?,
        is_private: row.get_i64("isPrivate")? == 1,
        journal_visibility: row.get_string("journalVisibility")?,
        send_comment_visibility: row.get_string("sendCommentVisibility")?,
        trip_visibility: row.get_string("tripVisibility")?,
        climb_list_visibility: row.get_string("climbListVisibility")?,
        boulder_grade_scale: row.get_string("boulderGradeScale")?,
        rope_grade_scale: row.get_string("ropeGradeScale")?,
    }))
}

pub async fn get_profile_share_token<D: DbExecutor>(
    db: &D,
    user_id: &str,
) -> Result<Option<String>, DbError> {
    let row = db
        .query_one(
            "SELECT token FROM profile_share_links WHERE user_id = ? LIMIT 1",
            &[DbParam::Text(user_id.to_string())],
        )
        .await?;
    Ok(row.and_then(|r| r.get_opt_string("token").ok().flatten()))
}

pub async fn reset_profile_share_link<D: DbExecutor>(db: &D, user_id: &str) -> Result<(), DbError> {
    let token = random_hex(16).map_err(|e| DbError::Query(e.to_string()))?;
    db.execute(
        "INSERT INTO profile_share_links (user_id, token) VALUES (?, ?)
         ON CONFLICT (user_id) DO UPDATE SET token = excluded.token",
        &[DbParam::Text(user_id.to_string()), DbParam::Text(token)],
    )
    .await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProductTourProgressRow {
    pub tour_id: String,
    pub version: i64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProductTourState {
    pub returning: bool,
    pub progress: Vec<ProductTourProgressRow>,
}

pub async fn get_product_tour_state<D: DbExecutor>(
    db: &D,
    user_id: &str,
) -> Result<Option<ProductTourState>, DbError> {
    let Some(owner) = db
        .query_one(
            "SELECT product_tour_returning AS productTourReturning FROM user WHERE id = ? LIMIT 1",
            &[DbParam::Text(user_id.to_string())],
        )
        .await?
    else {
        return Ok(None);
    };
    let returning = owner.get_i64("productTourReturning")? == 1;
    let rows = db
        .query_all(
            "SELECT tour_id AS tourId, version, status FROM user_product_tours WHERE user_id = ?",
            &[DbParam::Text(user_id.to_string())],
        )
        .await?;
    let progress = rows
        .into_iter()
        .map(|row| {
            Ok(ProductTourProgressRow {
                tour_id: row.get_string("tourId")?,
                version: row.get_i64("version")?,
                status: row.get_string("status")?,
            })
        })
        .collect::<Result<Vec<_>, DbError>>()?;
    Ok(Some(ProductTourState {
        returning,
        progress,
    }))
}

pub async fn update_user_display_name<D: DbExecutor>(
    db: &D,
    user_id: &str,
    name: &str,
    now_ms: i64,
) -> Result<(), DbError> {
    db.execute(
        "UPDATE user SET name = ?, updated_at = ? WHERE id = ?",
        &[
            DbParam::Text(name.to_string()),
            DbParam::Int(now_ms),
            DbParam::Text(user_id.to_string()),
        ],
    )
    .await?;
    Ok(())
}

pub async fn update_user_image<D: DbExecutor>(
    db: &D,
    user_id: &str,
    image: Option<&str>,
    now_ms: i64,
) -> Result<(), DbError> {
    db.execute(
        "UPDATE user SET image = ?, updated_at = ? WHERE id = ?",
        &[
            opt_text_param(image),
            DbParam::Int(now_ms),
            DbParam::Text(user_id.to_string()),
        ],
    )
    .await?;
    Ok(())
}

pub async fn update_user_private<D: DbExecutor>(
    db: &D,
    user_id: &str,
    is_private: bool,
    now_ms: i64,
) -> Result<(), DbError> {
    db.execute(
        "UPDATE user SET is_private = ?, updated_at = ? WHERE id = ?",
        &[
            DbParam::Int(i64::from(is_private)),
            DbParam::Int(now_ms),
            DbParam::Text(user_id.to_string()),
        ],
    )
    .await?;
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VisibilityColumn {
    Journal,
    SendComment,
    Trip,
    ClimbList,
}

impl VisibilityColumn {
    fn sql_column(self) -> &'static str {
        match self {
            Self::Journal => "journal_visibility",
            Self::SendComment => "send_comment_visibility",
            Self::Trip => "trip_visibility",
            Self::ClimbList => "climb_list_visibility",
        }
    }
}

pub async fn update_user_visibility<D: DbExecutor>(
    db: &D,
    user_id: &str,
    col: VisibilityColumn,
    value: &str,
    now_ms: i64,
) -> Result<(), DbError> {
    let sql = format!(
        "UPDATE user SET {} = ?, updated_at = ? WHERE id = ?",
        col.sql_column()
    );
    db.execute(
        &sql,
        &[
            DbParam::Text(value.to_string()),
            DbParam::Int(now_ms),
            DbParam::Text(user_id.to_string()),
        ],
    )
    .await?;
    Ok(())
}

pub async fn update_user_grade_preferences<D: DbExecutor>(
    db: &D,
    user_id: &str,
    boulder_scale: &str,
    rope_scale: &str,
    now_ms: i64,
) -> Result<(), DbError> {
    db.execute(
        "UPDATE user SET boulder_grade_scale = ?, rope_grade_scale = ?, updated_at = ? WHERE id = ?",
        &[
            DbParam::Text(boulder_scale.to_string()),
            DbParam::Text(rope_scale.to_string()),
            DbParam::Int(now_ms),
            DbParam::Text(user_id.to_string()),
        ],
    )
    .await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HardestSend {
    #[serde(rename = "type")]
    pub climb_type: ClimbType,
    pub grade: String,
}

pub async fn get_climber_hardest<D: DbExecutor>(
    db: &D,
    user_id: &str,
    prefs: GradePreferences,
) -> Result<Vec<HardestSend>, DbError> {
    let rows = db
        .query_all(
            "SELECT climbs.type AS type, MAX(climbs.grade) AS maxGrade
             FROM sends JOIN climbs ON climbs.id = sends.climb_id
             WHERE sends.user_id = ?
             GROUP BY climbs.type
             ORDER BY COUNT(*) DESC, climbs.type",
            &[DbParam::Text(user_id.to_string())],
        )
        .await?;
    let mut out = Vec::new();
    for row in rows {
        if let Some(max_grade) = row.get_opt_i64("maxGrade")? {
            let ct = ClimbType::parse(&row.get_string("type")?).ok_or(DbError::Column("type"))?;
            out.push(HardestSend {
                climb_type: ct,
                grade: format_grade(ct, Some(max_grade), prefs).to_string(),
            });
        }
    }
    Ok(out)
}
