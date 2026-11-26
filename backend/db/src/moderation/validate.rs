use super::{Change, Result, invalid};
use crate::DbExecutor;
use betabook_domain::grades::{ClimbType, format_grade, native_grade_array};
use betabook_domain::sends::{is_real_iso_date, latest_acceptable_send_date};
use serde_json::{Map, Value, json};

fn text<'a>(v: &'a Value, label: &str) -> Result<&'a str> {
    v.as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| invalid(&format!("{label} is required")))
}
fn grade(raw: &Value, kind: ClimbType) -> Result<i64> {
    if raw.is_null() || raw.as_str() == Some("") {
        return Err(invalid("Grade is required"));
    }
    let number = raw
        .as_f64()
        .or_else(|| raw.as_str().and_then(|s| s.trim().parse::<f64>().ok()))
        .ok_or_else(|| invalid("Invalid grade"))?;
    if number.fract() != 0.0 || !(0.0..native_grade_array(kind).len() as f64).contains(&number) {
        return Err(invalid("Invalid grade"));
    }
    Ok(number as i64)
}
fn discipline(s: Option<&str>) -> Result<ClimbType> {
    s.and_then(ClimbType::parse)
        .ok_or_else(|| invalid("Invalid discipline"))
}

pub(super) async fn prepare(
    db: &impl DbExecutor,
    c: &mut Change,
    today: &str,
    submission: bool,
) -> Result<()> {
    match c.kind.as_str() {
        "area_edit" => area_edit(c, submission),
        "area_delete" => area_delete(db, c).await,
        "climb_delete" => climb_delete(db, c).await,
        "area_reparent" => area_reparent(db, c).await,
        "climb_move" => Ok(()),
        "climb_edit" => climb_edit(c, submission),
        "climb_merge" => climb_merge(c),
        "climb_break" => climb_break(db, c, today, submission).await,
        _ => Err(invalid("Invalid request type")),
    }
}

fn area_edit(c: &mut Change, submission: bool) -> Result<()> {
    let f = &c.facts;
    let p = &c.payload;
    let name = text(&p["name"], "Name")?;
    if submission && Some(name) == f.name.as_deref() {
        return Err(invalid("No changes to submit"));
    }
    c.payload = json!({"name":name});
    Ok(())
}

async fn area_delete(db: &impl DbExecutor, c: &Change) -> Result<()> {
    let row=db.query_one("SELECT EXISTS(SELECT 1 FROM areas WHERE parent_id=?1) AS children, EXISTS(SELECT 1 FROM climbs WHERE area_id=?1) AS climbs",&[c.id.into()]).await?.ok_or_else(||invalid("Area not found"))?;
    if row.get_bool("children")? {
        return Err(invalid("Can't delete an area with sub-areas"));
    }
    if row.get_bool("climbs")? {
        return Err(invalid("Can't delete an area with climbs"));
    }

    Ok(())
}

async fn climb_delete(db: &impl DbExecutor, c: &Change) -> Result<()> {
    let f = &c.facts;

    if f.send_count > 0 {
        return Err(invalid("Can't delete a climb with logged sends"));
    }
    if db
        .query_one(
            "SELECT 1 AS found FROM journal_entries WHERE climb_id=? LIMIT 1",
            &[c.id.into()],
        )
        .await?
        .is_some()
    {
        return Err(invalid("Can't delete a climb with journal entries"));
    }

    Ok(())
}

async fn area_reparent(db: &impl DbExecutor, c: &Change) -> Result<()> {
    if db.query_one("WITH RECURSIVE chain(id) AS (SELECT ? UNION SELECT parent_id FROM areas JOIN chain ON areas.id=chain.id WHERE parent_id IS NOT NULL) SELECT 1 AS found FROM chain WHERE id=?",
      &[c.destination().into(),c.id.into()]).await?.is_some(){return Err(invalid("Can't move an area under itself or one of its own sub-areas"))}

    Ok(())
}

