//! Friend send alerts: one row per recipient, climber and send date.
//!
//! Rows carry no send facts. Every read joins the climber's current sends,
//! the accepted friendship, profile privacy and both alert settings, so an
//! alert disappears as soon as any of them stops allowing it.
use betabook_domain::grades::ClimbType;
use serde::Serialize;

use crate::content_access::accepted_friend_ids_sql;
use crate::{DbError, DbExecutor, DbParam};

/// Alerts listed on the notifications page.
pub const SEND_ALERT_LIMIT: usize = 50;
/// Climbs named on one alert, newest send first; the count covers the rest.
pub const SEND_ALERT_CLIMBS: usize = 3;
/// Sends dated further back than this many days alert no one.
pub const SEND_ALERT_WINDOW_DAYS: i64 = 7;

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

/// Records a new send dated `day` for each friend who may be alerted and
/// returns their ids. Same-day sends refresh one row and mark it unread.
pub async fn fan_out<D: DbExecutor>(
    db: &D,
    actor_id: &str,
    day: &str,
    today: &str,
    now_ms: i64,
) -> Result<Vec<String>, DbError> {
    let mut params = vec![DbParam::Text(day.to_owned()), DbParam::Int(now_ms)];
    let friends = accepted_friend_ids_sql(actor_id, &mut params);
    params.extend([
        DbParam::Text(actor_id.to_owned()),
        DbParam::Text(day.to_owned()),
        DbParam::Text(day.to_owned()),
        DbParam::Text(today.to_owned()),
        DbParam::Int(SEND_ALERT_WINDOW_DAYS),
        DbParam::Text(today.to_owned()),
    ]);
    // `today` is the UTC date; a climber east of UTC may already log tomorrow.
    let sql = format!(
        "INSERT INTO send_alerts (recipient_id, actor_id, day, updated_at, read_at)
         SELECT recipient.id, actor.id, ?, ?, NULL
         FROM ({friends}) f
         JOIN user recipient ON recipient.id = f.id
         JOIN user actor ON actor.id = ?
         WHERE actor.is_private = 0 AND actor.send_alerts_to_friends = 1
           AND recipient.receive_friend_send_alerts = 1
           AND EXISTS (SELECT 1 FROM sends s WHERE s.user_id = actor.id AND s.date_sent = ?)
           AND ? BETWEEN date(?, '-' || ? || ' days') AND date(?, '+1 day')
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
    format!(
        "SELECT a.actor_id, a.day, a.updated_at, a.read_at, actor.name, actor.image
         FROM send_alerts a
         JOIN ({friends}) f ON f.id = a.actor_id
         JOIN user actor ON actor.id = a.actor_id
         JOIN user me ON me.id = a.recipient_id
         WHERE a.recipient_id = ?
           AND actor.is_private = 0 AND actor.send_alerts_to_friends = 1
           AND me.receive_friend_send_alerts = 1
           AND EXISTS (SELECT 1 FROM sends s WHERE s.user_id = a.actor_id AND s.date_sent = a.day)"
    )
}

pub async fn list<D: DbExecutor>(
    db: &D,
    recipient_id: &str,
    limit: usize,
) -> Result<Vec<SendAlert>, DbError> {
    let mut params = Vec::new();
    let visible = visible_alerts_sql(recipient_id, &mut params);
    params.push(DbParam::Int(limit as i64));
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
