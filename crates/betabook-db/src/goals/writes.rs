use betabook_domain::goals::{GoalInput, goal_window, missed_archive_date};
use betabook_domain::password::random_hex;
use serde_json::{Value, json};

use super::{civil_dates, count_sql};
use crate::sends::MutationError;
use crate::{DbError, DbExecutor, DbParam, DbRow};

type Result<T> = std::result::Result<T, MutationError>;
const CAPACITY: &str = "You can have up to 5 active goals. Delete a goal to make room.";
const DECISION: &str = "This goal no longer needs a decision.";
const PRIOR: &str = "You’ve already sent this grade. Choose a new grade or a volume goal.";
const ENDED: &str = "This routine has ended. Set a new goal to start again.";
const ARCHIVED: &str = "Use Try again to create a new attempt; the original goal stays unchanged.";

fn invalid(message: &str) -> MutationError {
    MutationError::Validation(message.to_owned())
}

fn token() -> Result<String> {
    random_hex(16).map_err(|err| DbError::Query(err.to_string()).into())
}

struct Existing {
    kind: String,
    discipline: Option<String>,
    grade: Option<i64>,
    timezone: String,
    repeat: String,
    timeframe: String,
    start: String,
    end: String,
    stop: Option<String>,
    archived: bool,
    progress: i64,
    target: i64,
}
impl Existing {
    fn from_row(r: DbRow) -> std::result::Result<Self, DbError> {
        Ok(Self {
            kind: r.get_string("kind")?,
            discipline: r.get_opt_string("discipline")?,
            grade: r.get_opt_i64("grade")?,
            timezone: r.get_string("timezone")?,
            repeat: r.get_string("repeat")?,
            timeframe: r.get_string("timeframe")?,
            start: r.get_string("start_date")?,
            end: r.get_string("end_date")?,
            stop: r.get_opt_string("recurring_end_date")?,
            archived: r.get_bool("archived")?,
            progress: r.get_i64("progress")?,
            target: r.get_i64("target")?,
        })
    }
    fn needs_decision(&self, today: &str) -> bool {
        !self.archived
            && self.repeat == "none"
            && self.progress < self.target
            && self.end.as_str() < today
            && missed_archive_date(&self.end).is_some_and(|date| today < date.as_str())
    }
}

async fn existing(db: &impl DbExecutor, owner: &str, id: i64) -> Result<Option<Existing>> {
    let sql = format!(
        "SELECT g.*,archive_token IS NOT NULL AS archived,{} AS progress FROM goals g WHERE user_id=? AND id=?",
        count_sql()
    );
    Ok(db
        .query_one(&sql, &[owner.into(), id.into()])
        .await?
        .map(Existing::from_row)
        .transpose()?)
}

// All capacity checks and milestone eligibility run inside the mutation statement.
// ?1 = owner, ?2 = edited ID, ?3 = proposed definition, ?4 = timezone -> today.
const PROPOSED: &str = "SELECT ?1 AS user_id, value->>'kind' AS kind,value->>'target' AS target,value->>'discipline' AS discipline,
   value->>'grade' AS grade,value->>'gradeMatch' AS grade_match,value->'tags' AS tags,value->>'repeat' AS repeat,
   value->>'timeframe' AS timeframe,value->>'start' AS start_date,value->>'end' AS end_date,value->>'timezone' AS timezone,
   value->>'stop' AS recurring_end_date FROM (SELECT ?3 AS value)";

fn can_save(check_prior: bool) -> String {
    let count = count_sql();
    let day = "coalesce(json_extract(?4,'$.\"'||g.timezone||'\"'),'0000-01-01')";
    let active=format!("g.archive_token IS NULL AND ((g.repeat<>'none' AND (g.recurring_end_date IS NULL OR g.recurring_end_date>={day}))
        OR (g.repeat='none' AND g.end_date>={day} AND {count}<g.target))");
    let capacity=format!("((SELECT count(*) FROM goals g WHERE g.user_id=?1 AND (?2 IS NULL OR g.id<>?2) AND {active})<5
        OR EXISTS(SELECT 1 FROM goals g WHERE g.user_id=?1 AND g.id=?2 AND {active})
        OR EXISTS(SELECT 1 FROM ({PROPOSED}) g WHERE g.repeat='none' AND (g.end_date<{day} OR {count}>=g.target)))");
    if check_prior {
        format!("{capacity} AND NOT EXISTS(SELECT 1 FROM ({PROPOSED}) g JOIN sends s ON s.user_id=g.user_id JOIN climbs c ON c.id=s.climb_id
          WHERE c.type=g.discipline AND c.grade>=g.grade AND (s.date_sent IS NULL OR s.date_sent<g.start_date))")
    } else {
        capacity
    }
}
const INSERT: &str = "INSERT INTO goals(user_id,kind,target,discipline,grade,timeframe,repeat,start_date,end_date,timezone,
    celebrations_initialized,grade_match,tags,recurring_end_date)
    SELECT user_id,kind,target,discipline,grade,timeframe,repeat,start_date,end_date,timezone,1,grade_match,tags,recurring_end_date";