fn climb_edit(c: &mut Change, submission: bool) -> Result<()> {
    let f = &c.facts;
    let p = &c.payload;

    let source_type = discipline(f.discipline.as_deref())?;
    if !submission
        && (p.get("type").is_some() || p.get("grade").is_some())
        && p["expectedType"].is_null()
    {
        return Err(invalid(
            "This grade request has no discipline context — reject it and request a new submission",
        ));
    }
    if !submission
        && p.get("expectedType").is_some()
        && p["expectedType"].as_str() != f.discipline.as_deref()
    {
        return Err(invalid(
            "The discipline changed — reload and submit a new edit",
        ));
    }
    let mut delta = Map::new();
    if submission || p.get("name").is_some() {
        let name = text(&p["name"], "Name")?;
        if !submission || Some(name) != f.name.as_deref() {
            delta.insert("name".into(), json!(name));
        }
    }
    let kind = if submission || p.get("type").is_some() {
        discipline(p["type"].as_str())?
    } else {
        source_type
    };
    if kind != source_type && f.send_count > 0 {
        return Err(invalid(
            "Can't change discipline once a climb has logged sends",
        ));
    }
    if kind != source_type || (!submission && p.get("type").is_some()) {
        delta.insert("type".into(), json!(kind));
    }
    if submission || p.get("grade").is_some() || kind != source_type {
        let ordinal = grade(&p["grade"], kind)?;
        if !submission || Some(ordinal) != f.grade || kind != source_type {
            delta.insert("grade".into(), json!(ordinal));
        }
    }
    if delta.contains_key("type") || delta.contains_key("grade") {
        delta.insert("expectedType".into(), json!(source_type));
    }
    if delta.is_empty() {
        return Err(invalid("No changes to submit"));
    }
    c.payload = Value::Object(delta);

    Ok(())
}

fn climb_merge(c: &mut Change) -> Result<()> {
    let f = &c.facts;
    let p = &c.payload;

    if c.destination() == Some(c.id) {
        return Err(invalid("Can't mark a climb as a duplicate of itself"));
    }
    if f.destination_type != f.discipline {
        return Err(invalid(
            "Can't mark a climb as a duplicate of a different discipline",
        ));
    }
    if f.broken_on.is_some() || f.destination_broken_on.is_some() {
        return Err(invalid("Can't merge a broken climb"));
    }
    let mut fields = Map::new();
    let overrides = &p["overrides"];
    if !overrides.is_null() && !overrides.is_object() {
        return Err(invalid("Invalid merge overrides"));
    }
    if let Some(v) = overrides.get("name") {
        fields.insert("name".into(), json!(text(v, "Name")?));
    }
    if let Some(v) = overrides.get("grade") {
        fields.insert(
            "grade".into(),
            json!(grade(v, discipline(f.destination_type.as_deref())?)?),
        );
    }
    if let Some(v) = overrides.get("description") {
        fields.insert(
            "description".into(),
            json!(v.as_str().map(str::trim).filter(|s| !s.is_empty())),
        );
    }
    c.payload = json!({"targetClimbId":c.destination(),"overrides":fields});

    Ok(())
}

async fn climb_break(
    db: &impl DbExecutor,
    c: &mut Change,
    today: &str,
    submission: bool,
) -> Result<()> {
    let f = &c.facts;
    let p = &c.payload;

    if f.broken_on.is_some() {
        return Err(invalid("This climb has already been marked as broken"));
    }
    let date = text(&p["brokenOn"], "Date")?;
    if !is_real_iso_date(date) {
        return Err(invalid("Invalid date"));
    }
    if date > latest_acceptable_send_date(today).as_str() {
        return Err(invalid("The break date can't be in the future"));
    }
    let reason = text(&p["reason"], "Reason")?;
    if reason.encode_utf16().count() > 500 {
        return Err(invalid("Reason must be 500 characters or fewer"));
    }
    if submission {
        let name = f
            .name
            .as_deref()
            .ok_or_else(|| invalid("Climb not found"))?;
        let successor = format!("{name} - post break ({})", &date[..4]);
        let dot = if reason.ends_with(['.', '!', '?']) {
            ""
        } else {
            "."
        };
        let notice = format!(
            "This climb broke on {date}. {reason}{dot} Ascents from before that date can still be logged. The post-break version is listed as {successor}."
        );
        let description = f
            .description
            .as_deref()
            .filter(|s| !s.is_empty())
            .map_or_else(|| notice.clone(), |s| format!("{s}\n\n{notice}"));
        let label = format_grade(
            discipline(f.discipline.as_deref())?,
            f.grade,
            Default::default(),
        );
        let new_description = format!(
            "Post-break version of {name}, which broke on {date}. Its {label} grade is carried over from the original as a placeholder until it sees more ascents."
        );
        let impact=db.query_one("SELECT (SELECT count(*) FROM sends WHERE climb_id=?1 AND date_sent>=?2) AS sends,(SELECT count(*) FROM journal_entries WHERE climb_id=?1 AND entry_date>=?2) AS entries",&[c.id.into(),date.into()]).await?.ok_or_else(||invalid("Climb not found"))?;
        c.payload = json!({"brokenOn":date,"reason":reason,"successorName":successor,"appendedDescription":description,"successorDescription":new_description,"laterSends":impact.get_i64("sends")?,"laterEntries":impact.get_i64("entries")?});
    } else if [
        "successorName",
        "appendedDescription",
        "successorDescription",
    ]
    .iter()
    .any(|s| p[s].as_str().is_none_or(|s| s.trim().is_empty()))
    {
        return Err(invalid(
            "This break request is incomplete — reject it and request a new one",
        ));
    }

    Ok(())
}
