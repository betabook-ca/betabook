//! CSV/import wizard matching and receipt-backed atomic send writes.
use std::collections::{HashMap, HashSet};

use betabook_domain::grades::{ClimbType, ImportGradePreference, parse_grade};
use betabook_domain::sends::{MAX_LOG_NOTE_LENGTH, assert_loggable_on_climb, validate_send_input};
use serde::Serialize;
use serde_json::{Value, json};

use crate::{DbError, DbExecutor, DbParam, DbRow};

#[derive(thiserror::Error, Debug)]
pub enum ImportError {
    #[error("{0}")]
    Invalid(String),
    #[error("The import result could not be confirmed")]
    Unknown,
    #[error(transparent)]
    Db(#[from] DbError),
}

fn invalid(message: &str) -> ImportError {
    ImportError::Invalid(message.to_owned())
}

pub async fn candidates(
    db: &impl DbExecutor,
    input: &Value,
    by_area: bool,
) -> Result<Value, ImportError> {
    let items = input
        .as_array()
        .ok_or_else(|| invalid("Invalid climb names"))?;
    if !items.iter().all(|v| {
        if by_area {
            v["name"].is_string() && v["areaName"].is_string()
        } else {
            v.is_string()
        }
    }) {
        return Err(invalid("Invalid climb names"));
    }
    if items.len() > 100 {
        let label = if by_area {
            "climb and area pairs"
        } else {
            "climb names"
        };
        return Err(ImportError::Invalid(format!(
            "A lookup can carry at most 100 {label}"
        )));
    }
    let sql = if by_area {
        include_str!("areas.sql")
    } else {
        include_str!("names.sql")
    };
    let mut output = Vec::new();
    for row in db.query_all(sql, &[input.to_string().into()]).await? {
        let ancestors: Value =
            serde_json::from_str(&row.get_string("ancestors")?).map_err(DbError::Json)?;
        output.push(json!({
            "id":row.get_i64("id")?, "key":row.get_string("key")?, "name":row.get_string("name")?,
            "type":row.get_string("type")?, "grade":row.get_opt_i64("grade")?, "areaId":row.get_i64("areaId")?,
            "areaName":row.get_string("areaName")?, "sendCount":row.get_i64("sendCount")?,
            "brokenOn":row.get_opt_string("brokenOn")?, "total":row.get_i64("total")?, "ancestors":ancestors
        }));
    }
    Ok(json!(output))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlannedSend {
    climb: i64,
    discipline: ClimbType,
    send: Option<i64>,
    ascent: Option<i64>,
    style: String,
    date: Option<String>,
    comment: Option<String>,
    rating: Option<i64>,
    grade: Option<i64>,
    feel: String,
}

fn plan_row(
    row: &Value,
    climb: &DbRow,
    scale: ImportGradePreference,
    today: &str,
) -> Result<PlannedSend, ImportError> {
    let discipline = ClimbType::parse(&climb.get_string("type")?).ok_or(DbError::Column("type"))?;
    let style = match row["ascentStyle"].as_str() {
        Some("onsight") if discipline.is_boulder() => Some("flash"),
        other => other,
    };
    let date = match &row["dateSent"] {
        Value::Null => None,
        Value::String(s) => Some(s.as_str()),
        _ => return Err(invalid("Invalid send date")),
    };
    let grade = row["gradeText"]
        .as_str()
        .and_then(|s| parse_grade(discipline, s, scale))
        .map(|n| n as i64);
    let listed = climb.get_i64("grade")?;
    let comment: Vec<u16> = row["comment"]
        .as_str()
        .unwrap_or("")
        .trim()
        .encode_utf16()
        .take(MAX_LOG_NOTE_LENGTH)
        .collect();
    let rating = row["rating"]
        .as_f64()
        .filter(|r| r.fract() == 0.0 && (1.0..=5.0).contains(r))
        .map(|r| r.to_string());
    let input = validate_send_input(
        discipline,
        style,
        date,
        Some(&String::from_utf16_lossy(&comment)),
        rating.as_deref(),
        Some(&grade.unwrap_or(listed).to_string()),
        row["gradeFeel"].as_str(),
        None,
        today,
    )
    .map_err(ImportError::Invalid)?;
    Ok(PlannedSend {
        climb: climb.get_i64("id")?,
        discipline,
        send: climb.get_opt_i64("send")?,
        ascent: climb.get_opt_i64("ascent")?,
        style: input.ascent_style,
        date: input.date_sent,
        comment: input.comment,
        rating: input.rating,
        grade,
        feel: input.grade_feel,
    })
}

const STATE: &str = "SELECT c.id,c.type,c.grade,c.broken_on,s.id AS send,s.date_sent,
 (SELECT j.id FROM journal_entries j WHERE j.user_id=?1 AND j.climb_id=c.id AND j.is_ascent=1) AS ascent,
 (SELECT min(j.entry_date) FROM journal_entries j WHERE j.user_id=?1 AND j.climb_id=c.id AND j.sent=1 AND j.is_ascent=0) AS first_repeat
 FROM climbs c LEFT JOIN sends s ON s.user_id=?1 AND s.climb_id=c.id
 WHERE c.id IN (SELECT value FROM json_each(?2))";

// Validate all pre-read identities in the transaction before changing a journal or send.
// A stale snapshot deliberately fails the receipt's NOT NULL constraint, rolling back every row.
const RECEIPT: &str = "INSERT INTO import_batches(user_id,batch_id,request_hash,result)
 SELECT CASE WHEN NOT EXISTS (
 SELECT 1 FROM json_each(?5) p LEFT JOIN climbs c ON c.id=p.value->>'climb'
 LEFT JOIN sends s ON s.climb_id=c.id AND s.user_id=?1
 WHERE c.type IS NOT (p.value->>'discipline') OR s.id IS NOT (p.value->>'send')
 OR (SELECT j.id FROM journal_entries j WHERE j.user_id=?1 AND j.climb_id=c.id AND j.is_ascent=1) IS NOT (p.value->>'ascent')
 OR EXISTS (SELECT 1 FROM journal_entries j WHERE j.user_id=?1 AND j.climb_id=c.id AND j.sent=1 AND j.is_ascent=0 AND j.entry_date<p.value->>'date')
 ) THEN ?1 END,?2,?3,?4";

const INSERT_SENDS: &str = "INSERT INTO sends(user_id,climb_id,ascent_style,date_sent,comment,rating,suggested_grade,grade_feel)
 SELECT ?1,c.id,p.value->>'style',p.value->>'date',p.value->>'comment',p.value->>'rating',coalesce(p.value->>'grade',c.grade),p.value->>'feel'
 FROM json_each(?2) p JOIN climbs c ON c.id=p.value->>'climb' WHERE p.value->>'send' IS NULL";
const UPDATE_JOURNALS: &str =
    "UPDATE journal_entries SET entry_date=p.value->>'date',body=p.value->>'comment',updated_at=?3
 FROM json_each(?2) p WHERE user_id=?1 AND journal_entries.id=p.value->>'ascent'";
const UPDATE_SENDS: &str = "UPDATE sends SET ascent_style=p.value->>'style',date_sent=p.value->>'date',comment=p.value->>'comment',
 rating=p.value->>'rating',suggested_grade=coalesce(p.value->>'grade',suggested_grade),grade_feel=p.value->>'feel',updated_at=?3
 FROM json_each(?2) p WHERE user_id=?1 AND sends.id=p.value->>'send'";
const INSERT_JOURNALS: &str =
    "INSERT INTO journal_entries(user_id,climb_id,kind,sent,is_ascent,entry_date,body)
 SELECT ?1,p.value->>'climb','session',1,1,p.value->>'date',p.value->>'comment'
 FROM json_each(?2) p WHERE p.value->>'date' IS NOT NULL AND p.value->>'ascent' IS NULL";

async fn read_receipt(
    db: &impl DbExecutor,
    owner: &str,
    batch: &str,
    hash: &str,
) -> Result<Option<Value>, ImportError> {
    let Some(row) = db
        .query_one(
            "SELECT request_hash,result FROM import_batches WHERE user_id=? AND batch_id=?",
            &[owner.into(), batch.into()],
        )
        .await?
    else {
        return Ok(None);
    };
    if row.get_string("request_hash")? != hash {
        return Err(invalid(
            "This import batch ID was already used for different rows",
        ));
    }
    Ok(Some(
        serde_json::from_str(&row.get_string("result")?).map_err(DbError::Json)?,
    ))
}

pub struct Batch<'a> {
    pub owner: &'a str,
    pub id: &'a str,
    pub hash: &'a str,
    pub overwrite: bool,
    pub scale: ImportGradePreference,
    pub today: &'a str,
    pub now: i64,
}

pub async fn import_sends(
    db: &impl DbExecutor,
    rows: &[Value],
    batch: Batch<'_>,
) -> Result<(Value, bool), ImportError> {
    if rows.len() > 50 {
        return Err(invalid("An import batch can carry at most 50 rows"));
    }
    let ids = rows
        .iter()
        .map(|r| {
            r["climbId"]
                .as_i64()
                .filter(|n| (1..=9_007_199_254_740_991).contains(n))
                .ok_or_else(|| invalid("Invalid import rows"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    if let Some(receipt) = read_receipt(db, batch.owner, batch.id, batch.hash).await? {
        return Ok((receipt, false));
    }
    let state = db
        .query_all(STATE, &[batch.owner.into(), json!(ids).to_string().into()])
        .await?;
    let climbs = state
        .into_iter()
        .map(|r| Ok((r.get_i64("id")?, r)))
        .collect::<Result<HashMap<_, _>, DbError>>()?;
    let mut processed = HashSet::new();
    let mut plan = Vec::new();
    let mut already_logged = 0;
    let mut missing = Vec::new();
    let mut broken = Vec::new();
    for (i, (row, id)) in rows.iter().zip(ids).enumerate() {
        let Some(climb) = climbs.get(&id) else {
            missing.push(i);
            continue;
        };
        if processed.contains(&id) || (climb.get_opt_i64("send")?.is_some() && !batch.overwrite) {
            already_logged += 1;
            continue;
        }
        let item = plan_row(row, climb, batch.scale, batch.today)?;
        if (item.send.is_none() || item.date != climb.get_opt_string("date_sent")?)
            && assert_loggable_on_climb(
                climb.get_opt_string("broken_on")?.as_deref(),
                item.date.as_deref(),
            )
            .is_err()
        {
            broken.push(i);
            continue;
        }
        if item.ascent.is_some() && item.date.is_none() {
            return Err(invalid("A send with journal history must keep its date"));
        }
        if let Some(date) = &item.date
            && climb
                .get_opt_string("first_repeat")?
                .is_some_and(|repeat| repeat < *date)
        {
            return Err(invalid(
                "The ascent date can't be later than a logged repeat",
            ));
        }
        processed.insert(id);
        plan.push(item);
    }
    let overwritten = plan.iter().filter(|p| p.send.is_some()).count();
    let result = json!({"imported":plan.len()-overwritten,"overwritten":overwritten,"alreadyLogged":already_logged,"missing":missing,"broken":broken});
    let encoded = serde_json::to_string(&plan).map_err(DbError::Json)?;
    let mut stmts = vec![(
        RECEIPT.into(),
        vec![
            batch.owner.into(),
            batch.id.into(),
            batch.hash.into(),
            result.to_string().into(),
            encoded.as_str().into(),
        ],
    )];
    if !plan.is_empty() {
        let base: Vec<DbParam> = vec![batch.owner.into(), encoded.into()];
        for sql in [INSERT_SENDS, UPDATE_JOURNALS, UPDATE_SENDS, INSERT_JOURNALS] {
            let mut params = base.clone();
            if sql == UPDATE_JOURNALS || sql == UPDATE_SENDS {
                params.push(batch.now.into())
            }
            stmts.push((sql.to_owned(), params));
        }
    }
    match db.batch(stmts).await {
        Ok(()) => Ok((result, !plan.is_empty())),
        Err(err) => match read_receipt(db, batch.owner, batch.id, batch.hash).await {
            Ok(Some(receipt)) => Ok((receipt, false)),
            Err(e @ ImportError::Invalid(_)) => Err(e),
            Ok(None)
                if err.to_string().contains("SQLITE_")
                    || err.to_string().contains("constraint failed") =>
            {
                Err(invalid(
                    "The journal or catalog changed while these sends were being imported — try again",
                ))
            }
            _ => Err(ImportError::Unknown),
        },
    }
}
