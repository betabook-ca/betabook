//! Friend send alerts: one row per recipient, climber and send date.
//!
//! Rows carry no send facts. Every read joins the climber's current sends,
//! the accepted friendship, profile privacy and both alert settings, so an
//! alert disappears as soon as any of them stops allowing it.
use betabook_domain::grades::ClimbType;
use betabook_domain::sends::days_between;
use serde::Serialize;

use crate::content_access::accepted_friend_ids_sql;
use crate::{DbError, DbExecutor, DbParam};

/// Alerts listed on the notifications page.
const SEND_ALERT_LIMIT: i64 = 50;
/// Climbs named on one alert, newest send first; the count covers the rest.
pub const SEND_ALERT_CLIMBS: usize = 3;
/// Sends dated further back than this many days alert no one.
const SEND_ALERT_WINDOW_DAYS: i64 = 7;

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SendAlertClimb {
    pub id: i64,
    pub name: String,
    #[serde(rename = "type")]
    pub climb_type: Option<ClimbType>,
    pub grade: Option<i64>,
}

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SendAlert {
    pub user_id: String,
    pub name: String,
    pub image: Option<String>,
    pub date: String,
    pub sends: i64,
    pub climbs: Vec<SendAlertClimb>,
    pub updated_at: i64,
    pub unread: bool,
}

/// `today` is the UTC date; a climber east of UTC may already log tomorrow.
pub fn alerts_for_day(day: &str, today: &str) -> bool {
    days_between(day, today).is_some_and(|age| (-1..=SEND_ALERT_WINDOW_DAYS).contains(&age))
}

fn alert_allowed_sql(actor: &str, recipient: &str, day: &str) -> String {
    format!(
        "{actor}.is_private = 0 AND {actor}.send_alerts_to_friends = 1
         AND {recipient}.receive_friend_send_alerts = 1
         AND EXISTS (SELECT 1 FROM sends s WHERE s.user_id = {actor}.id AND s.date_sent = {day})"
    )
}

/// Records a new send dated `day` for each friend who may be alerted and
/// returns their ids. Same-day sends refresh one row and mark it unread.
pub async fn fan_out<D: DbExecutor>(
    db: &D,
    actor_id: &str,
    day: &str,
    now_ms: i64,
) -> Result<Vec<String>, DbError> {
    let mut params = vec![DbParam::Text(day.to_owned()), DbParam::Int(now_ms)];
    let friends = accepted_friend_ids_sql(actor_id, &mut params);
    params.extend([
        DbParam::Text(actor_id.to_owned()),
        DbParam::Text(day.to_owned()),
    ]);
    let allowed = alert_allowed_sql("actor", "recipient", "?");
    let sql = format!(
        "INSERT INTO send_alerts (recipient_id, actor_id, day, updated_at, read_at)
         SELECT recipient.id, actor.id, ?, ?, NULL
         FROM ({friends}) f
         JOIN user recipient ON recipient.id = f.id
         JOIN user actor ON actor.id = ?
         WHERE {allowed}
         ON CONFLICT (recipient_id, actor_id, day)
           DO UPDATE SET updated_at = excluded.updated_at, read_at = NULL
         RETURNING recipient_id"
    );
    db.query_all(&sql, &params)
        .await?
        .iter()
        .map(|row| row.get_string("recipient_id"))
        .collect()
}

/// The recipient's alerts that every current permission still allows.
fn visible_alerts_sql(recipient_id: &str, params: &mut Vec<DbParam>) -> String {
    let friends = accepted_friend_ids_sql(recipient_id, params);
    params.push(DbParam::Text(recipient_id.to_owned()));
    let allowed = alert_allowed_sql("actor", "me", "a.day");
    format!(
        "SELECT a.actor_id, a.day, a.updated_at, a.read_at, actor.name, actor.image
         FROM send_alerts a
         JOIN ({friends}) f ON f.id = a.actor_id
         JOIN user actor ON actor.id = a.actor_id
         JOIN user me ON me.id = a.recipient_id
         WHERE a.recipient_id = ? AND {allowed}"
    )
}

pub async fn list<D: DbExecutor>(db: &D, recipient_id: &str) -> Result<Vec<SendAlert>, DbError> {
    let mut params = Vec::new();
    let visible = visible_alerts_sql(recipient_id, &mut params);
    params.push(DbParam::Int(SEND_ALERT_LIMIT));
    let sql = format!(
        "WITH alerts AS ({visible} ORDER BY a.updated_at DESC, a.actor_id, a.day LIMIT ?)
         SELECT a.actor_id AS userId, a.day, a.updated_at AS updatedAt, a.read_at AS readAt,
                a.name, a.image, c.id AS climbId, c.name AS climbName, c.type AS climbType,
                c.grade AS climbGrade
         FROM alerts a
         JOIN sends s ON s.user_id = a.actor_id AND s.date_sent = a.day
         JOIN climbs c ON c.id = s.climb_id
         ORDER BY a.updated_at DESC, a.actor_id, a.day, s.id DESC"
    );
    let mut alerts: Vec<SendAlert> = Vec::new();
    for row in db.query_all(&sql, &params).await? {
        let user_id = row.get_string("userId")?;
        let date = row.get_string("day")?;
        let same = alerts
            .last()
            .is_some_and(|a| a.user_id == user_id && a.date == date);
        if !same {
            alerts.push(SendAlert {
                user_id,
                name: row.get_string("name")?,
                image: row.get_opt_string("image")?,
                date,
                sends: 0,
                climbs: Vec::new(),
                updated_at: row.get_i64("updatedAt")?,
                unread: row.get_opt_i64("readAt")?.is_none(),
            });
        }
        let Some(alert) = alerts.last_mut() else {
            continue;
        };
        alert.sends += 1;
        if alert.climbs.len() < SEND_ALERT_CLIMBS {
            alert.climbs.push(SendAlertClimb {
                id: row.get_i64("climbId")?,
                name: row.get_string("climbName")?,
                climb_type: row
                    .get_opt_string("climbType")?
                    .as_deref()
                    .and_then(ClimbType::parse),
                grade: row.get_opt_i64("climbGrade")?,
            });
        }
    }
    Ok(alerts)
}

