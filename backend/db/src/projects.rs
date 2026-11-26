use std::collections::HashMap;

use serde::Serialize;

use crate::executor::{DbError, DbExecutor, DbParam, DbRow};
use crate::journal::{JournalEntry, journal_entry_select, row_to_journal_entry};
use crate::sends::MutationError;

const PIN_LIMIT: i64 = 100;
const CLIMB_COLUMNS: &str = "c.id AS climbId, c.name AS climbName, c.type AS climbType,
    c.grade AS climbGrade, c.broken_on AS climbBrokenOn, c.area_id AS areaId, a.name AS areaName";

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    climb_id: i64,
    climb_name: String,
    #[cfg_attr(
        feature = "api-spec",
        schemars(with = "betabook_domain::grades::ClimbType")
    )]
    climb_type: String,
    climb_grade: Option<i64>,
    climb_broken_on: Option<String>,
    area_id: i64,
    area_name: String,
    session_count: i64,
}

impl ProjectSummary {
    fn from_row(row: &DbRow) -> Result<Self, DbError> {
        Ok(Self {
            climb_id: row.get_i64("climbId")?,
            climb_name: row.get_string("climbName")?,
            climb_type: row.get_string("climbType")?,
            climb_grade: row.get_opt_i64("climbGrade")?,
            climb_broken_on: row.get_opt_string("climbBrokenOn")?,
            area_id: row.get_i64("areaId")?,
            area_name: row.get_string("areaName")?,
            session_count: row.get_i64("sessionCount")?,
        })
    }
}

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectLink {
    pub token: String,
    expires_at: Option<String>,
}

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PinnedProject {
    #[serde(flatten)]
    summary: ProjectSummary,
    first_session: Option<String>,
    last_session: Option<String>,
    note_count: i64,
    pinned_at: String,
    sent: bool,
    sent_on: Option<String>,
    share: Option<ProjectLink>,
    sessions: Vec<JournalEntry>,
}

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Suggestion {
    #[serde(flatten)]
    summary: ProjectSummary,
    first_session: String,
    last_session: String,
    note_count: i64,
}

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectBoard {
    projects: Vec<PinnedProject>,
    suggestions: Vec<Suggestion>,
    pinned_climb_ids: Vec<i64>,
    has_more: bool,
}

