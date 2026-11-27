use betabook_domain::climb_lists::{
    ITEM_LIMIT, LIST_FULL, LIST_LIMIT, LIST_MISSING, LIST_UNAVAILABLE, ListInput, TOO_MANY_LISTS,
    fold_climb_name,
};
use betabook_domain::public_catalog::PublicCatalogOptions;
use serde::Serialize;

use crate::content_access::climb_lists_visible_sql;
use crate::executor::{DbError, DbExecutor, DbParam, DbRow};
use crate::public_catalog::add_catalog_filters;
use crate::sends::MutationError;

const NOW: &str = "cast(unixepoch('subsecond') * 1000 as integer)";
const SUMMARY: &str = "l.id, l.title, l.description, l.updated_at,
    (SELECT COUNT(*) FROM climb_list_items i WHERE i.list_id = l.id) AS climb_count";
const LIVE: &str = "(link.expires_at IS NULL OR link.expires_at > datetime('now'))";
const FROM_LINK: &str = "FROM climb_list_share_links link
    JOIN climb_lists l ON l.id = link.list_id AND l.user_id = link.user_id
    JOIN user u ON u.id = l.user_id";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListSummary {
    pub id: i64,
    pub title: String,
    pub description: Option<String>,
    pub updated_at: i64,
    pub climb_count: i64,
}

fn summary(row: &DbRow) -> Result<ListSummary, DbError> {
    Ok(ListSummary {
        id: row.get_i64("id")?,
        title: row.get_string("title")?,
        description: row.get_opt_string("description")?,
        updated_at: row.get_i64("updated_at")?,
        climb_count: row.get_i64("climb_count")?,
    })
}

#[derive(Clone, Copy)]
pub enum ListAccess<'a> {
    Member { list_id: i64, viewer: &'a str },
    Link(&'a str),
}
impl ListAccess<'_> {
    fn predicate(&self, params: &mut Vec<DbParam>) -> String {
        match self {
            Self::Member { list_id, viewer } => {
                params.push((*list_id).into());
                format!(
                    "l.id = ? AND {}",
                    climb_lists_visible_sql(Some(viewer), "l.user_id", params)
                )
            }
            Self::Link(token) => {
                params.push((*token).into());
                format!(
                    "EXISTS (SELECT 1 FROM climb_list_share_links link JOIN user u ON u.id = link.user_id WHERE link.token = ? AND link.user_id = l.user_id AND link.list_id = l.id AND u.is_private = 0 AND {LIVE})"
                )
            }
        }
    }
}

/// Return the HTML title only when this viewer may read the requested list or index.
pub async fn member_page_title<D: DbExecutor>(
    db: &D,
    owner: &str,
    viewer: &str,
    list_id: Option<i64>,
) -> Result<Option<String>, DbError> {
    let mut params = vec![owner.into()];
    let visible = climb_lists_visible_sql(Some(viewer), "u.id", &mut params);
    let sql = if let Some(id) = list_id {
        params.push(id.into());
        format!(
            "SELECT l.title || ' · ' || u.name AS title FROM user u
            JOIN climb_lists l ON l.user_id = u.id WHERE u.id = ? AND {visible} AND l.id = ?"
        )
    } else {
        format!("SELECT u.name || ' · Lists' AS title FROM user u WHERE u.id = ? AND {visible}")
    };
    db.query_one(&sql, &params)
        .await?
        .map(|row| row.get_string("title"))
        .transpose()
}

pub async fn lists<D: DbExecutor>(
    db: &D,
    owner: &str,
    viewer: &str,
) -> Result<Vec<ListSummary>, DbError> {
    let mut params = vec![owner.into()];
    let access = climb_lists_visible_sql(Some(viewer), "l.user_id", &mut params);
    db.query_all(&format!("SELECT {SUMMARY} FROM climb_lists l WHERE l.user_id = ? AND {access} ORDER BY l.updated_at DESC, l.id DESC"), &params)
        .await?.iter().map(summary).collect()
}

