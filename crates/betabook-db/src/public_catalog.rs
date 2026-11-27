use std::collections::{BTreeMap, BTreeSet};

use betabook_domain::grades::ClimbType;
use betabook_domain::public_catalog::{
    AreaBreadcrumbItem, MAX_RATING, PublicArea, PublicAreaDetails, PublicAreaResult,
    PublicAreasPage, PublicCatalogOptions, PublicClimb, PublicClimbSend, PublicClimbsPage,
    SubtreeClimbsSort, public_has_next_page,
};

use crate::executor::{DbError, DbExecutor, DbParam};
use crate::fts::{discipline_grade_conditions, to_fts_prefix_query};

const PUBLIC_CLIMB_SENDS_LIMIT: i64 = 10;
pub const LARGE_AREA_SUBTREE_AREAS: i64 = 1000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SitemapEntityRow {
    pub id: i64,
    pub name: String,
}

fn area_trail_sql() -> &'static str {
    "WITH RECURSIVE chain(id, depth) AS (
      SELECT ?, 0
      UNION ALL
      SELECT areas.parent_id, chain.depth + 1
      FROM areas JOIN chain ON chain.id = areas.id
      WHERE areas.parent_id IS NOT NULL
    )
    SELECT areas.id AS id, areas.parent_id AS parentId, areas.name AS name,
           areas.description AS description
    FROM areas JOIN chain ON chain.id = areas.id
    ORDER BY chain.depth DESC"
}

fn ancestor_chain_cte(targets_name: &str) -> String {
    format!(
        "ancestor_chain(area_id, ancestor_id, dist) AS (
      SELECT {targets_name}.area_id, areas.parent_id, 1
      FROM {targets_name}
      JOIN areas ON areas.id = {targets_name}.area_id
      WHERE areas.parent_id IS NOT NULL
      UNION ALL
      SELECT ancestor_chain.area_id, areas.parent_id, ancestor_chain.dist + 1
      FROM ancestor_chain
      JOIN areas ON areas.id = ancestor_chain.ancestor_id
      WHERE areas.parent_id IS NOT NULL
    )"
    )
}

fn ancestor_path_sql(area_id_expr: &str) -> String {
    format!(
        "(
    SELECT GROUP_CONCAT(name, ' > ') FROM (
      SELECT ancestor.name AS name
      FROM ancestor_chain
      JOIN areas ancestor ON ancestor.id = ancestor_chain.ancestor_id
      WHERE ancestor_chain.area_id = {area_id_expr}
      ORDER BY ancestor_chain.dist DESC
    )
  )"
    )
}

fn in_area_subtree_sql(column: &str) -> String {
    format!(
        "{column} IN (
    WITH RECURSIVE subtree(id) AS (
      SELECT ?
      UNION ALL
      SELECT a.id FROM areas a JOIN subtree s ON a.parent_id = s.id
    ) SELECT id FROM subtree)"
    )
}

fn area_name_condition(area_name: Option<&str>, params: &mut Vec<DbParam>) -> Option<String> {
    let raw = area_name.filter(|s| !s.is_empty())?;
    let query = to_fts_prefix_query(raw);
    if query.is_empty() {
        return Some("0".to_string());
    }
    params.push(DbParam::Text(query));
    Some(
        "areas.id IN (
    WITH RECURSIVE matched(id) AS (
      SELECT matched_area.id FROM areas matched_area
      JOIN areas_fts ON areas_fts.rowid = matched_area.id
      WHERE areas_fts MATCH ?
      UNION
      SELECT child.id FROM areas child JOIN matched ON child.parent_id = matched.id
    )
    SELECT id FROM matched
  )"
        .to_string(),
    )
}

fn send_comment_visible_for_public_sql(author_expr: &str) -> String {
    format!(
        "EXISTS (
    SELECT 1 FROM user content_owner
    WHERE content_owner.id = {author_expr}
      AND content_owner.is_private = 0
      AND content_owner.send_comment_visibility = 'everyone'
  )"
    )
}

