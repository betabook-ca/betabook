use crate::content_access::{content_visible_sql, journal_visible_sql, trips_visible_sql};
use crate::executor::{DbError, DbExecutor, DbParam, DbRow};
use crate::feed::JournalCompanion;
use crate::sends::MutationError;
use betabook_domain::trips::TripInput;
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TripSummary {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<i64>,
    pub name: String,
    pub description: Option<String>,
    pub album_url: Option<String>,
    pub start_date: String,
    pub end_date: String,
    pub entry_count: Option<i64>,
    pub send_count: i64,
    pub day_count: Option<i64>,
    pub has_notes: i64,
    pub companions: Vec<JournalCompanion>,
}

fn summary(row: &DbRow, shared: bool) -> Result<TripSummary, DbError> {
    Ok(TripSummary {
        id: if shared {
            None
        } else {
            Some(row.get_i64("id")?)
        },
        name: row.get_string("name")?,
        description: row.get_opt_string("description")?,
        album_url: row.get_opt_string("album_url")?,
        start_date: row.get_string("start_date")?,
        end_date: row.get_string("end_date")?,
        entry_count: row.get_opt_i64("entry_count")?,
        send_count: row.get_i64("send_count")?,
        day_count: row.get_opt_i64("day_count")?,
        has_notes: row.get_i64("has_notes")?,
        companions: serde_json::from_str(&row.get_string("companions")?)?,
    })
}

const COLS: &str = "t.id,t.name,t.description,t.album_url,t.start_date,t.end_date";
const JOURNAL_ROWS: &str = "FROM journal_entries j WHERE j.user_id=t.user_id AND j.entry_date BETWEEN t.start_date AND t.end_date";
const SEND_ROWS: &str =
    "FROM sends s WHERE s.user_id=t.user_id AND s.date_sent BETWEEN t.start_date AND t.end_date";
const LIVE: &str = "(link.expires_at IS NULL OR link.expires_at>datetime('now'))";
const SHARE_FROM: &str = "FROM trip_share_links link JOIN trips t ON t.id=link.trip_id AND t.user_id=link.user_id JOIN user owner ON owner.id=t.user_id";