pub async fn list<D: DbExecutor>(
    db: &D,
    owner: &str,
    access: ListAccess<'_>,
) -> Result<Option<ListSummary>, DbError> {
    let mut params = vec![owner.into()];
    let access = access.predicate(&mut params);
    db.query_one(
        &format!("SELECT {SUMMARY} FROM climb_lists l WHERE l.user_id = ? AND {access}"),
        &params,
    )
    .await?
    .as_ref()
    .map(summary)
    .transpose()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListItem {
    pub climb_id: i64,
    pub name: String,
    #[serde(rename = "type")]
    pub climb_type: String,
    pub grade: Option<i64>,
    pub area_id: i64,
    pub area_name: String,
    pub broken_on: Option<String>,
    pub position: i64,
    pub added_at: i64,
    pub sent: Option<bool>,
}

pub async fn items<D: DbExecutor>(
    db: &D,
    access: ListAccess<'_>,
    viewer: Option<&str>,
    options: &PublicCatalogOptions,
    sort: &str,
) -> Result<Vec<ListItem>, DbError> {
    let mut params = vec![];
    let mut prefix = String::new();
    let mut area_join = "";
    if matches!(sort, "area_asc" | "area_desc") {
        let authorized = access.predicate(&mut params);
        prefix = format!("WITH RECURSIVE list_areas(id) AS (
            SELECT DISTINCT c.area_id FROM climb_lists l JOIN climb_list_items i ON i.list_id = l.id
            JOIN climbs c ON c.id = i.climb_id WHERE {authorized}
        ), walk(id,parent,path) AS (
            SELECT a.id,a.parent_id,a.name FROM areas a JOIN list_areas la ON la.id = a.id
            UNION ALL SELECT walk.id,p.parent_id,p.name || char(31) || walk.path FROM walk JOIN areas p ON p.id = walk.parent
        )");
        area_join = "LEFT JOIN walk ON walk.id = a.id AND walk.parent IS NULL";
    }
    let order = match sort {
        "position_desc" => "i.position DESC",
        "grade_asc" => "(climbs.type <> 'boulder'), (climbs.grade IS NULL), climbs.grade",
        "grade_desc" => "(climbs.type <> 'boulder'), climbs.grade DESC",
        "area_asc" => "walk.path COLLATE NOCASE ASC",
        "area_desc" => "walk.path COLLATE NOCASE DESC",
        "name_asc" => "climbs.name COLLATE NOCASE ASC",
        "name_desc" => "climbs.name COLLATE NOCASE DESC",
        "added_asc" => "i.added_at ASC",
        "added_desc" => "i.added_at DESC",
        _ => "i.position ASC",
    };
    let sent = if let Some(reader) = viewer {
        params.push(reader.into());
        "EXISTS (SELECT 1 FROM sends s WHERE s.user_id = ? AND s.climb_id = climbs.id)"
    } else {
        "NULL"
    };
    let mut conditions = vec![access.predicate(&mut params)];
    add_catalog_filters(options, &mut params, &mut conditions);
    let sql = format!("{prefix} SELECT climbs.id AS climb_id, climbs.name, climbs.type, climbs.grade, climbs.broken_on,
        a.id AS area_id, a.name AS area_name, i.position, i.added_at, {sent} AS sent
        FROM climb_lists l JOIN climb_list_items i ON i.list_id = l.id JOIN climbs ON climbs.id = i.climb_id
        JOIN areas a ON a.id = climbs.area_id {area_join} WHERE {} ORDER BY {order}, i.position, i.added_at, climbs.id",conditions.join(" AND "));
    let name_filter = fold_climb_name(
        options
            .name
            .trim()
            .chars()
            .take(100)
            .collect::<String>()
            .trim(),
    );
    let mut items = vec![];
    for row in db.query_all(&sql, &params).await? {
        let name = row.get_string("name")?;
        if !name_filter.is_empty() && !fold_climb_name(&name).contains(&name_filter) {
            continue;
        }
        items.push(ListItem {
            name,
            climb_id: row.get_i64("climb_id")?,
            climb_type: row.get_string("type")?,
            grade: row.get_opt_i64("grade")?,
            area_id: row.get_i64("area_id")?,
            area_name: row.get_string("area_name")?,
            broken_on: row.get_opt_string("broken_on")?,
            position: row.get_i64("position")?,
            added_at: row.get_i64("added_at")?,
            sent: row.get_opt_i64("sent")?.map(|n| n != 0),
        });
    }
    Ok(items)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareLink {
    pub token: String,
    pub expires_at: Option<String>,
}
fn share_link(row: &DbRow) -> Result<ShareLink, DbError> {
    Ok(ShareLink {
        token: row.get_string("token")?,
        expires_at: row.get_opt_string("expires_at")?,
    })
}

pub async fn owner_share<D: DbExecutor>(
    db: &D,
    owner: &str,
    id: i64,
) -> Result<Option<ShareLink>, DbError> {
    let sql = format!(
        "SELECT token, expires_at FROM climb_list_share_links link
        WHERE user_id = ? AND list_id = ? AND {LIVE}"
    );
    db.query_one(&sql, &[owner.into(), id.into()])
        .await?
        .as_ref()
        .map(share_link)
        .transpose()
}

pub struct SharedList {
    pub owner_id: String,
    pub owner_name: String,
    pub owner_image: Option<String>,
    pub list: ListSummary,
    pub live: bool,
}

pub async fn shared_list<D: DbExecutor>(
    db: &D,
    token: &str,
) -> Result<Option<SharedList>, DbError> {
    let sql = format!(
        "SELECT {SUMMARY}, u.id AS owner, u.name, u.image, {LIVE} AS live
        {FROM_LINK} WHERE link.token = ? AND u.is_private = 0"
    );
    let Some(row) = db.query_one(&sql, &[token.into()]).await? else {
        return Ok(None);
    };
    Ok(Some(SharedList {
        owner_id: row.get_string("owner")?,
        owner_name: row.get_string("name")?,
        owner_image: row.get_opt_string("image")?,
        list: summary(&row)?,
        live: row.get_bool("live")?,
    }))
}

fn invalid(msg: &str) -> MutationError {
    MutationError::Validation(msg.to_owned())
}
type Statement = (String, Vec<DbParam>);

#[derive(Serialize)]
pub struct SavedList {
    pub id: i64,
    pub title: String,
}

/// The guard enforces both the 100-list limit and source access inside the
/// transaction. A rejected insert writes a NULL title and rolls the batch back.
async fn insert_with_items<D: DbExecutor>(
    db: &D,
    owner: &str,
    input: &ListInput,
    source_guard: &str,
    source_params: Vec<DbParam>,
    insert_items: Option<Statement>,
    unavailable: &str,
) -> Result<SavedList, MutationError> {
    let mut params = vec![owner.into(), owner.into()];
    params.extend(source_params);
    params.push(input.title.clone().into());
    params.push(input.description.clone().into());
    let mut statements = vec![(format!("INSERT INTO climb_lists(user_id,title,description)
        SELECT ?, CASE WHEN (SELECT COUNT(*) FROM climb_lists WHERE user_id = ?) < {LIST_LIMIT} AND {source_guard} THEN ? END, ? RETURNING id,title"), params)];
    statements.extend(insert_items);
    let rows = match db.batch_rows(statements).await {
        Ok(rows) => rows,
        Err(err)
            if err
                .to_string()
                .contains("NOT NULL constraint failed: climb_lists.title") =>
        {
            let sql = format!(
                "SELECT COUNT(*) < {LIST_LIMIT} AS room FROM climb_lists WHERE user_id = ?"
            );
            let row = db
                .query_one(&sql, &[owner.into()])
                .await?
                .ok_or(DbError::Column("room"))?;
            return Err(invalid(if row.get_bool("room")? {
                unavailable
            } else {
                TOO_MANY_LISTS
            }));
        }
        Err(err) => return Err(err.into()),
    };
    let row = rows
        .first()
        .and_then(|r| r.first())
        .ok_or(DbError::Column("id"))?;
    Ok(SavedList {
        id: row.get_i64("id")?,
        title: row.get_string("title")?,
    })
}

pub async fn create<D: DbExecutor>(
    db: &D,
    owner: &str,
    input: &ListInput,
    climb: Option<i64>,
) -> Result<SavedList, MutationError> {
    match climb {
        Some(id) => {
            let append = (
                "INSERT INTO climb_list_items(list_id, climb_id, position)
                VALUES(last_insert_rowid(), ?, 1)"
                    .to_owned(),
                vec![id.into()],
            );
            insert_with_items(
                db,
                owner,
                input,
                "EXISTS (SELECT 1 FROM climbs WHERE id = ?)",
                vec![id.into()],
                Some(append),
                "Climb not found",
            )
            .await
        }
        None => insert_with_items(db, owner, input, "1", vec![], None, TOO_MANY_LISTS).await,
    }
}

pub async fn copy<D: DbExecutor>(
    db: &D,
    owner: &str,
    input: &ListInput,
    source: ListAccess<'_>,
) -> Result<SavedList, MutationError> {
    let mut params = vec![];
    let access = source.predicate(&mut params);
    let source_id = format!("(SELECT l.id FROM climb_lists l WHERE {access})");
    if db
        .query_one(
            &format!("SELECT l.id FROM climb_lists l WHERE {access}"),
            &params,
        )
        .await?
        .is_none()
    {
        return Err(invalid(LIST_UNAVAILABLE));
    }
    let mut item_params = vec![owner.into()];
    item_params.extend(params.iter().cloned());
    let copy_items = format!(
        "INSERT INTO climb_list_items(list_id, climb_id, position)
        SELECT (SELECT MAX(id) FROM climb_lists WHERE user_id = ?), climb_id, position
        FROM climb_list_items WHERE list_id = {source_id}"
    );
    insert_with_items(
        db,
        owner,
        input,
        &format!("{source_id} IS NOT NULL"),
        params,
        Some((copy_items, item_params)),
        LIST_UNAVAILABLE,
    )
    .await
}

pub async fn update<D: DbExecutor>(
    db: &D,
    owner: &str,
    id: i64,
    input: &ListInput,
) -> Result<(), MutationError> {
    let sql = format!(
        "UPDATE climb_lists SET title=?, description=?, updated_at={NOW}
        WHERE id=? AND user_id=?"
    );
    let changed = db
        .execute(
            &sql,
            &[
                input.title.clone().into(),
                input.description.clone().into(),
                id.into(),
                owner.into(),
            ],
        )
        .await?;
    if changed == 0 {
        return Err(invalid(LIST_MISSING));
    }
    Ok(())
}

pub async fn delete<D: DbExecutor>(db: &D, owner: &str, id: i64) -> Result<(), DbError> {
    db.execute(
        "DELETE FROM climb_lists WHERE id = ? AND user_id = ?",
        &[id.into(), owner.into()],
    )
    .await?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemChange {
    pub changed: bool,
    pub climb_count: i64,
}

pub async fn add<D: DbExecutor>(
    db: &D,
    owner: &str,
    id: i64,
    climb: i64,
) -> Result<ItemChange, MutationError> {
    let append = format!("INSERT INTO climb_list_items(list_id, climb_id, position)
        SELECT l.id, c.id, COALESCE((SELECT MAX(position) FROM climb_list_items WHERE list_id = l.id), 0) + 1
        FROM climb_lists l JOIN climbs c ON c.id = ?
        WHERE l.id = ? AND l.user_id = ?
          AND (SELECT COUNT(*) FROM climb_list_items WHERE list_id = l.id) < {ITEM_LIMIT}
        ON CONFLICT DO NOTHING RETURNING climb_id");
    let touch = format!(
        "UPDATE climb_lists SET updated_at = {NOW}
        WHERE id = ? AND user_id = ? AND changes() > 0"
    );
    let count = "SELECT (SELECT COUNT(*) FROM climb_list_items i WHERE i.list_id = l.id) AS count,
        EXISTS (SELECT 1 FROM climb_list_items i WHERE i.list_id = l.id AND i.climb_id = ?) AS present,
        EXISTS (SELECT 1 FROM climbs WHERE id = ?) AS exists_climb
        FROM climb_lists l WHERE l.id = ? AND l.user_id = ?";
    let rows = db
        .batch_rows(vec![
            (append, vec![climb.into(), id.into(), owner.into()]),
            (touch, vec![id.into(), owner.into()]),
            (
                count.to_owned(),
                vec![climb.into(), climb.into(), id.into(), owner.into()],
            ),
        ])
        .await?;
    let state = rows
        .last()
        .and_then(|r| r.first())
        .ok_or_else(|| invalid(LIST_MISSING))?;
    let changed = rows.first().is_some_and(|r| !r.is_empty());
    if !state.get_bool("present")? {
        return Err(invalid(if state.get_bool("exists_climb")? {
            LIST_FULL
        } else {
            "Climb not found"
        }));
    }
    Ok(ItemChange {
        changed,
        climb_count: state.get_i64("count")?,
    })
}

pub async fn save_edits<D: DbExecutor>(
    db: &D,
    owner: &str,
    id: i64,
    ids: &[i64],
) -> Result<(), MutationError> {
    if ids.len() > ITEM_LIMIT {
        return Err(invalid(LIST_FULL));
    }
    let mut seen = std::collections::HashSet::new();
    if ids.iter().any(|i| *i <= 0 || !seen.insert(i)) {
        return Err(invalid(betabook_domain::climb_lists::INVALID_EDIT));
    }
    let order = serde_json::to_string(ids).map_err(DbError::from)?;
    let owned = "EXISTS (SELECT 1 FROM climb_lists WHERE id=? AND user_id=?)";
    let insert = format!("INSERT INTO climb_list_items(list_id, climb_id, position)
        SELECT ?, c.id, CAST(o.key AS INTEGER) + 1 FROM json_each(?) o JOIN climbs c ON c.id = o.value
        WHERE {owned} ON CONFLICT DO NOTHING");
    let remove = format!(
        "DELETE FROM climb_list_items WHERE list_id = ?
        AND climb_id NOT IN (SELECT value FROM json_each(?)) AND {owned}"
    );
    let reorder = format!(
        "UPDATE climb_list_items SET position = ranked.pos FROM (
        SELECT o.value AS climb_id, ROW_NUMBER() OVER (ORDER BY CAST(o.key AS INTEGER)) AS pos
        FROM json_each(?) o JOIN climb_list_items i ON i.list_id = ? AND i.climb_id = o.value
    ) AS ranked
    WHERE list_id = ? AND ranked.climb_id = climb_list_items.climb_id AND {owned}"
    );
    let touch = format!(
        "UPDATE climb_lists SET updated_at = {NOW} WHERE id = ? AND user_id = ? RETURNING id"
    );
    let rows = db
        .batch_rows(vec![
            (
                insert,
                vec![id.into(), order.clone().into(), id.into(), owner.into()],
            ),
            (
                remove,
                vec![id.into(), order.clone().into(), id.into(), owner.into()],
            ),
            (
                reorder,
                vec![order.into(), id.into(), id.into(), id.into(), owner.into()],
            ),
            (touch, vec![id.into(), owner.into()]),
        ])
        .await?;
    if rows.last().is_none_or(|r| r.is_empty()) {
        return Err(invalid(LIST_MISSING));
    }
    Ok(())
}

pub async fn share<D: DbExecutor>(
    db: &D,
    owner: &str,
    id: i64,
    modifier: Option<&str>,
) -> Result<ShareLink, MutationError> {
    let publish = "INSERT INTO climb_list_share_links(user_id, list_id, expires_at)
        SELECT l.user_id, l.id, datetime('now', ?) FROM climb_lists l JOIN user u ON u.id = l.user_id
        WHERE l.user_id = ? AND l.id = ? AND u.is_private = 0
        ON CONFLICT(user_id, list_id) DO UPDATE SET
          token = CASE WHEN climb_list_share_links.expires_at <= datetime('now')
                       THEN lower(hex(randomblob(16))) ELSE climb_list_share_links.token END,
          expires_at = excluded.expires_at
        RETURNING token, expires_at";
    let row = db
        .query_one(publish, &[modifier.into(), owner.into(), id.into()])
        .await?;
    if let Some(row) = row {
        return Ok(share_link(&row)?);
    }
    if db
        .query_one(
            "SELECT id FROM climb_lists WHERE id=? AND user_id=?",
            &[id.into(), owner.into()],
        )
        .await?
        .is_some()
    {
        return Err(invalid(
            "Sharing is off while your profile is private — change it in Account settings.",
        ));
    }
    Err(invalid(LIST_MISSING))
}

pub async fn unshare<D: DbExecutor>(db: &D, owner: &str, id: i64) -> Result<(), DbError> {
    db.execute(
        "DELETE FROM climb_list_share_links WHERE list_id=? AND user_id=?",
        &[id.into(), owner.into()],
    )
    .await?;
    Ok(())
}