pub async fn save(
    db: &impl DbExecutor,
    owner: &str,
    id: Option<i64>,
    raw: &Value,
    retry: Option<i64>,
    today: &impl Fn(&str) -> std::result::Result<String, DbError>,
) -> Result<i64> {
    if id.is_some() && retry.is_some() {
        return Err(invalid("A retry must create a new goal."));
    }
    let input = GoalInput::parse(raw).map_err(|e| invalid(&e))?;
    let day = today(&input.timezone).map_err(|_| invalid("Choose a valid timezone."))?;
    let old = if let Some(id) = id {
        Some(
            existing(db, owner, id)
                .await?
                .ok_or_else(|| invalid("Goal not found."))?,
        )
    } else {
        None
    };
    if let Some(o) = &old {
        let old_day = today(&o.timezone)?;
        if o.stop.as_ref().is_some_and(|end| end < &old_day) {
            return Err(invalid(ENDED));
        }
        if o.archived
            || (o.repeat == "none"
                && o.end < old_day
                && o.progress < o.target
                && !o.needs_decision(&old_day))
        {
            return Err(invalid(ARCHIVED));
        }
    }
    let period = if input.repeat == "none" {
        &input.timeframe
    } else {
        &input.repeat
    };
    let (start, end) = match &old {
        Some(o)
            if o.repeat == "none"
                && input.repeat == "none"
                && o.timeframe == input.timeframe
                && period != "custom" =>
        {
            (o.start.clone(), o.end.clone())
        }
        _ => goal_window(
            period,
            &day,
            &input.end_date,
            input
                .start_date
                .as_deref()
                .or_else(|| old.as_ref().map(|o| o.start.as_str())),
        )
        .map_err(|e| invalid(&e))?,
    };
    let keep_stop = input.repeat != "none" && raw.get("recurringEndDate").is_none();
    let stop = if keep_stop {
        old.as_ref().and_then(|o| o.stop.clone())
    } else {
        input.recurring_end_date
    };
    if stop.as_ref().is_some_and(|s| s < &day) {
        return Err(invalid("End date must be today or later."));
    }
    let discipline = input.discipline.map(|d| d.as_str());
    let check_prior = input.kind == "grade"
        && old.as_ref().is_none_or(|o| {
            o.kind != "grade"
                || discipline != o.discipline.as_deref()
                || o.grade != input.grade
                || start != o.start
        });
    let proposed = json!({"kind":input.kind,"target":input.target,"discipline":discipline,"grade":input.grade,
        "gradeMatch":input.grade_match,"tags":input.tags,"repeat":input.repeat,"timeframe":input.timeframe,
        "start":start,"end":end,"timezone":input.timezone,"stop":stop});
    let mut dates: std::collections::BTreeMap<String, String> =
        serde_json::from_str(&civil_dates(db, owner, owner, today).await?)
            .map_err(DbError::from)?;
    dates.insert(input.timezone, day);
    let params: Vec<DbParam> = vec![
        owner.into(),
        id.into(),
        proposed.to_string().into(),
        serde_json::to_string(&dates).map_err(DbError::from)?.into(),
    ];
    let capacity = can_save(check_prior);
    let rows = if let Some(source) = retry {
        let o = existing(db, owner, source)
            .await?
            .ok_or_else(|| invalid(DECISION))?;
        let source_day = today(&o.timezone)?;
        if !o.needs_decision(&source_day) {
            return Err(invalid(DECISION));
        }
        let nonce = token()?;
        let mut args = params.clone();
        args.extend([
            source.into(),
            nonce.as_str().into(),
            o.end.as_str().into(),
            o.timezone.as_str().into(),
        ]);
        let archive=format!("UPDATE goals SET archive_token=?6 WHERE id IN
            (SELECT g.id FROM goals g WHERE g.id=?5 AND g.user_id=?1 AND g.repeat='none' AND g.archive_token IS NULL
              AND g.end_date=?7 AND g.timezone=?8 AND {}<g.target AND {capacity})",count_sql());
        let insert = format!(
            "{INSERT} FROM ({PROPOSED}) WHERE EXISTS(SELECT 1 FROM goals WHERE user_id=?1 AND id=?5 AND archive_token=?6) RETURNING id"
        );
        let mut insert_params = params.clone();
        insert_params.extend([source.into(), nonce.into()]);
        db.batch_rows(vec![(archive, args), (insert, insert_params)])
            .await?
            .pop()
            .unwrap_or_default()
    } else if let (Some(_), Some(o)) = (id, &old) {
        let cutoff = if o.repeat != "none" {
            goal_window(&o.repeat, &today(&o.timezone)?, &o.end, None)
                .map_err(|e| invalid(&e))?
                .0
        } else {
            start.clone()
        };
        // A changed definition must be re-read before snapshotting it. Re-evaluate
        // progress and eligibility inside both statements of the transaction.
        let same="g.archive_token IS NULL AND g.start_date=?6 AND g.end_date=?7 AND g.repeat=?8 AND g.timezone=?9
          AND g.kind=?10 AND g.discipline IS ?11 AND g.grade IS ?12 AND g.recurring_end_date IS ?13
          AND (g.recurring_end_date IS NULL OR g.recurring_end_date >= json_extract(?4,'$.\"'||g.timezone||'\"'))";
        let guard = format!(
            "EXISTS(SELECT 1 FROM goals g WHERE g.id=?2 AND g.user_id=?1 AND {same} AND {capacity})"
        );
        let snapshot = include_str!("snapshot.sql").replace("{guard}", &guard);
        let stop_update = if keep_stop {
            "recurring_end_date"
        } else {
            "json_extract(?3,'$.stop')"
        };
        let update=format!("UPDATE goals SET (kind,target,discipline,grade,timeframe,repeat,start_date,end_date,timezone,grade_match,tags) =
            (SELECT kind,target,discipline,grade,timeframe,repeat,start_date,end_date,timezone,grade_match,tags FROM ({PROPOSED})),
            recurring_end_date={stop_update} WHERE user_id=?1 AND id=?2 AND {guard} RETURNING id");
        let mut args = params.clone();
        args.extend([
            cutoff.into(),
            o.start.as_str().into(),
            o.end.as_str().into(),
            o.repeat.as_str().into(),
            o.timezone.as_str().into(),
            o.kind.as_str().into(),
            o.discipline.as_deref().into(),
            o.grade.into(),
            o.stop.as_deref().into(),
        ]);
        db.batch_rows(vec![(snapshot, args.clone()), (update, args)])
            .await?
            .pop()
            .unwrap_or_default()
    } else {
        let sql = format!("{INSERT} FROM ({PROPOSED}) WHERE {capacity} RETURNING id");
        db.query_all(&sql, &params).await?
    };
    if let Some(row) = rows.first() {
        return Ok(row.get_i64("id")?);
    }
    if check_prior && db.query_one("SELECT 1 FROM sends s JOIN climbs c ON c.id=s.climb_id WHERE s.user_id=?1 AND c.type=?2
       AND c.grade>=?3 AND (s.date_sent IS NULL OR s.date_sent<?4) LIMIT 1",&[owner.into(),discipline.into(),input.grade.into(),start.into()]).await?.is_some(){return Err(invalid(PRIOR));}
    if let Some(source) = retry {
        let o = existing(db, owner, source)
            .await?
            .ok_or_else(|| invalid(DECISION))?;
        if !o.needs_decision(&today(&o.timezone)?) {
            return Err(invalid(DECISION));
        }
    }
    Err(invalid(CAPACITY))
}

pub async fn delete(db: &impl DbExecutor, owner: &str, id: i64) -> Result<()> {
    if db
        .execute(
            "DELETE FROM goals WHERE user_id=? AND id=?",
            &[owner.into(), id.into()],
        )
        .await?
        == 0
    {
        return Err(invalid("Goal not found."));
    }
    Ok(())
}

pub async fn archive(
    db: &impl DbExecutor,
    owner: &str,
    id: i64,
    today: &impl Fn(&str) -> std::result::Result<String, DbError>,
) -> Result<()> {
    let o = existing(db, owner, id)
        .await?
        .ok_or_else(|| invalid(DECISION))?;
    if o.archived || o.repeat != "none" {
        return Err(invalid(DECISION));
    }
    let completed = o.progress >= o.target;
    if !completed && !o.needs_decision(&today(&o.timezone)?) {
        return Err(invalid(DECISION));
    }
    let operator = if completed { ">=" } else { "<" };
    let sql=format!("UPDATE goals SET archive_token=?1 WHERE id IN (SELECT g.id FROM goals g WHERE id=?2 AND user_id=?3 AND archive_token IS NULL
        AND repeat='none' AND end_date=?4 AND timezone=?5 AND {}{operator}target)",count_sql());
    if db
        .execute(
            &sql,
            &[
                token()?.into(),
                id.into(),
                owner.into(),
                o.end.into(),
                o.timezone.into(),
            ],
        )
        .await?
        == 0
    {
        return Err(invalid(DECISION));
    }
    Ok(())
}