pub async fn get_public_area<D: DbExecutor>(
    db: &D,
    id: i64,
) -> Result<Option<PublicAreaDetails>, DbError> {
    let Some(row) = db
        .query_one(
            "SELECT id, name, parent_id AS parentId, description FROM areas WHERE id = ?",
            &[DbParam::Int(id)],
        )
        .await?
    else {
        return Ok(None);
    };
    Ok(Some(PublicAreaDetails {
        id: row.get_i64("id")?,
        name: row.get_string("name")?,
        parent_id: row.get_opt_i64("parentId")?,
        description: row.get_opt_string("description")?,
    }))
}

pub async fn get_public_climb<D: DbExecutor>(
    db: &D,
    id: i64,
) -> Result<Option<PublicClimb>, DbError> {
    let Some(row) = db
        .query_one(
            "SELECT climbs.id, climbs.name, climbs.area_id AS areaId, areas.name AS areaName,
                    climbs.type, climbs.grade, climbs.description, climbs.broken_on AS brokenOn,
                    climbs.avg_rating AS avgRating, climbs.send_count AS sendCount
             FROM climbs
             INNER JOIN areas ON areas.id = climbs.area_id
             WHERE climbs.id = ?",
            &[DbParam::Int(id)],
        )
        .await?
    else {
        return Ok(None);
    };
    let raw_type = row.get_string("type")?;
    let climb_type = ClimbType::parse(&raw_type).ok_or(DbError::Column("type"))?;
    Ok(Some(PublicClimb {
        id: row.get_i64("id")?,
        name: row.get_string("name")?,
        area_id: row.get_i64("areaId")?,
        area_name: row.get_string("areaName")?,
        climb_type,
        grade: row.get_opt_i64("grade")?,
        description: row.get_opt_string("description")?,
        broken_on: row.get_opt_string("brokenOn")?,
        avg_rating: row.get_opt_f64("avgRating")?,
        send_count: row.get_i64("sendCount")?,
    }))
}

pub async fn get_public_area_trail<D: DbExecutor>(
    db: &D,
    id: i64,
) -> Result<Vec<PublicAreaDetails>, DbError> {
    let rows = db.query_all(area_trail_sql(), &[DbParam::Int(id)]).await?;
    rows.into_iter()
        .map(|row| {
            Ok(PublicAreaDetails {
                id: row.get_i64("id")?,
                name: row.get_string("name")?,
                parent_id: row.get_opt_i64("parentId")?,
                description: row.get_opt_string("description")?,
            })
        })
        .collect()
}

pub async fn get_public_subareas<D: DbExecutor>(
    db: &D,
    id: i64,
) -> Result<Vec<PublicArea>, DbError> {
    let rows = db
        .query_all(
            "SELECT id, name, parent_id AS parentId FROM areas WHERE parent_id = ?",
            &[DbParam::Int(id)],
        )
        .await?;
    let mut areas: Vec<PublicArea> = rows
        .into_iter()
        .map(|row| {
            Ok(PublicArea {
                id: row.get_i64("id")?,
                name: row.get_string("name")?,
                parent_id: row.get_opt_i64("parentId")?,
            })
        })
        .collect::<Result<_, DbError>>()?;
    areas.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| a.name.cmp(&b.name))
            .then_with(|| a.id.cmp(&b.id))
    });
    Ok(areas)
}

pub async fn resolve_public_subarea<D: DbExecutor>(
    db: &D,
    area: &PublicArea,
    candidate: Option<i64>,
) -> Result<PublicArea, DbError> {
    let Some(candidate_id) = candidate else {
        return Ok(area.clone());
    };
    if candidate_id == area.id {
        return Ok(area.clone());
    }
    let trail = get_public_area_trail(db, candidate_id).await?;
    if trail.iter().any(|ancestor| ancestor.id == area.id)
        && let Some(last) = trail.last()
    {
        return Ok(PublicArea {
            id: last.id,
            name: last.name.clone(),
            parent_id: last.parent_id,
        });
    }
    Ok(area.clone())
}

