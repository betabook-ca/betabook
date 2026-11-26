use super::{civil_dates, matches, periods_sql, visibility};
use crate::{DbError, DbExecutor, DbRow};
use crate::{goal_achievements, goal_history};
use betabook_domain::goals::{goal_window, next_date};
use serde_json::{Value, json};

#[derive(Default)]
struct Scope<'a> {
    id: Option<i64>,
    from: Option<&'a str>,
    until: Option<&'a str>,
    active_only: bool,
}

fn progress(row: &DbRow) -> Result<Value, DbError> {
    Ok(json!(super::GoalRecord::from_row(row)?))
}

async fn periods(
    db: &impl DbExecutor,
    owner: &str,
    viewer: &str,
    scope: Scope<'_>,
    today: &impl Fn(&str) -> Result<String, DbError>,
) -> Result<Vec<Value>, DbError> {
    let dates = civil_dates(db, owner, viewer, today).await?;
    if dates == "{}" {
        return Ok(Vec::new());
    }
    let rows = db
        .query_all(
            &periods_sql(),
            &[
                owner.into(),
                viewer.into(),
                dates.into(),
                scope.id.into(),
                scope.from.into(),
                scope.until.into(),
                scope.active_only.into(),
            ],
        )
        .await?;
    rows.iter().map(progress).collect()
}

pub async fn overview(
    db: &impl DbExecutor,
    owner: &str,
    viewer: &str,
    today: &impl Fn(&str) -> Result<String, DbError>,
) -> Result<Value, DbError> {
    let periods = periods(db, owner, viewer, Scope::default(), today).await?;
    let active = goal_history::summarize(&periods, "active", 0, None, today)?;
    let mut completed = goal_history::summarize(&periods, "completed", 0, None, today)?;
    if owner == viewer {
        completed["celebrations"] =
            json!(goal_achievements::unseen(db, owner, &periods, today).await?);
    }
    Ok(json!({"active":active,"completed":completed}))
}

pub async fn page(
    db: &impl DbExecutor,
    owner: &str,
    viewer: &str,
    view: &str,
    offset: usize,
    year: Option<i64>,
    today: &impl Fn(&str) -> Result<String, DbError>,
) -> Result<Value, DbError> {
    let periods = periods(
        db,
        owner,
        viewer,
        Scope {
            active_only: view == "active",
            ..Default::default()
        },
        today,
    )
    .await?;
    let mut page = goal_history::summarize(&periods, view, offset, year, today)?;
    if view == "completed" && viewer == owner {
        page["celebrations"] = json!(goal_achievements::unseen(db, owner, &periods, today).await?);
    }
    Ok(page)
}

