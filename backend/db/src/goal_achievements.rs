//! Completion events and durable acknowledgement records for goal periods.
use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{DbError, DbExecutor, DbParam};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AchievementKey {
    id: i64,
    period_start: String,
    repeat: String,
}

impl AchievementKey {
    fn valid(&self) -> bool {
        let date = self.period_start.as_bytes();
        self.id > 0
            && matches!(self.repeat.as_str(), "none" | "week" | "month" | "year")
            && date.len() == 10
            && date.iter().enumerate().all(|(i, c)| {
                if matches!(i, 4 | 7) {
                    *c == b'-'
                } else {
                    c.is_ascii_digit()
                }
            })
    }

    pub fn parse_many(value: Option<&Value>) -> Option<Vec<Self>> {
        let values = value?.as_array()?;
        if values.len() > 1000 {
            return None;
        }
        values
            .iter()
            .map(|value| Self::deserialize(value).ok().filter(Self::valid))
            .collect()
    }
}

pub async fn acknowledge<D: DbExecutor>(
    db: &D,
    owner: &str,
    keys: &[AchievementKey],
    now: &str,
) -> Result<(), DbError> {
    db.execute(
        "UPDATE goal_achievements SET acknowledged_at=?1
         WHERE (goal_id,period_start,repeat) IN (
             SELECT json_extract(value,'$.id'),json_extract(value,'$.periodStart'),
                    json_extract(value,'$.repeat') FROM json_each(?2)
         ) AND goal_id IN (SELECT id FROM goals WHERE user_id=?3)",
        &[
            now.into(),
            serde_json::to_string(keys)?.into(),
            owner.into(),
        ],
    )
    .await?;
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Progress<'a> {
    id: i64,
    period_start: &'a str,
    repeat: &'a str,
    completed_date: Option<&'a str>,
    progress: i64,
    target: i64,
    timezone: &'a str,
}

/// Match the owner's full live period set to still-unacknowledged, reconciled events.
/// History pagination must not hide an otherwise unread notice.
pub async fn unseen<D: DbExecutor>(
    db: &D,
    owner: &str,
    periods: &[Value],
    today: &impl Fn(&str) -> Result<String, DbError>,
) -> Result<Vec<Value>, DbError> {
    if periods.is_empty() {
        return Ok(Vec::new());
    }
    let mut events = HashMap::new();
    for row in db
        .query_all(
            "SELECT c.goal_id, c.period_start, c.repeat, c.completed_date
         FROM goal_completions c JOIN goals g ON g.id=c.goal_id
         JOIN goal_achievements a ON a.goal_id=c.goal_id
             AND a.period_start=c.period_start AND a.repeat=c.repeat
         WHERE g.user_id=? AND c.completed_date IS NOT NULL AND a.acknowledged_at IS NULL",
            &[owner.into()],
        )
        .await?
    {
        let key = (
            row.get_i64("goal_id")?,
            row.get_string("period_start")?,
            row.get_string("repeat")?,
        );
        events.insert(key, row.get_string("completed_date")?);
    }
    let mut notices = Vec::new();
    let mut dates = HashMap::new();
    for value in periods {
        let p = Progress::deserialize(value)?;
        let Some(completed) = p.completed_date else {
            continue;
        };
        let key = (p.id, p.period_start.to_owned(), p.repeat.to_owned());
        if p.progress < p.target || events.get(&key).map(String::as_str) != Some(completed) {
            continue;
        }
        let zone_today = match dates.entry(p.timezone) {
            std::collections::hash_map::Entry::Occupied(e) => e.into_mut(),
            std::collections::hash_map::Entry::Vacant(e) => e.insert(today(p.timezone)?),
        };
        if completed <= zone_today.as_str() {
            notices.push(value.clone());
        }
    }
    Ok(notices)
}

/// Re-read periods *inside each write* in a single D1 transaction. A change of
/// timezone after the preliminary date lookup defers that goal until the next refresh.
pub async fn refresh<D: DbExecutor>(
    db: &D,
    owner: &str,
    now: &str,
    today: &impl Fn(&str) -> Result<String, DbError>,
) -> Result<(), DbError> {
    let dates = crate::goals::civil_dates(db, owner, owner, today).await?;
    if dates == "{}" {
        return Ok(());
    }
    let periods = crate::goals::periods_sql();
    let completed = format!(
        "SELECT * FROM ({periods}) current WHERE current.completedDate IS NOT NULL
         AND current.completedDate <= json_extract(?3, '$.\"' || current.timezone || '\"')"
    );
    let scoped = "SELECT g.id FROM goals g WHERE g.user_id=?1
        AND json_extract(?3,'$.\"' || g.timezone || '\"') IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM goal_periods h WHERE h.goal_id=g.id
          AND json_extract(?3,'$.\"' || h.timezone || '\"') IS NULL)";
    let full = vec![
        owner.into(),
        owner.into(),
        dates.clone().into(),
        DbParam::Null,
        DbParam::Null,
        DbParam::Null,
        0_i64.into(),
    ];
    let scope = vec![owner.into(), now.into(), dates.into()];
    db.batch(vec![
        (format!("DELETE FROM goal_completions WHERE goal_id IN ({scoped})
          AND NOT EXISTS (SELECT 1 FROM ({completed}) c WHERE c.id=goal_completions.goal_id
            AND c.periodStart=goal_completions.period_start AND c.repeat=goal_completions.repeat)"), full.clone()),
        (format!("INSERT INTO goal_completions(goal_id,period_start,repeat,completed_date,definition)
          SELECT c.id,c.periodStart,c.repeat,c.completedDate,json_object('kind',c.kind,'target',c.target,
            'discipline',c.discipline,'grade',c.grade,'repeat',c.repeat,'gradeMatch',c.gradeMatch,'tags',json(c.tags))
          FROM ({completed}) c WHERE c.id IN ({scoped})
          ON CONFLICT(goal_id,period_start,repeat) DO UPDATE SET
            completed_date=excluded.completed_date, definition=excluded.definition
          WHERE goal_completions.completed_date IS NOT excluded.completed_date
            OR goal_completions.definition IS NOT excluded.definition"), full),
        (format!("INSERT INTO goal_achievements(goal_id,period_start,repeat,detected_at,acknowledged_at)
          SELECT g.id,c.period_start,c.repeat,?2,CASE WHEN g.celebrations_initialized=0 THEN ?2 ELSE NULL END
          FROM goal_completions c JOIN goals g ON g.id=c.goal_id WHERE g.id IN ({scoped}) AND c.completed_date IS NOT NULL
          ON CONFLICT DO NOTHING"), scope.clone()),
        (format!("UPDATE goals SET celebrations_initialized=1 WHERE id IN ({scoped}) AND celebrations_initialized=0"),scope),
    ]).await
}
