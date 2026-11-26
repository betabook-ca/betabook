//! Presentation of live goal periods. History pages use calendar months as cursors.
use std::collections::{BTreeMap, BTreeSet, HashMap};

use betabook_domain::goals::missed_archive_date;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::DbError;

pub const PAGE_SIZE: usize = 5;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Dates<'a> {
    period_start: &'a str,
    period_end: &'a str,
    timezone: &'a str,
    repeat: &'a str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Counts<'a> {
    id: i64,
    target: i64,
    progress: i64,
    completed_date: Option<&'a str>,
    #[serde(default)]
    archived: bool,
}

struct Period<'a> {
    source: &'a Value,
    dates: Dates<'a>,
    counts: Counts<'a>,
    today: &'a str,
}

impl Period<'_> {
    fn met(&self) -> bool {
        self.counts.progress >= self.counts.target
    }
    fn missed(&self) -> bool {
        self.dates.repeat == "none" && !self.met() && self.dates.period_end < self.today
    }
    fn actionable(&self) -> bool {
        self.missed()
            && !self.counts.archived
            && missed_archive_date(self.dates.period_end)
                .is_some_and(|cutoff| self.today < cutoff.as_str())
    }
    fn current(&self) -> bool {
        self.dates.period_start <= self.today && self.today <= self.dates.period_end
    }
    fn recorded(&self) -> bool {
        self.dates.repeat != "none"
            && (self.dates.period_end < self.today
                || (self.dates.period_start <= self.today
                    && self.met()
                    && self.counts.completed_date.is_some_and(|d| d <= self.today)))
    }
    fn result_date(&self) -> &str {
        self.counts.completed_date.unwrap_or(self.dates.period_end)
    }
    fn with_status(&self) -> Value {
        let mut v = self.source.clone();
        v["missed"] = json!(self.missed());
        v["needsAction"] = json!(self.actionable());
        v
    }
}

pub struct HistoryWindow {
    pub from: String,
    pub until: String,
    pub anchor_month: String,
    pub has_more: bool,
    pub next_offset: usize,
}

fn month_index(date: &str) -> Result<i64, DbError> {
    let year = date.get(..4).and_then(|s| s.parse::<i64>().ok());
    let month = date.get(5..7).and_then(|s| s.parse::<i64>().ok());
    match (year, month) {
        (Some(y), Some(m @ 1..=12)) => Ok(y * 12 + m - 1),
        _ => Err(DbError::Column("periodStart")),
    }
}

fn month_name(index: i64) -> String {
    format!(
        "{:04}-{:02}",
        index.div_euclid(12),
        index.rem_euclid(12) + 1
    )
}

pub fn window(
    periods: &[Value],
    repeat: &str,
    offset: usize,
    anchor: Option<&str>,
    today: &impl Fn(&str) -> Result<String, DbError>,
) -> Result<HistoryWindow, DbError> {
    let mut candidates = Vec::new();
    let mut zones = HashMap::new();
    for row in periods {
        let d = Dates::deserialize(row)?;
        if d.repeat == "none" {
            continue;
        }
        if !zones.contains_key(d.timezone) {
            zones.insert(d.timezone, today(d.timezone)?);
        }
        if d.period_start <= zones[d.timezone].as_str() {
            candidates.push(d);
        }
    }
    let Some(last) = candidates.iter().max_by_key(|d| d.period_start) else {
        let month = match anchor {
            Some(month) => month.to_owned(),
            None => month_name(month_index(&today("UTC")?)?),
        };
        return Ok(HistoryWindow {
            from: format!("{month}-01"),
            until: format!("{month}-01"),
            anchor_month: month,
            next_offset: offset,
            has_more: false,
        });
    };
    let day = zones[last.timezone].as_str();
    let latest = if candidates
        .iter()
        .any(|d| d.period_start <= day && day <= d.period_end)
    {
        day
    } else {
        last.period_start
    };
    let mut top = month_index(latest)?;
    if repeat == "year" {
        top = top.div_euclid(12) * 12 + 11;
    }
    if let Some(month) = anchor {
        top = top.min(month_index(month)?);
    }
    let mut first = top;
    for d in &candidates {
        first = first.min(month_index(d.period_start)?);
    }
    let available = (top - first + 1) as usize;
    let span = match repeat {
        "week" => 3,
        "year" => 60,
        _ => 12,
    };
    let next_offset = offset + span.min(available.saturating_sub(offset));
    Ok(HistoryWindow {
        from: format!("{}-01", month_name(top + 1 - next_offset as i64)),
        until: format!("{}-01", month_name(top + 1 - offset as i64)),
        has_more: next_offset < available,
        next_offset,
        anchor_month: month_name(top),
    })
}