pub async fn unread_count<D: DbExecutor>(db: &D, recipient_id: &str) -> Result<i64, DbError> {
    let mut params = Vec::new();
    let visible = visible_alerts_sql(recipient_id, &mut params);
    let row = db
        .query_one(
            &format!("SELECT count(*) AS count FROM ({visible}) WHERE read_at IS NULL"),
            &params,
        )
        .await?;
    Ok(row
        .and_then(|r| r.get_opt_i64("count").ok().flatten())
        .unwrap_or(0))
}

/// Reads the alerts the recipient was shown: those last updated at or before
/// `seen_through`, the newest `updated_at` on the page they loaded.
pub async fn mark_read<D: DbExecutor>(
    db: &D,
    recipient_id: &str,
    seen_through: i64,
    now_ms: i64,
) -> Result<(), DbError> {
    db.execute(
        "UPDATE send_alerts SET read_at = ?
         WHERE recipient_id = ? AND read_at IS NULL AND updated_at <= ?",
        &[
            DbParam::Int(now_ms),
            DbParam::Text(recipient_id.to_owned()),
            DbParam::Int(seen_through),
        ],
    )
    .await?;
    Ok(())
}

pub async fn update_preferences<D: DbExecutor>(
    db: &D,
    user_id: &str,
    share_with_friends: bool,
    receive: bool,
    now_ms: i64,
) -> Result<(), DbError> {
    db.execute(
        "UPDATE user SET send_alerts_to_friends = ?, receive_friend_send_alerts = ?, updated_at = ?
         WHERE id = ?",
        &[
            DbParam::Int(i64::from(share_with_friends)),
            DbParam::Int(i64::from(receive)),
            DbParam::Int(now_ms),
            DbParam::Text(user_id.to_owned()),
        ],
    )
    .await?;
    Ok(())
}

/// A device subscribed to push alerts. The endpoint is a capability URL:
/// never log it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PushTarget {
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
}

/// What one push says about a climber's send date.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PushSummary {
    pub name: String,
    pub sends: i64,
    pub first_climb: String,
}

/// Registers this device for the user, taking it over from any earlier account.
pub async fn save_push_subscription<D: DbExecutor>(
    db: &D,
    user_id: &str,
    target: &PushTarget,
) -> Result<(), DbError> {
    db.execute(
        "INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES (?, ?, ?, ?)
         ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id,
           p256dh = excluded.p256dh, auth = excluded.auth, created_at = excluded.created_at",
        &[
            DbParam::Text(target.endpoint.clone()),
            DbParam::Text(user_id.to_owned()),
            DbParam::Text(target.p256dh.clone()),
            DbParam::Text(target.auth.clone()),
        ],
    )
    .await?;
    Ok(())
}

pub async fn delete_push_subscription<D: DbExecutor>(
    db: &D,
    user_id: &str,
    endpoint: &str,
) -> Result<(), DbError> {
    db.execute(
        "DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?",
        &[
            DbParam::Text(endpoint.to_owned()),
            DbParam::Text(user_id.to_owned()),
        ],
    )
    .await?;
    Ok(())
}

/// Drops an endpoint the push service reported gone (404 or 410).
pub async fn forget_push_endpoint<D: DbExecutor>(db: &D, endpoint: &str) -> Result<(), DbError> {
    db.execute(
        "DELETE FROM push_subscriptions WHERE endpoint = ?",
        &[DbParam::Text(endpoint.to_owned())],
    )
    .await?;
    Ok(())
}

pub async fn push_targets<D: DbExecutor>(
    db: &D,
    recipient_ids: &[String],
) -> Result<Vec<PushTarget>, DbError> {
    if recipient_ids.is_empty() {
        return Ok(Vec::new());
    }
    db.query_all(
        "SELECT endpoint, p256dh, auth FROM push_subscriptions
         WHERE user_id IN (SELECT value FROM json_each(?)) ORDER BY endpoint",
        &[DbParam::Text(serde_json::to_string(recipient_ids)?)],
    )
    .await?
    .iter()
    .map(|row| {
        Ok(PushTarget {
            endpoint: row.get_string("endpoint")?,
            p256dh: row.get_string("p256dh")?,
            auth: row.get_string("auth")?,
        })
    })
    .collect()
}

/// The climber's name, their send count that day and the hardest climb.
pub async fn push_summary<D: DbExecutor>(
    db: &D,
    actor_id: &str,
    day: &str,
) -> Result<Option<PushSummary>, DbError> {
    let Some(row) = db
        .query_one(
            "SELECT u.name, count(*) OVER () AS sends, c.name AS climbName
             FROM sends s JOIN user u ON u.id = s.user_id JOIN climbs c ON c.id = s.climb_id
             WHERE s.user_id = ? AND s.date_sent = ?
             ORDER BY c.grade DESC, s.id LIMIT 1",
            &[
                DbParam::Text(actor_id.to_owned()),
                DbParam::Text(day.to_owned()),
            ],
        )
        .await?
    else {
        return Ok(None);
    };
    Ok(Some(PushSummary {
        name: row.get_string("name")?,
        sends: row.get_i64("sends")?,
        first_climb: row.get_string("climbName")?,
    }))
}