/// The caller supplies the authenticated member's id. Boards never accept a separate viewer.
pub async fn project_board<D: DbExecutor>(
    db: &D,
    owner: &str,
    sent: bool,
) -> Result<ProjectBoard, DbError> {
    let order = if sent { "s.date_sent" } else { "lastSession" };
    let sql = format!("SELECT {CLIMB_COLUMNS}, p.pinned_at, s.date_sent, l.token, l.expires_at,
      COUNT(j.id) AS sessionCount, COUNT(j.id) FILTER (WHERE trim(j.body) <> '') AS noteCount,
      min(j.entry_date) AS firstSession, max(j.entry_date) AS lastSession
      FROM pinned_projects p JOIN climbs c ON c.id=p.climb_id JOIN areas a ON a.id=c.area_id
      LEFT JOIN sends s ON s.user_id=p.user_id AND s.climb_id=p.climb_id
      LEFT JOIN project_share_links l ON l.user_id=p.user_id AND l.climb_id=p.climb_id
      LEFT JOIN journal_entries j ON j.user_id=p.user_id AND j.climb_id=p.climb_id AND j.kind='session'
      WHERE p.user_id=? AND (s.id IS NOT NULL)=? GROUP BY p.climb_id
      ORDER BY {order} DESC, p.pinned_at DESC, p.climb_id LIMIT ?");
    let mut rows = db
        .query_all(&sql, &[owner.into(), sent.into(), (PIN_LIMIT + 1).into()])
        .await?;
    let has_more = rows.len() > PIN_LIMIT as usize;
    rows.truncate(PIN_LIMIT as usize);
    let climb_ids = rows
        .iter()
        .map(|r| r.get_i64("climbId"))
        .collect::<Result<Vec<_>, _>>()?;
    let mut sessions = HashMap::<i64, Vec<JournalEntry>>::new();
    if !climb_ids.is_empty() {
        let mut params = vec![owner.into(), serde_json::to_string(&climb_ids)?.into()];
        let select = journal_entry_select(Some(owner), &mut params);
        let sql = format!("WITH ranked AS (SELECT id, row_number() OVER
            (PARTITION BY climb_id ORDER BY entry_date DESC, id DESC) AS seq
            FROM journal_entries WHERE user_id=? AND kind='session'
              AND climb_id IN (SELECT value FROM json_each(?)))
            {select} JOIN ranked ON ranked.id=j.id AND ranked.seq<=3 ORDER BY j.entry_date DESC,j.id DESC");
        for row in db.query_all(&sql, &params).await? {
            sessions
                .entry(row.get_i64("climbId")?)
                .or_default()
                .push(row_to_journal_entry(&row)?);
        }
    }

    let projects = rows
        .iter()
        .map(|row| {
            let summary = ProjectSummary::from_row(row)?;
            let expires_at = row.get_opt_string("expires_at")?;
            Ok(PinnedProject {
                first_session: row.get_opt_string("firstSession")?,
                last_session: row.get_opt_string("lastSession")?,
                sessions: sessions.remove(&summary.climb_id).unwrap_or_default(),
                summary,
                sent,
                pinned_at: row.get_string("pinned_at")?,
                sent_on: row.get_opt_string("date_sent")?,
                note_count: row.get_i64("noteCount")?,
                share: row
                    .get_opt_string("token")?
                    .map(|token| ProjectLink { token, expires_at }),
            })
        })
        .collect::<Result<_, DbError>>()?;

    let mut suggestions = Vec::new();
    let mut pinned_climb_ids = Vec::new();
    if !sent {
        let sql = format!("SELECT {CLIMB_COLUMNS}, COUNT(*) AS sessionCount,
          COUNT(*) FILTER (WHERE trim(j.body)<>'') AS noteCount,
          min(j.entry_date) AS firstSession, max(j.entry_date) AS lastSession
          FROM journal_entries j JOIN climbs c ON c.id=j.climb_id JOIN areas a ON a.id=c.area_id
          WHERE j.user_id=? AND j.kind='session' AND NOT EXISTS
          (SELECT 1 FROM sends s WHERE s.user_id=j.user_id AND s.climb_id=j.climb_id)
          AND NOT EXISTS (SELECT 1 FROM pinned_projects p WHERE p.user_id=j.user_id AND p.climb_id=j.climb_id)
          GROUP BY j.climb_id ORDER BY sessionCount DESC,lastSession DESC,j.climb_id LIMIT 8");
        for row in db.query_all(&sql, &[owner.into()]).await? {
            suggestions.push(Suggestion {
                first_session: row.get_string("firstSession")?,
                last_session: row.get_string("lastSession")?,
                summary: ProjectSummary::from_row(&row)?,
                note_count: row.get_i64("noteCount")?,
            });
        }
        for row in db
            .query_all(
                "SELECT climb_id FROM pinned_projects WHERE user_id=?",
                &[owner.into()],
            )
            .await?
        {
            pinned_climb_ids.push(row.get_i64("climb_id")?);
        }
    }
    Ok(ProjectBoard {
        projects,
        suggestions,
        pinned_climb_ids,
        has_more,
    })
}

pub async fn pin_project<D: DbExecutor>(
    db: &D,
    owner: &str,
    climb: i64,
) -> Result<(), MutationError> {
    if db
        .query_one("SELECT 1 FROM climbs WHERE id=?", &[climb.into()])
        .await?
        .is_none()
    {
        return Err(MutationError::Validation("Climb not found".into()));
    }
    let params = [owner.into(), climb.into(), owner.into(), PIN_LIMIT.into()];
    let inserted = db
        .execute(
            "INSERT INTO pinned_projects(user_id, climb_id) SELECT ?, ?
        WHERE (SELECT count(*) FROM pinned_projects WHERE user_id=?) < ? ON CONFLICT DO NOTHING",
            &params,
        )
        .await?;
    if inserted == 0
        && db
            .query_one(
                "SELECT 1 FROM pinned_projects WHERE user_id=? AND climb_id=?",
                &params[..2],
            )
            .await?
            .is_none()
    {
        return Err(MutationError::Validation(format!(
            "You can track up to {PIN_LIMIT} projects — untrack one to add another"
        )));
    }
    Ok(())
}

pub async fn unpin_project<D: DbExecutor>(db: &D, owner: &str, climb: i64) -> Result<(), DbError> {
    db.execute(
        "DELETE FROM pinned_projects WHERE user_id=? AND climb_id=?",
        &[owner.into(), climb.into()],
    )
    .await?;
    Ok(())
}

pub async fn share_project<D: DbExecutor>(
    db: &D,
    owner: &str,
    climb: i64,
    modifier: Option<&str>,
) -> Result<ProjectLink, MutationError> {
    let row = db.query_one("INSERT INTO project_share_links(user_id,climb_id,expires_at)
        SELECT p.user_id,p.climb_id,datetime('now',?) FROM pinned_projects p JOIN user u ON u.id=p.user_id
        WHERE p.user_id=? AND p.climb_id=? AND u.is_private=0
        ON CONFLICT(user_id,climb_id) DO UPDATE SET expires_at=excluded.expires_at RETURNING token,expires_at",
        &[DbParam::from(modifier),owner.into(),climb.into()]).await?;
    if let Some(row) = row {
        return Ok(ProjectLink {
            token: row.get_string("token")?,
            expires_at: row.get_opt_string("expires_at")?,
        });
    }
    let pinned = db
        .query_one(
            "SELECT 1 FROM pinned_projects WHERE user_id=? AND climb_id=?",
            &[owner.into(), climb.into()],
        )
        .await?
        .is_some();
    Err(MutationError::Validation(
        if pinned {
            "Sharing is off while your profile is private — change it in Account settings."
        } else {
            "Track this climb as a project before sharing it"
        }
        .into(),
    ))
}

pub async fn unshare_project<D: DbExecutor>(
    db: &D,
    owner: &str,
    climb: i64,
) -> Result<(), DbError> {
    db.execute(
        "DELETE FROM project_share_links WHERE user_id=? AND climb_id=?",
        &[owner.into(), climb.into()],
    )
    .await?;
    Ok(())
}

const SHARE_FROM: &str = "FROM project_share_links l JOIN pinned_projects p ON p.user_id=l.user_id AND p.climb_id=l.climb_id JOIN user u ON u.id=l.user_id";
const READABLE: &str = "u.is_private=0 AND (l.expires_at IS NULL OR l.expires_at>datetime('now'))";

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedProject {
    #[serde(flatten)]
    summary: ProjectSummary,
    first_session: Option<String>,
    last_session: Option<String>,
    owner_id: String,
    pub owner_name: String,
    owner_image: Option<String>,
    pinned_at: String,
    pub sent: bool,
    sent_on: Option<String>,
    #[cfg_attr(
        feature = "api-spec",
        schemars(with = "Option<betabook_domain::wire::AscentStyle>")
    )]
    ascent_style: Option<String>,
    rating: Option<i64>,
    suggested_grade: Option<i64>,
    #[cfg_attr(
        feature = "api-spec",
        schemars(with = "Option<betabook_domain::wire::GradeFeel>")
    )]
    grade_feel: Option<String>,
    send_comment: Option<String>,
}