fn year(date: &str) -> Result<i64, DbError> {
    date.get(..4)
        .and_then(|s| s.parse().ok())
        .ok_or(DbError::Column("year"))
}

pub fn summarize(
    rows: &[Value],
    view: &str,
    offset: usize,
    selected_year: Option<i64>,
    today: &impl Fn(&str) -> Result<String, DbError>,
) -> Result<Value, DbError> {
    let mut zones = HashMap::new();
    for row in rows {
        let zone = row["timezone"]
            .as_str()
            .ok_or(DbError::Column("timezone"))?;
        if !zones.contains_key(zone) {
            zones.insert(zone, today(zone)?);
        }
    }
    let mut periods = Vec::with_capacity(rows.len());
    for source in rows {
        let dates = Dates::deserialize(source)?;
        periods.push(Period {
            source,
            counts: Counts::deserialize(source)?,
            today: &zones[dates.timezone],
            dates,
        });
    }
    if view == "active" {
        let mut active: Vec<_> = periods
            .iter()
            .filter(|g| {
                if g.dates.repeat == "none" {
                    !g.counts.archived
                        && g.counts.completed_date.is_none()
                        && (g.dates.period_end >= g.today || g.actionable())
                } else {
                    g.current()
                }
            })
            .collect();
        active.sort_by_key(|g| (g.dates.period_end, g.counts.id));
        return Ok(
            json!({"goals":active.iter().map(|g| g.with_status()).collect::<Vec<_>>(),"total":active.len(),"hasMore":false}),
        );
    }
    let current_year = match periods.first() {
        Some(p) => year(p.today)?,
        None => year(&today("UTC")?)?,
    };
    let mut years = BTreeSet::new();
    let mut results = Vec::new();
    for p in &periods {
        let result_year = if p.recorded() {
            year(p.dates.period_start)?
        } else if p.dates.repeat == "none"
            && (p.counts.completed_date.is_some()
                || p.counts.archived
                || (p.dates.period_end < p.today && !p.actionable()))
        {
            year(p.result_date())?
        } else {
            continue;
        };
        years.insert(result_year);
        results.push((result_year, p));
    }
    if years.is_empty() {
        years.insert(current_year);
    }
    let years: Vec<_> = years.into_iter().rev().collect();
    let year = selected_year.unwrap_or_else(|| {
        if years.contains(&current_year) {
            current_year
        } else {
            years[0]
        }
    });
    let mut achieved = BTreeSet::new();
    let mut groups = BTreeMap::<i64, &Period>::new();
    for (_, p) in results.iter().filter(|(y, _)| *y == year) {
        let once = p.dates.repeat == "none";
        if (once && p.counts.completed_date.is_some()) || (!once && p.met()) {
            achieved.insert(p.counts.id);
        }
        let best = groups.entry(p.counts.id).or_insert(*p);
        if once || (best.dates.repeat != "none" && p.result_date() > best.result_date()) {
            *best = p;
        }
    }
    let mut ordered: Vec<_> = groups.into_values().collect();
    ordered.sort_by(|a, b| {
        b.result_date()
            .cmp(a.result_date())
            .then(b.counts.id.cmp(&a.counts.id))
    });
    let mut goals = Vec::new();
    for g in ordered.iter().skip(offset).take(PAGE_SIZE) {
        let mut output = g.with_status();
        let mut routine: Vec<_> = periods
            .iter()
            .filter(|p| p.counts.id == g.counts.id && p.dates.repeat != "none")
            .collect();
        let recorded: Vec<_> = routine.iter().copied().filter(|p| p.recorded()).collect();
        if let Some(last) = recorded.iter().max_by_key(|p| p.dates.period_end) {
            let cadence = routine
                .iter()
                .find(|p| p.current())
                .map_or(last.dates.repeat, |p| p.dates.repeat);
            let values = routine.iter().map(|p| p.source.clone()).collect::<Vec<_>>();
            let w = window(&values, cadence, 0, None, today)?;
            routine.sort_by_key(|p| std::cmp::Reverse(p.dates.period_start));
            let recent: Vec<_> = routine
                .iter()
                .filter(|p| {
                    p.dates.period_start >= w.from.as_str()
                        && p.dates.period_start < w.until.as_str()
                        && p.dates.period_start <= p.today
                })
                .map(|p| p.source)
                .collect();
            output["recurring"] = json!({"met":recorded.iter().filter(|p| p.met()).count(),"total":recorded.len(),"recent":recent,"hasMore":w.has_more,"anchorMonth":w.anchor_month,"nextOffset":w.next_offset});
        }
        goals.push(output);
    }
    Ok(
        json!({"goals":goals,"total":ordered.len(),"hasMore":ordered.len()>offset+PAGE_SIZE,"years":years,"summary":{"year":year,"achieved":achieved.len()}}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixed_today(_: &str) -> Result<String, DbError> {
        Ok("2026-09-11".into())
    }

    fn period(id: i64, repeat: &str, start: &str, end: &str, completed: Option<&str>) -> Value {
        json!({"id":id,"repeat":repeat,"periodStart":start,"periodEnd":end,"timezone":"UTC","target":1,"progress":i64::from(completed.is_some()),"completedDate":completed,"archived":false})
    }

    #[test]
    fn history_groups_converted_goals_and_keeps_missed_decisions_in_active() -> Result<(), DbError>
    {
        let periods = [
            period(1, "week", "2026-08-03", "2026-08-09", Some("2026-08-03")),
            period(1, "none", "2026-09-01", "2026-09-30", Some("2026-09-02")),
            period(2, "none", "2026-08-01", "2026-08-31", None),
            period(3, "none", "2026-07-01", "2026-07-31", None),
        ];
        let active = summarize(&periods, "active", 0, None, &fixed_today)?;
        assert_eq!(active["total"], 1);
        assert_eq!(active["goals"][0]["needsAction"], true);
        let history = summarize(&periods, "completed", 0, None, &fixed_today)?;
        assert_eq!(history["total"], 2);
        assert_eq!(history["summary"], json!({"year":2026,"achieved":1}));
        assert_eq!(history["goals"][0]["repeat"], "none");
        assert_eq!(history["goals"][0]["recurring"]["total"], 1);
        assert_eq!(history["goals"][1]["missed"], true);
        Ok(())
    }

    #[test]
    fn yearly_history_paginates_five_calendar_years_with_stable_anchor() -> Result<(), DbError> {
        let periods = [
            period(1, "year", "2018-01-01", "2018-12-31", None),
            period(1, "year", "2026-01-01", "2026-12-31", None),
        ];
        let first = window(&periods, "year", 0, None, &fixed_today)?;
        assert_eq!(
            (&*first.from, &*first.until, &*first.anchor_month),
            ("2022-01-01", "2027-01-01", "2026-12")
        );
        assert!(first.has_more);
        let second = window(
            &periods,
            "year",
            first.next_offset,
            Some(&first.anchor_month),
            &fixed_today,
        )?;
        assert_eq!(
            (&*second.from, &*second.until),
            ("2018-01-01", "2022-01-01")
        );
        assert!(!second.has_more);
        Ok(())
    }
}