fn member_columns(viewer: &str, p: &mut Vec<DbParam>) -> String {
    let entries = journal_visible_sql(Some(viewer), "t.user_id", p);
    let days = journal_visible_sql(Some(viewer), "t.user_id", p);
    let notes = content_visible_sql(Some(viewer), "t.user_id", "'friends'", p);
    p.push(viewer.into());
    let tagged = journal_visible_sql(Some(viewer), "t.user_id", p);
    format!("{COLS}, CASE WHEN {entries} THEN (SELECT COUNT(*) {JOURNAL_ROWS}) END entry_count,
        CASE WHEN {days} THEN (SELECT COUNT(DISTINCT j.entry_date) {JOURNAL_ROWS}) END day_count,
        (SELECT COUNT(*) {SEND_ROWS}) send_count, (t.notes IS NOT NULL AND {notes}) has_notes,
        (SELECT json_group_array(json_object('id',u.id,'name',u.name,'image',u.image,
               'isSelf',json(CASE WHEN u.id=? THEN 'true' ELSE 'false' END)))
         FROM trip_companions tc JOIN user u ON u.id=tc.user_id
         JOIN friendships f ON f.user_id=tc.friendship_user_id AND f.friend_id=tc.friendship_friend_id
         WHERE tc.trip_id=t.id AND tc.suppressed=0 AND f.status='accepted' AND {tagged}) companions")
}

pub async fn member_trips<D: DbExecutor>(
    db: &D,
    owner: &str,
    viewer: &str,
    id: Option<i64>,
) -> Result<Vec<TripSummary>, DbError> {
    let mut p = Vec::new();
    let cols = member_columns(viewer, &mut p);
    p.push(owner.into());
    let visible = trips_visible_sql(Some(viewer), "t.user_id", &mut p);
    let trip_id = if let Some(id) = id {
        p.push(id.into());
        " AND t.id=?"
    } else {
        ""
    };
    let sql = format!(
        "SELECT {cols} FROM trips t WHERE t.user_id=? AND {visible}{trip_id} ORDER BY t.start_date DESC,t.id DESC"
    );
    db.query_all(&sql, &p)
        .await?
        .iter()
        .map(|row| summary(row, false))
        .collect()
}

pub async fn member_notes<D: DbExecutor>(
    db: &D,
    owner: &str,
    viewer: &str,
    id: i64,
) -> Result<Option<String>, DbError> {
    let mut p = vec![owner.into(), id.into()];
    let visible = trips_visible_sql(Some(viewer), "t.user_id", &mut p);
    let notes = content_visible_sql(Some(viewer), "t.user_id", "'friends'", &mut p);
    db.query_one(
        &format!(
            "SELECT t.notes FROM trips t WHERE t.user_id=? AND t.id=? AND {visible} AND {notes}"
        ),
        &p,
    )
    .await?
    .map(|r| r.get_opt_string("notes"))
    .transpose()
    .map(Option::flatten)
}

pub enum ShareAccess {
    Hidden,
    Expired {
        owner: String,
        id: i64,
    },
    Visible {
        owner: String,
        name: String,
        image: Option<String>,
        id: i64,
        trip: Box<TripSummary>,
        notes: Option<String>,
    },
}

pub async fn shared_trip<D: DbExecutor>(db: &D, token: &str) -> Result<ShareAccess, DbError> {
    let sql = format!(
        "SELECT {COLS},owner.id owner,owner.name owner_name,owner.image owner_image, {LIVE} live,
      CASE WHEN {LIVE} THEN t.notes END notes, (t.notes IS NOT NULL) has_notes, '[]' companions,
      CASE WHEN {LIVE} THEN (SELECT COUNT(*) {SEND_ROWS}) END send_count,
      CASE WHEN {LIVE} THEN (SELECT COUNT(*) {JOURNAL_ROWS}) END entry_count,
      CASE WHEN {LIVE} THEN (SELECT COUNT(DISTINCT j.entry_date) {JOURNAL_ROWS}) END day_count
      {SHARE_FROM} WHERE link.token=? AND owner.is_private=0"
    );
    let Some(r) = db.query_one(&sql, &[token.into()]).await? else {
        return Ok(ShareAccess::Hidden);
    };
    let owner = r.get_string("owner")?;
    let id = r.get_i64("id")?;
    if !r.get_bool("live")? {
        return Ok(ShareAccess::Expired { owner, id });
    }
    Ok(ShareAccess::Visible {
        owner,
        name: r.get_string("owner_name")?,
        image: r.get_opt_string("owner_image")?,
        id,
        trip: Box::new(summary(&r, true)?),
        notes: r.get_opt_string("notes")?,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareLink {
    pub token: String,
    pub expires_at: Option<String>,
}

fn link(r: DbRow) -> Result<ShareLink, DbError> {
    Ok(ShareLink {
        token: r.get_string("token")?,
        expires_at: r.get_opt_string("expires_at")?,
    })
}

pub async fn owner_share<D: DbExecutor>(
    db: &D,
    owner: &str,
    id: i64,
) -> Result<Option<ShareLink>, DbError> {
    db.query_one(&format!("SELECT token,expires_at FROM trip_share_links link WHERE user_id=? AND trip_id=? AND {LIVE}"),&[owner.into(),id.into()]).await?.map(link).transpose()
}

pub async fn share<D: DbExecutor>(
    db: &D,
    owner: &str,
    id: i64,
    modifier: Option<&str>,
) -> Result<ShareLink, MutationError> {
    let sql = "INSERT INTO trip_share_links (user_id, trip_id, expires_at)
        SELECT t.user_id, t.id, datetime('now', ?)
        FROM trips t JOIN user u ON u.id = t.user_id
        WHERE t.user_id = ? AND t.id = ? AND u.is_private = 0
        ON CONFLICT (user_id, trip_id) DO UPDATE SET
          token = CASE WHEN trip_share_links.expires_at <= datetime('now')
                  THEN lower(hex(randomblob(16))) ELSE trip_share_links.token END,
          expires_at = excluded.expires_at
        RETURNING token, expires_at";
    let row = db
        .query_one(sql, &[modifier.into(), owner.into(), id.into()])
        .await?;
    if let Some(row) = row {
        return Ok(link(row)?);
    }
    let own = db
        .query_one(
            "SELECT 1 FROM trips WHERE user_id=? AND id=?",
            &[owner.into(), id.into()],
        )
        .await?
        .is_some();
    Err(MutationError::Validation(
        if own {
            "Sharing is off while your profile is private — change it in Account settings."
        } else {
            "Trip not found"
        }
        .into(),
    ))
}

pub async fn unshare<D: DbExecutor>(db: &D, owner: &str, id: i64) -> Result<(), DbError> {
    db.execute(
        "DELETE FROM trip_share_links WHERE user_id=? AND trip_id=?",
        &[owner.into(), id.into()],
    )
    .await?;
    Ok(())
}

pub async fn save<D: DbExecutor>(
    db: &D,
    owner: &str,
    id: Option<i64>,
    input: &TripInput,
    now: i64,
) -> Result<i64, MutationError> {
    let mut p = vec![
        input.name.as_str().into(),
        input.description.as_deref().into(),
        input.album_url.as_deref().into(),
        input.start_date.as_str().into(),
        input.end_date.as_str().into(),
        now.into(),
    ];
    let (sql, missing) = if let Some(id) = id {
        p.extend([owner.into(), id.into()]);
        (
            "UPDATE trips SET name=?,description=?,album_url=?,start_date=?,end_date=?,updated_at=? WHERE user_id=? AND id=? RETURNING id",
            "Trip not found",
        )
    } else {
        p.extend([now.into(), owner.into(), owner.into()]);
        ("INSERT INTO trips(name,description,album_url,start_date,end_date,updated_at,created_at,user_id)
          SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM trips WHERE user_id=?)<200 RETURNING id","You can keep 200 trips. Delete one to add another.")
    };
    let mut stmts = vec![(sql.to_owned(), p)];
    if let Some(ids) = &input.companions {
        let selected = serde_json::to_string(ids).map_err(DbError::from)?;
        if let Some(id) = id {
            stmts.push(("DELETE FROM trip_companions WHERE trip_id=? AND suppressed=0 AND EXISTS (SELECT 1 FROM trips WHERE id=? AND user_id=?)
                AND user_id NOT IN (SELECT value FROM json_each(?))".into(),vec![id.into(),id.into(),owner.into(),selected.as_str().into()]));
        }
        if !ids.is_empty() {
            let mut p = vec![owner.into()];
            let target = if let Some(id) = id {
                p.push(id.into());
                "t.id=?"
            } else {
                "t.id=last_insert_rowid() AND changes()>0"
            };
            p.extend([owner.into(), owner.into(), selected.into()]);
            stmts.push((format!("INSERT INTO trip_companions(trip_id,user_id,friendship_user_id,friendship_friend_id,suppressed)
                WITH tagged AS MATERIALIZED (SELECT t.id FROM trips t WHERE t.user_id=? AND {target})
                SELECT tagged.id,s.value,min(?,s.value),max(?,s.value),0 FROM tagged CROSS JOIN json_each(?) s WHERE true ON CONFLICT DO NOTHING"),p));
        }
    }
    let rows = db.batch_rows(stmts).await.map_err(|err| {
        if err.to_string().contains("trip companion:") {
            MutationError::Validation("A selected friend is no longer available for this trip. Refresh and update your tagged friends.".into())
        } else {
            MutationError::Db(err)
        }
    })?;
    Ok(rows
        .first()
        .and_then(|r| r.first())
        .ok_or_else(|| MutationError::Validation(missing.into()))?
        .get_i64("id")?)
}

pub async fn notes<D: DbExecutor>(
    db: &D,
    owner: &str,
    id: i64,
    notes: &str,
    now: i64,
) -> Result<(), MutationError> {
    if notes.encode_utf16().count() > 20_000 {
        return Err(MutationError::Validation(
            "Those notes are too long.".into(),
        ));
    }
    let changed = db
        .execute(
            "UPDATE trips SET notes=NULLIF(?,''),updated_at=? WHERE user_id=? AND id=?",
            &[notes.trim().into(), now.into(), owner.into(), id.into()],
        )
        .await?;
    if changed == 0 {
        return Err(MutationError::Validation("Trip not found".into()));
    }
    Ok(())
}
pub async fn delete<D: DbExecutor>(db: &D, owner: &str, id: i64) -> Result<(), DbError> {
    db.execute(
        "DELETE FROM trips WHERE id=? AND user_id=?",
        &[id.into(), owner.into()],
    )
    .await?;
    Ok(())
}
pub async fn remove_tag<D: DbExecutor>(db: &D, user: &str, id: i64) -> Result<(), MutationError> {
    let mut p = vec![id.into(), user.into(), id.into()];
    let visible = journal_visible_sql(Some(user), "t.user_id", &mut p);
    let sql = format!(
        "UPDATE trip_companions SET suppressed=1 WHERE trip_id=? AND user_id=? AND EXISTS(SELECT 1 FROM trips t WHERE t.id=? AND {visible})"
    );
    if db.execute(&sql, &p).await? == 0 {
        return Err(MutationError::Validation(
            "This tag is no longer available".into(),
        ));
    }
    Ok(())
}

/// Every read of dated rows rechecks the trip window and the authorization
/// in the same statement. A link that expires between reads grants nothing.
pub enum TripReader<'a> {
    Member { viewer: &'a str, trip_id: i64 },
    Link { token: &'a str },
}
impl TripReader<'_> {
    fn window(
        &self,
        owner: &str,
        author_expr: &str,
        date_expr: &str,
        journal: bool,
        p: &mut Vec<DbParam>,
    ) -> String {
        p.push(owner.into());
        match self {
            Self::Link { token } => {
                p.push((*token).into());
                format!(
                    "{author_expr}=? AND EXISTS(SELECT 1 {SHARE_FROM} WHERE link.token=? AND t.user_id={author_expr} AND owner.is_private=0 AND {LIVE} AND {date_expr} BETWEEN t.start_date AND t.end_date)"
                )
            }
            Self::Member { viewer, trip_id } => {
                p.push((*trip_id).into());
                let trips = trips_visible_sql(Some(viewer), "t.user_id", p);
                let entries = if journal {
                    journal_visible_sql(Some(viewer), "t.user_id", p)
                } else {
                    "1".to_owned()
                };
                format!(
                    "{author_expr}=? AND EXISTS(SELECT 1 FROM trips t WHERE t.id=? AND t.user_id={author_expr} AND {trips} AND {entries} AND {date_expr} BETWEEN t.start_date AND t.end_date)"
                )
            }
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayRows {
    pub sends: Vec<crate::sends::UserSendRow>,
    pub entries: Vec<crate::journal::JournalEntry>,
    pub sends_capped: bool,
    pub entries_capped: bool,
}
pub async fn day_rows<D: DbExecutor>(
    db: &D,
    owner: &str,
    reader: &TripReader<'_>,
) -> Result<DayRows, DbError> {
    const LIMIT: usize = 300;
    let shared = matches!(reader, TripReader::Link { .. });
    let viewer = match reader {
        TripReader::Member { viewer, .. } => *viewer,
        TripReader::Link { .. } => owner,
    };
    let mut p = Vec::new();
    let cols = crate::sends::user_send_columns(Some(viewer), &mut p);
    let window = reader.window(owner, "sends.user_id", "sends.date_sent", false, &mut p);
    let sql = format!(
        "SELECT {cols} FROM sends JOIN climbs ON climbs.id=sends.climb_id JOIN areas ON areas.id=climbs.area_id WHERE {window} ORDER BY sends.date_sent DESC,sends.id DESC LIMIT {}",
        LIMIT + 1
    );
    let rows = db.query_all(&sql, &p).await?;
    let sends_capped = rows.len() > LIMIT;
    let mut sends = rows
        .iter()
        .take(LIMIT)
        .map(crate::sends::row_to_user_send)
        .collect::<Result<Vec<_>, _>>()?;
    p.clear();
    let cols = crate::journal::journal_entry_columns(Some(viewer), &mut p, !shared);
    let window = reader.window(owner, "j.user_id", "j.entry_date", true, &mut p);
    let sql = format!(
        "{cols} WHERE {window} ORDER BY j.entry_date DESC,j.id DESC LIMIT {}",
        LIMIT + 1
    );
    let rows = db.query_all(&sql, &p).await?;
    let entries_capped = rows.len() > LIMIT;
    let mut entries = rows
        .iter()
        .take(LIMIT)
        .map(crate::journal::row_to_journal_entry)
        .collect::<Result<Vec<_>, _>>()?;
    if shared {
        // Only order matters on the read-only day cards. Never serialize
        // database send/entry IDs to a share-link holder.
        for (position, row) in sends.iter_mut().rev().enumerate() {
            row.id = position as i64;
        }
        for (position, row) in entries.iter_mut().rev().enumerate() {
            row.id = position as i64;
        }
    }
    Ok(DayRows {
        sends,
        entries,
        sends_capped,
        entries_capped,
    })
}

pub async fn analytics<D: DbExecutor>(
    db: &D,
    owner: &str,
    reader: &TripReader<'_>,
    journal_visible: bool,
) -> Result<serde_json::Value, DbError> {
    use serde_json::json;
    let mut p = Vec::new();
    let window = reader.window(owner, "s.user_id", "s.date_sent", false, &mut p);
    let sql = format!(
        "SELECT c.id,c.name,c.type,s.suggested_grade,c.area_id,a.name area_name,s.ascent_style,s.date_sent FROM sends s JOIN climbs c ON c.id=s.climb_id JOIN areas a ON a.id=c.area_id WHERE {window} ORDER BY s.date_sent,s.id"
    );
    let mut sends = Vec::new();
    for r in db.query_all(&sql, &p).await? {
        sends.push(json!({"climbId":r.get_i64("id")?,"climbName":r.get_string("name")?,"climbType":r.get_string("type")?,
            "suggestedGrade":r.get_opt_i64("suggested_grade")?,"areaId":r.get_i64("area_id")?,"areaName":r.get_string("area_name")?,
            "ascentStyle":r.get_string("ascent_style")?,"dateSent":r.get_string("date_sent")?}));
    }
    let mut data = json!({"sends":sends});
    if journal_visible {
        p.clear();
        let window = reader.window(owner, "j.user_id", "j.entry_date", true, &mut p);
        let sql = format!(
            "SELECT j.entry_date, c.type, COUNT(*) total
             FROM journal_entries j JOIN climbs c ON c.id = j.climb_id
             WHERE {window} AND j.kind = 'session'
             GROUP BY j.entry_date, c.type ORDER BY j.entry_date, c.type"
        );
        let mut sessions = Vec::new();
        for r in db.query_all(&sql, &p).await? {
            sessions.push(json!({"entryDate":r.get_string("entry_date")?,"climbType":r.get_string("type")?,"count":r.get_i64("total")?}));
        }
        data["sessions"] = json!(sessions);
    }
    Ok(data)
}

/// Select the names used in member HTML previews under the same trip-access
/// predicate as the JSON loader.
pub async fn member_title<D: DbExecutor>(
    db: &D,
    owner: &str,
    viewer: &str,
    trip_id: Option<i64>,
) -> Result<Option<String>, DbError> {
    let mut params = Vec::new();
    let (name, join) = if let Some(id) = trip_id {
        params.push(id.into());
        ("t.name", " JOIN trips t ON t.user_id=u.id AND t.id=?")
    } else {
        ("'Trips'", "")
    };
    params.push(owner.into());
    let visible = trips_visible_sql(Some(viewer), "u.id", &mut params);
    let sql = format!(
        "SELECT u.name || ' · ' || {name} AS title FROM user u{join} WHERE u.id=? AND {visible}"
    );
    db.query_one(&sql, &params)
        .await?
        .map(|r| r.get_string("title"))
        .transpose()
}

pub async fn member_album<D: DbExecutor>(
    db: &D,
    owner: &str,
    id: i64,
    viewer: &str,
) -> Result<Option<DbRow>, DbError> {
    let mut params = vec![owner.into(), id.into()];
    let visible = trips_visible_sql(Some(viewer), "t.user_id", &mut params);
    db.query_one(
        &format!("SELECT t.album_url FROM trips t WHERE t.user_id=? AND t.id=? AND {visible}"),
        &params,
    )
    .await
}

pub async fn shared_album<D: DbExecutor>(db: &D, token: &str) -> Result<Option<DbRow>, DbError> {
    db.query_one(
        &format!(
            "SELECT t.album_url {SHARE_FROM} WHERE link.token=? AND owner.is_private=0 AND {LIVE}"
        ),
        &[token.into()],
    )
    .await
}
