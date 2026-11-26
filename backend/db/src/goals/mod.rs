//! Goal reads recheck journal visibility in each statement that accesses progress.
use std::collections::BTreeMap;

use crate::content_access::journal_visible_sql;
use crate::{DbError, DbExecutor};

fn visibility() -> String {
    // The owner and viewer are bound once even when a CTE reuses the predicate.
    journal_visible_sql(None, "g.user_id", &mut Vec::new()).replace('?', "?2")
}

pub async fn civil_dates<D: DbExecutor>(
    db: &D,
    owner: &str,
    viewer: &str,
    today: &impl Fn(&str) -> Result<String, DbError>,
) -> Result<String, DbError> {
    let visible = visibility();
    let sql = format!(
        "SELECT g.timezone FROM goals g WHERE g.user_id=?1 AND {visible}
        UNION SELECT h.timezone FROM goal_periods h JOIN goals g ON g.id=h.goal_id
        WHERE g.user_id=?1 AND {visible}"
    );
    let mut dates = BTreeMap::new();
    for row in db.query_all(&sql, &[owner.into(), viewer.into()]).await? {
        let zone = row.get_string("timezone")?;
        let date = today(&zone)?;
        dates.insert(zone, date);
    }
    Ok(serde_json::to_string(&dates)?)
}

const ITEM: &str = "CASE g.kind WHEN 'training' THEN j.id WHEN 'days' THEN j.entry_date WHEN 'new-areas' THEN c.area_id ELSE j.climb_id END";
fn matches(start: &str, end: &str) -> String {
    format!("j.user_id = g.user_id AND j.entry_date BETWEEN {start} AND {end}
      AND NOT EXISTS (SELECT 1 FROM json_each(g.tags) wanted WHERE NOT EXISTS (
        SELECT 1 FROM json_each(j.tags) actual WHERE actual.value=wanted.value
      )) AND (
        (g.kind='training' AND j.kind='training') OR
        (g.kind='days' AND j.kind='session') OR
        (g.kind='new-areas' AND j.kind='session' AND NOT EXISTS (
          SELECT 1 FROM journal_entries old_j JOIN climbs old_c ON old_c.id=old_j.climb_id
          WHERE old_j.user_id=g.user_id AND old_c.area_id=c.area_id AND old_j.entry_date<{start}
        )) OR (g.kind IN ('volume','grade') AND j.is_ascent=1 AND c.type=g.discipline AND
          (g.grade IS NULL OR c.grade=g.grade OR ((g.grade_match='at-least' OR g.kind='grade') AND c.grade>=g.grade)))
      )")
}

/// Parameters: owner, viewer, zone/civil-date JSON, optional goal ID, lower/upper
/// bounds on period start (exclusive upper), and active-only flag.
pub fn periods_sql() -> String {
    include_str!("periods.sql")
        .replace("{visible}", &visibility())
        .replace("{item}", ITEM)
        .replace("{matches}", &matches("g.ps", "g.pe"))
}

fn count_sql() -> String {
    format!(
        "(SELECT count(DISTINCT {ITEM}) FROM journal_entries j LEFT JOIN climbs c ON c.id=j.climb_id WHERE {})",
        matches("g.start_date", "g.end_date")
    )
}

mod writes;
pub use writes::{archive, delete, save};

mod reads;
pub use reads::{contributions, history, next_grades, overview, page};

mod record;
pub use record::GoalRecord;