impl SharedProject {
    pub fn climb_name(&self) -> &str {
        &self.summary.climb_name
    }
}

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedSession {
    id: i64,
    entry_date: String,
    body: Option<String>,
    tags: Vec<String>,
}

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum SharedAccess {
    Hidden,
    Expired,
    Visible {
        project: Box<SharedProject>,
        sessions: Vec<SharedSession>,
    },
}

pub async fn shared_project<D: DbExecutor>(db: &D, token: &str) -> Result<SharedAccess, DbError> {
    let sql = format!("SELECT {READABLE} AS readable,u.is_private,u.name AS ownerName,u.image AS ownerImage,u.id AS ownerId,
        {CLIMB_COLUMNS},p.pinned_at,s.id IS NOT NULL AS sent,s.date_sent,s.ascent_style,s.rating,s.suggested_grade,
        s.grade_feel,s.comment,COUNT(j.id) AS sessionCount,min(j.entry_date) AS firstSession,max(j.entry_date) AS lastSession
        {SHARE_FROM} JOIN climbs c ON c.id=l.climb_id JOIN areas a ON a.id=c.area_id
        LEFT JOIN sends s ON s.user_id=l.user_id AND s.climb_id=l.climb_id
        LEFT JOIN journal_entries j ON j.user_id=l.user_id AND j.climb_id=l.climb_id AND j.kind='session'
        WHERE l.token=? GROUP BY l.token");
    let Some(row) = db.query_one(&sql, &[token.into()]).await? else {
        return Ok(SharedAccess::Hidden);
    };
    if row.get_bool("is_private")? {
        return Ok(SharedAccess::Hidden);
    }
    if !row.get_bool("readable")? {
        return Ok(SharedAccess::Expired);
    }
    let project = SharedProject {
        first_session: row.get_opt_string("firstSession")?,
        last_session: row.get_opt_string("lastSession")?,
        summary: ProjectSummary::from_row(&row)?,
        owner_id: row.get_string("ownerId")?,
        owner_name: row.get_string("ownerName")?,
        owner_image: row.get_opt_string("ownerImage")?,
        pinned_at: row.get_string("pinned_at")?,
        sent: row.get_bool("sent")?,
        sent_on: row.get_opt_string("date_sent")?,
        ascent_style: row.get_opt_string("ascent_style")?,
        rating: row.get_opt_i64("rating")?,
        suggested_grade: row.get_opt_i64("suggested_grade")?,
        grade_feel: row.get_opt_string("grade_feel")?,
        send_comment: row.get_opt_string("comment")?,
    };
    let sql = format!(
        "SELECT j.id,j.entry_date,j.body,j.tags {SHARE_FROM}
       JOIN journal_entries j ON j.user_id=l.user_id AND j.climb_id=l.climb_id AND j.kind='session'
       WHERE l.token=? AND {READABLE} ORDER BY j.entry_date DESC,j.id DESC LIMIT 20"
    );
    let mut sessions = Vec::new();
    for row in db.query_all(&sql, &[token.into()]).await? {
        let tags = row
            .get_opt_string("tags")?
            .map(|s| serde_json::from_str(&s))
            .transpose()?
            .unwrap_or_default();
        sessions.push(SharedSession {
            id: row.get_i64("id")?,
            entry_date: row.get_string("entry_date")?,
            body: row.get_opt_string("body")?,
            tags,
        });
    }
    Ok(SharedAccess::Visible {
        project: Box::new(project),
        sessions,
    })
}