pub async fn get_public_sends_for_climb<D: DbExecutor>(
    db: &D,
    climb_id: i64,
) -> Result<Vec<PublicClimbSend>, DbError> {
    let named = send_comment_visible_for_public_sql("sends.user_id");
    let sql = format!(
        "SELECT
      CASE WHEN {named} THEN user.name END AS userName,
      CASE WHEN {named} THEN user.image END AS userImage,
      CASE WHEN {named} THEN sends.date_sent ELSE substr(sends.date_sent, 1, 7) END AS dateSent,
      sends.ascent_style AS ascentStyle,
      sends.rating AS rating,
      sends.suggested_grade AS suggestedGrade,
      sends.grade_feel AS gradeFeel,
      CASE WHEN {named} THEN sends.comment END AS comment,
      CASE WHEN {named} THEN sends.videos END AS videos
    FROM sends
    JOIN user ON user.id = sends.user_id
    WHERE sends.climb_id = ?
    ORDER BY sends.date_sent DESC, sends.id ASC
    LIMIT {PUBLIC_CLIMB_SENDS_LIMIT}"
    );

    let rows = db.query_all(&sql, &[DbParam::Int(climb_id)]).await?;
    rows.into_iter()
        .map(|row| {
            let videos_raw = row.get_opt_string("videos")?;
            let videos = match videos_raw {
                Some(raw) => Some(serde_json::from_str::<Vec<String>>(&raw)?),
                None => None,
            };
            Ok(PublicClimbSend {
                user_name: row.get_opt_string("userName")?,
                user_image: row.get_opt_string("userImage")?,
                date_sent: row.get_opt_string("dateSent")?,
                ascent_style: row.get_string("ascentStyle")?,
                rating: row.get_opt_i64("rating")?,
                suggested_grade: row.get_opt_i64("suggestedGrade")?,
                grade_feel: row.get_string("gradeFeel")?,
                comment: row.get_opt_string("comment")?,
                videos,
            })
        })
        .collect()
}

pub async fn get_area_breadcrumbs<D: DbExecutor>(
    db: &D,
    area_ids: &[i64],
    depth: i64,
) -> Result<BTreeMap<i64, Vec<AreaBreadcrumbItem>>, DbError> {
    let distinct: Vec<i64> = area_ids
        .iter()
        .copied()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    if distinct.is_empty() {
        return Ok(BTreeMap::new());
    }
    let ids_json = serde_json::to_string(&distinct)?;
    let rows = db
        .query_all(
            "WITH RECURSIVE requested(id) AS (
      SELECT CAST(value AS INTEGER) FROM json_each(?)
    ), chain(target_id, ancestor_id, dist) AS (
      SELECT areas.id, areas.parent_id, 1 FROM requested
      JOIN areas ON areas.id = requested.id
      WHERE areas.parent_id IS NOT NULL
      UNION ALL
      SELECT chain.target_id, areas.parent_id, chain.dist + 1
      FROM chain
      JOIN areas ON areas.id = chain.ancestor_id
      WHERE areas.parent_id IS NOT NULL AND chain.dist < ?
    )
    SELECT target.id AS targetId, ancestor.id AS ancestorId, ancestor.name AS ancestorName
    FROM requested
    JOIN areas target ON target.id = requested.id
    LEFT JOIN chain ON chain.target_id = target.id
    LEFT JOIN areas ancestor ON ancestor.id = chain.ancestor_id
    ORDER BY target.id ASC, chain.dist DESC",
            &[DbParam::Text(ids_json), DbParam::Int(depth)],
        )
        .await?;

    let mut breadcrumbs: BTreeMap<i64, Vec<AreaBreadcrumbItem>> = BTreeMap::new();
    for row in rows {
        let target_id = row.get_i64("targetId")?;
        let entry = breadcrumbs.entry(target_id).or_default();
        if let (Some(ancestor_id), Some(ancestor_name)) = (
            row.get_opt_i64("ancestorId")?,
            row.get_opt_string("ancestorName")?,
        ) {
            entry.push(AreaBreadcrumbItem {
                id: ancestor_id,
                name: ancestor_name,
            });
        }
    }
    Ok(breadcrumbs)
}

