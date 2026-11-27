//! Scoped moderation. Decisions and their catalog changes share one D1 batch.
mod describe;
mod queue;
mod validate;

pub use queue::review_queue;

use crate::{DbError, DbExecutor, DbParam, DbRow, sends::MutationError};
use describe::Description;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

type Result<T> = std::result::Result<T, MutationError>;
type Statement = (String, Vec<DbParam>);
const FACTS: &str = include_str!("facts.sql");
const COVERAGE: &str = include_str!("coverage.sql");
const STALE: &str = "The request or affected area/climb changed — reload and try again";

fn invalid(message: &str) -> MutationError {
    MutationError::Validation(message.into())
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct Facts {
    name: Option<String>,
    source_area: Option<i64>,
    parent: Option<i64>,
    parent_name: Option<String>,
    area_name: Option<String>,
    #[serde(rename = "type")]
    discipline: Option<String>,
    grade: Option<i64>,
    description: Option<String>,
    send_count: i64,
    broken_on: Option<String>,
    destination_area: Option<i64>,
    destination_name: Option<String>,
    destination_type: Option<String>,
    destination_grade: Option<i64>,
    destination_description: Option<String>,
    destination_broken_on: Option<String>,
}

pub(super) struct Change {
    kind: String,
    id: i64,
    payload: Value,
    facts: Facts,
}
impl Change {
    fn from_row(row: &DbRow) -> Result<Self> {
        Ok(Self {
            kind: row.get_string("type")?,
            id: row.get_i64("entity_id")?,
            payload: serde_json::from_str(&row.get_string("payload")?).map_err(DbError::from)?,
            facts: serde_json::from_str(&row.get_string("facts")?).map_err(DbError::from)?,
        })
    }
    fn destination(&self) -> Option<i64> {
        let key = match self.kind.as_str() {
            "area_reparent" => "newParentId",
            "climb_move" => "newAreaId",
            "climb_merge" => "targetClimbId",
            _ => return None,
        };
        self.payload[key].as_i64()
    }
    fn scope(&self) -> Result<Vec<i64>> {
        let source = self.facts.source_area.ok_or_else(|| {
            invalid(if self.kind.starts_with("area_") {
                "Area not found"
            } else {
                "Climb not found"
            })
        })?;
        let mut areas = vec![source];
        if matches!(
            self.kind.as_str(),
            "area_reparent" | "climb_move" | "climb_merge"
        ) {
            let dest = self.facts.destination_area.ok_or_else(|| {
                invalid(match self.kind.as_str() {
                    "area_reparent" => "Parent area not found",
                    "climb_merge" => "Target climb not found",
                    _ => "Area not found",
                })
            })?;
            if dest != source {
                areas.push(dest);
            }
        }
        Ok(areas)
    }
    fn context(&self, reviewer: &str, request: Option<i64>) -> Result<Value> {
        Ok(
            json!({"id":self.id,"kind":self.kind,"payload":self.payload,"dest":self.destination(),"scope":self.scope()?,
        "sourceArea":self.facts.source_area,"targetArea":self.facts.destination_area,"parent":self.facts.parent,
        "type":self.facts.discipline,"reviewer":reviewer,"request":request}),
        )
    }
    fn stable_scope(&self) -> String {
        let source = if self.kind.starts_with("area_") {
            "EXISTS(SELECT 1 FROM areas WHERE id=?1->>'id' AND parent_id IS ?1->>'parent')"
        } else {
            "EXISTS(SELECT 1 FROM climbs WHERE id=?1->>'id' AND area_id=?1->>'sourceArea' AND type=?1->>'type')"
        };
        let dest = match self.kind.as_str() {
            "area_reparent" | "climb_move" => {
                " AND EXISTS(SELECT 1 FROM areas WHERE id=?1->>'dest' AND id=?1->>'targetArea')"
            }
            "climb_merge" => {
                " AND EXISTS(SELECT 1 FROM climbs WHERE id=?1->>'dest' AND area_id=?1->>'targetArea')"
            }
            _ => "",
        };
        format!("{source}{dest}")
    }
}

fn bind(sql: impl Into<String>, context: &Value) -> Statement {
    (sql.into(), vec![context.to_string().into()])
}

fn authorized(all: bool) -> String {
    let filter = if all {
        "any_scope AND all_scopes"
    } else {
        "any_scope"
    };
    format!("EXISTS(SELECT 1 FROM ({COVERAGE}) WHERE {filter})")
}
const PENDING: &str =
    "id=?1->>'request' AND status='pending' AND requested_by IS NOT ?1->>'reviewer'
 AND type=?1->>'kind' AND entity_id=?1->>'id' AND payload=?1->>'stored'";
const TIMESTAMP: &str = "cast(unixepoch('subsecond')*1000 as integer)";
const ORPHAN_CLIMB:&str="UPDATE change_requests SET status='rejected',review_note='The area or climb this request affected no longer exists.',reviewed_at=cast(unixepoch('subsecond')*1000 as integer)
 WHERE status='pending' AND ((type LIKE 'climb_%' AND entity_id=?1->>'id') OR (type='climb_merge' AND payload->>'targetClimbId'=?1->>'id'))";
const ORPHAN_AREA:&str="UPDATE change_requests SET status='rejected',review_note='The area or climb this request affected no longer exists.',reviewed_at=cast(unixepoch('subsecond')*1000 as integer)
 WHERE status='pending' AND ((type LIKE 'area_%' AND entity_id=?1->>'id') OR (type='area_reparent' AND payload->>'newParentId'=?1->>'id') OR (type='climb_move' AND payload->>'newAreaId'=?1->>'id'))";

fn application(change: &Change, context: &Value) -> Result<Vec<Statement>> {
    let sql = match change.kind.as_str() {
        "area_edit" => vec!["UPDATE areas SET name=?1->>'$.payload.name' WHERE id=?1->>'id'"],
        "area_delete" => vec![
            "UPDATE catalog_area_sources SET area_id=NULL,quality='area_deleted' WHERE area_id=?1->>'id'",
            "DELETE FROM areas WHERE id=?1->>'id'",
            ORPHAN_AREA,
        ],
        "area_reparent" => vec!["UPDATE areas SET parent_id=?1->>'dest' WHERE id=?1->>'id'"],
        "climb_move" => vec!["UPDATE climbs SET area_id=?1->>'dest' WHERE id=?1->>'id'"],
        "climb_edit" => vec![
            "UPDATE climbs SET name=coalesce(?1->>'$.payload.name',name),type=coalesce(?1->>'$.payload.type',type),grade=coalesce(?1->>'$.payload.grade',grade) WHERE id=?1->>'id'",
        ],
        "climb_delete" => vec![
            "UPDATE catalog_route_sources SET climb_id=NULL,status='review',match_kind='climb_deleted',match_score=NULL WHERE climb_id=?1->>'id'",
            "DELETE FROM climbs WHERE id=?1->>'id'",
            ORPHAN_CLIMB,
        ],
        "climb_merge" => {
            let mut parts: Vec<_> = include_str!("apply_merge.sql")
                .trim_end()
                .trim_end_matches(';')
                .split(";\n")
                .collect();
            parts.push(ORPHAN_CLIMB);
            parts
        }
        "climb_break" => include_str!("apply_break.sql")
            .trim_end()
            .trim_end_matches(';')
            .split(";\n")
            .collect(),
        _ => return Err(invalid("Invalid request type")),
    };
    Ok(sql.into_iter().map(|s|bind(s.replace("{successor}","(SELECT max(id) FROM climbs WHERE area_id=?1->>'sourceArea' AND name=?1->>'$.payload.successorName')"),context)).collect())
}

async fn apply(db: &impl DbExecutor, change: &Change, context: &Value) -> Result<()> {
    let stable = change.stable_scope();
    let auth = authorized(true);
    let extra = match change.kind.as_str() {
        "area_delete" => {
            " AND NOT EXISTS(SELECT 1 FROM areas WHERE parent_id=?1->>'id') AND NOT EXISTS(SELECT 1 FROM climbs WHERE area_id=?1->>'id')"
        }
        "climb_delete" => {
            " AND NOT EXISTS(SELECT 1 FROM sends WHERE climb_id=?1->>'id') AND NOT EXISTS(SELECT 1 FROM journal_entries WHERE climb_id=?1->>'id')"
        }
        "climb_merge" => {
            " AND NOT EXISTS(SELECT 1 FROM climbs WHERE id IN (?1->>'id',?1->>'dest') AND (broken_on IS NOT NULL OR type<>?1->>'type'))"
        }
        "climb_break" => {
            " AND EXISTS(SELECT 1 FROM climbs WHERE id=?1->>'id' AND broken_on IS NULL)"
        }
        _ => "",
    };
    let guard = format!("{stable} AND {auth}{extra}");
    let mut batch = if context["request"].is_null() {
        vec![bind(format!("INSERT INTO change_requests(type,entity_id,payload,requested_by,status,reviewed_by,reviewed_at)
        SELECT ?1->>'kind',?1->>'id',CASE WHEN {guard} THEN ?1->'payload' END,?1->>'reviewer','approved',?1->>'reviewer',{TIMESTAMP}"),context),
        bind("INSERT INTO change_request_approvals(request_id,user_id) VALUES(last_insert_rowid(),?1->>'reviewer')",context)]
    } else {
        vec![bind(format!("INSERT INTO change_request_approvals(request_id,user_id)
        VALUES((SELECT id FROM change_requests WHERE {PENDING} AND {guard}),?1->>'reviewer') ON CONFLICT(request_id,user_id) DO NOTHING"),context),
        bind(format!("UPDATE change_requests SET status='approved',reviewed_by=?1->>'reviewer',reviewed_at={TIMESTAMP},review_note=NULL WHERE id=?1->>'request'"),context)]
    };
    batch.extend(application(change, context)?);
    match db.batch(batch).await {
        Err(DbError::Query(e)) if e.contains("NOT NULL constraint failed: change_request") => {
            Err(invalid(STALE))
        }
        res => Ok(res?),
    }
}

pub async fn submit(
    db: &impl DbExecutor,
    user: &str,
    kind: &str,
    id: i64,
    input: Value,
    today: &str,
) -> Result<&'static str> {
    let source = format!(
        "WITH requests AS (SELECT ?1 AS type,?2 AS entity_id,?3 AS payload,?4 AS requested_by) {FACTS}"
    );
    let row = db
        .query_one(
            &source,
            &[
                kind.into(),
                id.into(),
                input.to_string().into(),
                user.into(),
            ],
        )
        .await?
        .ok_or_else(|| invalid("Entity not found"))?;
    let mut change = Change::from_row(&row)?;
    change.scope()?;
    validate::prepare(db, &mut change, today, true).await?;
    let context = change.context(user, None)?;
    let coverage = db
        .query_one(COVERAGE, &[context.to_string().into()])
        .await?
        .ok_or_else(|| invalid(STALE))?;
    if coverage.get_bool("all_scopes")? && coverage.get_bool("any_scope")? {
        apply(db, &change, &context).await?;
        return Ok("applied");
    }
    let batch = vec![
        bind(
            "INSERT INTO change_requests(type,entity_id,payload,requested_by) VALUES(?1->>'kind',?1->>'id',?1->'payload',?1->>'reviewer')",
            &context,
        ),
        bind(
            "INSERT INTO change_request_approvals(request_id,user_id) SELECT last_insert_rowid(),id FROM user WHERE id=?1->>'reviewer' AND role='admin'",
            &context,
        ),
    ];
    match db.batch(batch).await {
        Err(DbError::Query(e)) if e.contains("UNIQUE constraint failed") => Err(invalid(
            "You already have a pending request for this — an admin will review it",
        )),
        r => {
            r?;
            Ok("pending")
        }
    }
}

#[derive(Serialize)]
pub struct DecisionEmail {
    pub email: String,
    pub name: String,
    pub summary: String,
    pub details: Vec<String>,
    pub href: String,
    pub note: Option<String>,
    pub approved: bool,
}
pub struct Decision {
    pub awaiting: bool,
    pub email: Option<DecisionEmail>,
}

pub async fn review(
    db: &impl DbExecutor,
    reviewer: &str,
    id: i64,
    approve: bool,
    note: Option<String>,
    today: &str,
) -> Result<Decision> {
    let sql = format!("WITH requests AS (SELECT * FROM change_requests WHERE id=?) {FACTS}");
    let row = db
        .query_one(&sql, &[id.into()])
        .await?
        .ok_or_else(|| invalid("Request not found"))?;
    if row.get_string("status")? != "pending" {
        return Err(invalid("This request has already been reviewed"));
    }
    if row.get_opt_string("requested_by")?.as_deref() == Some(reviewer) {
        return Err(invalid("You can't review your own request"));
    }
    let mut change = Change::from_row(&row)?;
    let mut ctx = change
        .context(reviewer, Some(id))
        .map_err(|_| invalid("The area or climb this request affects is gone"))?;
    ctx["stored"] = json!(row.get_string("payload")?);
    ctx["note"] = json!(note);
    let description = Description::for_change(&change);
    record_review(db, &ctx, &change, approve).await?;
    if approve {
        let coverage = db
            .query_one(COVERAGE, &[ctx.to_string().into()])
            .await?
            .ok_or_else(|| invalid(STALE))?;
        if !coverage.get_bool("all_scopes")? {
            return Ok(Decision {
                awaiting: true,
                email: None,
            });
        }
        validate::prepare(db, &mut change, today, false).await?;
        ctx["payload"] = change.payload.clone();
        apply(db, &change, &ctx).await?;
    }
    let email = match (
        row.get_opt_string("requesterEmail")?,
        row.get_opt_string("requesterName")?,
    ) {
        (Some(email), Some(name)) => Some(DecisionEmail {
            email,
            name,
            summary: description.requester_summary,
            details: description.details,
            href: description.href,
            note,
            approved: approve,
        }),
        _ => None,
    };
    Ok(Decision {
        awaiting: false,
        email,
    })
}

async fn record_review(
    db: &impl DbExecutor,
    ctx: &Value,
    change: &Change,
    approve: bool,
) -> Result<()> {
    let guard = format!(
        "{PENDING} AND {} AND {}",
        change.stable_scope(),
        authorized(false)
    );
    let sql = if approve {
        format!("INSERT INTO change_request_approvals(request_id,user_id) SELECT id,?1->>'reviewer' FROM change_requests WHERE {guard}
        ON CONFLICT(request_id,user_id) DO UPDATE SET user_id=excluded.user_id RETURNING request_id")
    } else {
        format!(
            "UPDATE change_requests SET status='rejected',reviewed_by=?1->>'reviewer',reviewed_at={TIMESTAMP},review_note=?1->>'note' WHERE {guard} RETURNING id"
        )
    };
    if db
        .query_one(&sql, &[ctx.to_string().into()])
        .await?
        .is_none()
    {
        return Err(invalid(
            "You don't manage this area or the request has already been reviewed",
        ));
    }
    Ok(())
}