pub async fn history(
    db: &impl DbExecutor,
    owner: &str,
    viewer: &str,
    id: i64,
    offset: usize,
    anchor: Option<&str>,
    today: &impl Fn(&str) -> Result<String, DbError>,
) -> Result<Value, DbError> {
    let visible = visibility();
    let rows=db.query_all(&format!("SELECT g.repeat,g.start_date AS start,min(g.end_date,coalesce(g.recurring_end_date,g.end_date)) AS end,g.timezone,g.recurring_end_date AS stop,0 AS priority
        FROM goals g WHERE g.user_id=?1 AND g.id=?3 AND {visible}
        UNION ALL SELECT h.repeat,h.start_date,h.end_date,h.timezone,g.recurring_end_date,1
        FROM goal_periods h JOIN goals g ON g.id=h.goal_id WHERE g.id=?3 AND g.user_id=?1 AND {visible}
        AND (h.start_date=(SELECT min(start_date) FROM goal_periods WHERE goal_id=?3) OR h.start_date=(SELECT max(start_date) FROM goal_periods WHERE goal_id=?3))
        ORDER BY priority,start DESC"),&[owner.into(),viewer.into(),id.into()]).await?;
    // Only the first and last snapshots are needed to bound month-based pagination.
    let mut metadata = Vec::new();
    let mut cadence = None;
    for row in rows {
        let repeat = row.get_string("repeat")?;
        let zone = row.get_string("timezone")?;
        let end = row.get_string("end")?;
        let start = row.get_string("start")?;
        if repeat != "none" {
            cadence.get_or_insert_with(|| repeat.clone());
            if row.get_i64("priority")? == 0 {
                let day = today(&zone)?;
                let stop = row.get_opt_string("stop")?;
                let last = stop.as_deref().map_or(day.as_str(), |s| s.min(&day));
                let (ps, pe) = goal_window(&repeat, last, &end, None).map_err(DbError::Query)?;
                metadata.push(json!({"repeat":repeat,"timezone":zone,"periodStart":ps,"periodEnd":stop.map_or(pe.clone(),|s|s.min(pe))}));
            }
        }
        metadata.push(json!({"repeat":repeat,"timezone":zone,"periodStart":start,"periodEnd":end}));
    }
    let w = goal_history::window(
        &metadata,
        cadence.as_deref().unwrap_or("week"),
        offset,
        anchor,
        today,
    )?;
    let rows = if w.from < w.until {
        periods(
            db,
            owner,
            viewer,
            Scope {
                id: Some(id),
                from: Some(&w.from),
                until: Some(&w.until),
                active_only: false,
            },
            today,
        )
        .await?
    } else {
        Vec::new()
    };
    Ok(
        json!({"periods":rows,"hasMore":w.has_more,"nextOffset":w.next_offset,"anchorMonth":w.anchor_month}),
    )
}

pub async fn contributions(
    db: &impl DbExecutor,
    owner: &str,
    viewer: &str,
    id: i64,
    start: &str,
    end: Option<&str>,
    today: &impl Fn(&str) -> Result<String, DbError>,
) -> Result<Value, DbError> {
    let Some(until) = next_date(start) else {
        return Ok(json!([]));
    };
    let rows = periods(
        db,
        owner,
        viewer,
        Scope {
            id: Some(id),
            from: Some(start),
            until: Some(&until),
            active_only: false,
        },
        today,
    )
    .await?;
    let mut candidates = rows
        .iter()
        .filter(|g| g["periodStart"] == start && end.is_none_or(|end| g["periodEnd"] == end));
    let Some(g) = candidates.next() else {
        return Ok(json!([]));
    };
    if candidates.next().is_some()
        || g["kind"] == "training"
        || g["kind"] == "days"
        || start > today(g["timezone"].as_str().ok_or(DbError::Column("timezone"))?)?.as_str()
    {
        return Ok(json!([]));
    }
    let (key, name, item) = if g["kind"] == "new-areas" {
        ("c.area_id", "a.name", "area")
    } else {
        ("c.id", "c.name", "climb")
    };
    let visible = visibility();
    let predicate = matches("g.start_date", "g.end_date");
    let query=format!("SELECT {key} AS id,{name} AS name FROM
        (SELECT ?1 AS user_id,?3->>'kind' AS kind,?3->>'discipline' AS discipline,?3->>'grade' AS grade,
         ?3->>'gradeMatch' AS grade_match,?3->'tags' AS tags,?3->>'periodStart' AS start_date,?3->>'periodEnd' AS end_date) g
        JOIN journal_entries j LEFT JOIN climbs c ON c.id=j.climb_id LEFT JOIN areas a ON a.id=c.area_id
        WHERE {visible} AND {predicate} AND EXISTS(SELECT 1 FROM goals WHERE id=?4 AND user_id=?1)
        GROUP BY {key} ORDER BY min(j.entry_date),name");
    let rows = db
        .query_all(
            &query,
            &[owner.into(), viewer.into(), g.to_string().into(), id.into()],
        )
        .await?;
    let items = rows
        .iter()
        .map(|r| Ok(json!({"id":r.get_i64("id")?, "name":r.get_string("name")?, "type":item})))
        .collect::<Result<Vec<_>, DbError>>()?;
    Ok(json!(items))
}

pub async fn next_grades(
    db: &impl DbExecutor,
    owner: &str,
    viewer: &str,
) -> Result<Value, DbError> {
    let rows=db.query_all("SELECT c.type AS discipline,max(c.grade)+1 AS grade FROM sends s JOIN climbs c ON c.id=s.climb_id WHERE s.user_id=?1 AND ?1=?2 GROUP BY c.type",&[owner.into(),viewer.into()]).await?;
    let mut result = json!({});
    for row in rows {
        result[row.get_string("discipline")?] = json!(row.get_i64("grade")?);
    }
    Ok(result)
}