pub async fn search_public_areas<D: DbExecutor>(
    db: &D,
    options: &PublicCatalogOptions,
) -> Result<PublicAreasPage, DbError> {
    let query = to_fts_prefix_query(&options.name);
    let Some(offset) = options.offset else {
        return Ok(PublicAreasPage {
            areas: Vec::new(),
            has_next_page: false,
        });
    };
    if query.is_empty() {
        return Ok(PublicAreasPage {
            areas: Vec::new(),
            has_next_page: false,
        });
    }

    let mut params = vec![DbParam::Text(query)];
    let scope = if let Some(area_id) = options.area_id {
        params.push(DbParam::Int(area_id));
        Some(in_area_subtree_sql("areas.id"))
    } else {
        area_name_condition(options.area_name.as_deref(), &mut params)
    };
    let scope_sql = scope.map(|s| format!("AND {s}")).unwrap_or_default();
    let dir = if options.sort == SubtreeClimbsSort::NameDesc {
        "DESC"
    } else {
        "ASC"
    };
    let order_by = format!("areas.name {dir}, areas.id");
    params.push(DbParam::Int((options.page_size + 1) as i64));
    params.push(DbParam::Int(offset as i64));

    let sql = format!(
        "WITH RECURSIVE page_areas(area_id) AS (
      SELECT areas.id FROM areas
      WHERE areas.id IN (SELECT rowid FROM areas_fts WHERE areas_fts MATCH ?)
      {scope_sql}
      ORDER BY {order_by}
      LIMIT ? OFFSET ?
    ), {}
    SELECT areas.id, areas.name, areas.parent_id AS parentId, areas.description,
      {} AS ancestorPath
    FROM page_areas JOIN areas ON areas.id = page_areas.area_id
    ORDER BY {order_by}",
        ancestor_chain_cte("page_areas"),
        ancestor_path_sql("areas.id")
    );

    let rows = db.query_all(&sql, &params).await?;
    let has_next_page = public_has_next_page(rows.len(), options);
    let areas = rows
        .into_iter()
        .take(options.page_size)
        .map(|row| {
            Ok(PublicAreaResult {
                id: row.get_i64("id")?,
                name: row.get_string("name")?,
                parent_id: row.get_opt_i64("parentId")?,
                description: row.get_opt_string("description")?,
                ancestor_path: row.get_opt_string("ancestorPath")?,
            })
        })
        .collect::<Result<_, DbError>>()?;

    Ok(PublicAreasPage {
        areas,
        has_next_page,
    })
}

async fn is_large_subtree<D: DbExecutor>(db: &D, area_id: i64) -> Result<bool, DbError> {
    let row = db
        .query_one(
            "SELECT (SELECT count(*) FROM (
      WITH RECURSIVE subtree(id) AS (
        SELECT ?
        UNION ALL
        SELECT a.id FROM areas a JOIN subtree s ON a.parent_id = s.id
      )
      SELECT id FROM subtree LIMIT ?
    )) >= ? AS large",
            &[
                DbParam::Int(area_id),
                DbParam::Int(LARGE_AREA_SUBTREE_AREAS),
                DbParam::Int(LARGE_AREA_SUBTREE_AREAS),
            ],
        )
        .await?;
    Ok(row.and_then(|r| r.get_opt_i64("large").ok().flatten()) == Some(1))
}

fn sort_index_name(sort: SubtreeClimbsSort) -> &'static str {
    match sort {
        SubtreeClimbsSort::NameAsc => "climbs_name_asc_idx",
        SubtreeClimbsSort::NameDesc => "climbs_name_desc_idx",
        SubtreeClimbsSort::GradeAsc => "climbs_grade_asc_idx",
        SubtreeClimbsSort::GradeDesc => "climbs_grade_desc_idx",
        SubtreeClimbsSort::RatingAsc => "climbs_avg_rating_asc_idx",
        SubtreeClimbsSort::RatingDesc => "climbs_avg_rating_desc_idx",
        SubtreeClimbsSort::AscentsAsc => "climbs_send_count_asc_idx",
        SubtreeClimbsSort::AscentsDesc => "climbs_send_count_desc_idx",
    }
}

fn sort_primary_order(sort: SubtreeClimbsSort) -> &'static str {
    match sort {
        SubtreeClimbsSort::NameAsc => "climbs.name ASC",
        SubtreeClimbsSort::NameDesc => "climbs.name DESC",
        SubtreeClimbsSort::GradeAsc => "(climbs.grade IS NULL), climbs.grade ASC",
        SubtreeClimbsSort::GradeDesc => "climbs.grade DESC",
        SubtreeClimbsSort::RatingAsc => "(climbs.avg_rating IS NULL), climbs.avg_rating ASC",
        SubtreeClimbsSort::RatingDesc => "climbs.avg_rating DESC",
        SubtreeClimbsSort::AscentsAsc => "climbs.send_count ASC",
        SubtreeClimbsSort::AscentsDesc => "climbs.send_count DESC",
    }
}

fn sort_tie_break(sort: SubtreeClimbsSort) -> &'static str {
    match sort {
        SubtreeClimbsSort::NameAsc | SubtreeClimbsSort::NameDesc => {
            "climbs.grade DESC, climbs.avg_rating DESC, climbs.send_count DESC"
        }
        SubtreeClimbsSort::GradeAsc | SubtreeClimbsSort::GradeDesc => {
            "climbs.name ASC, climbs.avg_rating DESC, climbs.send_count DESC"
        }
        SubtreeClimbsSort::RatingAsc | SubtreeClimbsSort::RatingDesc => {
            "climbs.name ASC, climbs.grade DESC, climbs.send_count DESC"
        }
        SubtreeClimbsSort::AscentsAsc | SubtreeClimbsSort::AscentsDesc => {
            "climbs.name ASC, climbs.grade DESC, climbs.avg_rating DESC"
        }
    }
}

pub async fn search_public_climbs<D: DbExecutor>(
    db: &D,
    options: &PublicCatalogOptions,
) -> Result<PublicClimbsPage, DbError> {
    let empty = || PublicClimbsPage {
        climbs: Vec::new(),
        area_breadcrumbs: BTreeMap::new(),
        has_next_page: false,
    };
    let Some(offset) = options.offset else {
        return Ok(empty());
    };

    let mut conditions = Vec::new();
    let mut params = Vec::new();

    if !options.name.is_empty() {
        let query = to_fts_prefix_query(&options.name);
        if query.is_empty() {
            return Ok(empty());
        }
        params.push(DbParam::Text(query));
        conditions.push(
            "climbs.id IN (SELECT rowid FROM climbs_fts WHERE climbs_fts MATCH ?)".to_string(),
        );
    }

    if let Some(area_id) = options.area_id {
        params.push(DbParam::Int(area_id));
        conditions.push(in_area_subtree_sql("climbs.area_id"));
    } else if let Some(area_cond) = area_name_condition(options.area_name.as_deref(), &mut params) {
        conditions.push(area_cond);
    }

    let discipline_clauses = discipline_grade_conditions(&options.filter, &mut params);
    if !discipline_clauses.is_empty() {
        conditions.push(format!("({})", discipline_clauses.join(" OR ")));
    }

    let [rating_min, rating_max] = options.rating_range;
    if rating_min > 1 {
        params.push(DbParam::Int(rating_min));
        conditions.push("climbs.avg_rating >= ?".to_string());
    }
    if rating_max > 0 && rating_max < MAX_RATING {
        params.push(DbParam::Int(rating_max));
        conditions.push("climbs.avg_rating <= ?".to_string());
    }
    if options.min_ascents > 0 {
        params.push(DbParam::Int(options.min_ascents));
        conditions.push("climbs.send_count >= ?".to_string());
    }

    let browse = options.name.is_empty()
        && options.area_name.as_deref().unwrap_or("").is_empty()
        && match options.area_id {
            None => true,
            Some(id) => is_large_subtree(db, id).await?,
        };

    let source = if browse {
        format!("climbs INDEXED BY {}", sort_index_name(options.sort))
    } else {
        "climbs".to_string()
    };
    let order_by = if browse {
        format!("{}, climbs.id", sort_primary_order(options.sort))
    } else {
        format!(
            "{}, {}, climbs.id",
            sort_primary_order(options.sort),
            sort_tie_break(options.sort)
        )
    };
    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    params.push(DbParam::Int((options.page_size + 1) as i64));
    params.push(DbParam::Int(offset as i64));

    let sql = format!(
        "SELECT climbs.id, climbs.name, climbs.area_id AS areaId, areas.name AS areaName,
      climbs.type, climbs.grade, climbs.description,
      climbs.avg_rating AS avgRating, climbs.send_count AS sendCount,
      climbs.broken_on AS brokenOn
    FROM {source} JOIN areas ON areas.id = climbs.area_id
    {where_clause}
    ORDER BY {order_by}
    LIMIT ? OFFSET ?"
    );

    let rows = db.query_all(&sql, &params).await?;
    let has_next_page = public_has_next_page(rows.len(), options);
    let climbs: Vec<PublicClimb> = rows
        .into_iter()
        .take(options.page_size)
        .map(|row| {
            let raw_type = row.get_string("type")?;
            let climb_type = ClimbType::parse(&raw_type).ok_or(DbError::Column("type"))?;
            Ok(PublicClimb {
                id: row.get_i64("id")?,
                name: row.get_string("name")?,
                area_id: row.get_i64("areaId")?,
                area_name: row.get_string("areaName")?,
                climb_type,
                grade: row.get_opt_i64("grade")?,
                description: row.get_opt_string("description")?,
                broken_on: row.get_opt_string("brokenOn")?,
                avg_rating: row.get_opt_f64("avgRating")?,
                send_count: row.get_i64("sendCount")?,
            })
        })
        .collect::<Result<_, DbError>>()?;

    let area_ids: Vec<i64> = climbs.iter().map(|c| c.area_id).collect();
    let area_breadcrumbs = get_area_breadcrumbs(db, &area_ids, 2).await?;

    Ok(PublicClimbsPage {
        climbs,
        area_breadcrumbs,
        has_next_page,
    })
}

pub async fn count_areas<D: DbExecutor>(db: &D) -> Result<usize, DbError> {
    let row = db
        .query_one("SELECT count(*) AS cnt FROM areas", &[])
        .await?
        .ok_or(DbError::Column("cnt"))?;
    Ok(row.get_i64("cnt")?.max(0) as usize)
}

pub async fn count_climbs<D: DbExecutor>(db: &D) -> Result<usize, DbError> {
    let row = db
        .query_one("SELECT count(*) AS cnt FROM climbs", &[])
        .await?
        .ok_or(DbError::Column("cnt"))?;
    Ok(row.get_i64("cnt")?.max(0) as usize)
}

pub async fn get_area_sitemap_rows<D: DbExecutor>(
    db: &D,
    limit: usize,
    offset: usize,
) -> Result<Vec<SitemapEntityRow>, DbError> {
    let rows = db
        .query_all(
            "SELECT id, name FROM areas ORDER BY id ASC LIMIT ? OFFSET ?",
            &[DbParam::Int(limit as i64), DbParam::Int(offset as i64)],
        )
        .await?;
    rows.into_iter()
        .map(|row| {
            Ok(SitemapEntityRow {
                id: row.get_i64("id")?,
                name: row.get_string("name")?,
            })
        })
        .collect()
}

pub async fn get_climb_sitemap_rows<D: DbExecutor>(
    db: &D,
    limit: usize,
    offset: usize,
) -> Result<Vec<SitemapEntityRow>, DbError> {
    let rows = db
        .query_all(
            "SELECT id, name FROM climbs ORDER BY id ASC LIMIT ? OFFSET ?",
            &[DbParam::Int(limit as i64), DbParam::Int(offset as i64)],
        )
        .await?;
    rows.into_iter()
        .map(|row| {
            Ok(SitemapEntityRow {
                id: row.get_i64("id")?,
                name: row.get_string("name")?,
            })
        })
        .collect()
}
