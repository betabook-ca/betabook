use betabook_domain::grades::ClimbType;
use betabook_domain::public_catalog::PublicAreaDetails;
use serde::Serialize;

use crate::executor::{DbError, DbExecutor, DbParam};
use crate::fts::to_fts_prefix_query;
use crate::public_catalog::LARGE_AREA_SUBTREE_AREAS;

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AreaWithSubtreeSize {
    pub id: i64,
    pub parent_id: Option<i64>,
    pub name: String,
    pub description: Option<String>,
    pub large_subtree: bool,
}

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClimbRecord {
    pub id: i64,
    pub area_id: i64,
    pub name: String,
    #[serde(rename = "type")]
    pub climb_type: ClimbType,
    pub grade: Option<i64>,
    pub description: Option<String>,
    pub broken_on: Option<String>,
    pub send_count: i64,
    pub rating_sum: i64,
    pub rating_count: i64,
    pub avg_rating: Option<f64>,
}

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GradeHistogramRow {
    #[serde(rename = "type")]
    pub climb_type: ClimbType,
    pub grade: Option<i64>,
    pub count: i64,
}

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClimbListChoice {
    pub id: i64,
    pub title: String,
    pub climb_count: i64,
    pub has_climb: bool,
}

pub fn area_id_condition(area_id: i64, params: &mut Vec<DbParam>) -> String {
    params.push(DbParam::Int(area_id));
    "climbs.area_id IN (
      WITH RECURSIVE subtree(id) AS (
        SELECT ? UNION ALL SELECT a.id FROM areas a JOIN subtree s ON a.parent_id = s.id
      ) SELECT id FROM subtree
    )"
    .to_string()
}

pub fn area_name_condition(area_name: Option<&str>, params: &mut Vec<DbParam>) -> Option<String> {
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
      ) SELECT id FROM matched
    )"
        .to_string(),
    )
}

pub async fn get_area_with_subtree_size<D: DbExecutor>(
    db: &D,
    area_id: i64,
) -> Result<Option<AreaWithSubtreeSize>, DbError> {
    let row = db
        .query_one(
            "SELECT id, parent_id AS parentId, name, description,
                    (SELECT count(*) FROM (
                      WITH RECURSIVE subtree(id) AS (
                        SELECT ? UNION ALL SELECT a.id FROM areas a JOIN subtree s ON a.parent_id = s.id
                      ) SELECT id FROM subtree LIMIT ?
                    )) >= ? AS largeSubtree
             FROM areas WHERE id = ? LIMIT 1",
            &[
                DbParam::Int(area_id),
                DbParam::Int(LARGE_AREA_SUBTREE_AREAS),
                DbParam::Int(LARGE_AREA_SUBTREE_AREAS),
                DbParam::Int(area_id),
            ],
        )
        .await?;
    row.map(|r| {
        Ok(AreaWithSubtreeSize {
            id: r.get_i64("id")?,
            parent_id: r.get_opt_i64("parentId")?,
            name: r.get_string("name")?,
            description: r.get_opt_string("description")?,
            large_subtree: r.get_i64("largeSubtree")? == 1,
        })
    })
    .transpose()
}

pub async fn get_subtree_grade_histogram<D: DbExecutor>(
    db: &D,
    area_id: i64,
) -> Result<Vec<GradeHistogramRow>, DbError> {
    let rows = db
        .query_all(
            "WITH RECURSIVE subtree(id) AS (
              SELECT ? UNION ALL SELECT a.id FROM areas a JOIN subtree s ON a.parent_id = s.id
            )
            SELECT climbs.type AS type, climbs.grade AS grade, COUNT(*) AS count
            FROM climbs
            WHERE climbs.area_id IN (SELECT id FROM subtree)
            GROUP BY climbs.type, climbs.grade",
            &[DbParam::Int(area_id)],
        )
        .await?;
    rows.into_iter()
        .map(|row| {
            let ct = ClimbType::parse(&row.get_string("type")?).ok_or(DbError::Column("type"))?;
            Ok(GradeHistogramRow {
                climb_type: ct,
                grade: row.get_opt_i64("grade")?,
                count: row.get_i64("count")?,
            })
        })
        .collect()
}

pub async fn get_climb_by_id<D: DbExecutor>(
    db: &D,
    climb_id: i64,
) -> Result<Option<ClimbRecord>, DbError> {
    let Some(row) = db
        .query_one(
            "SELECT id, area_id AS areaId, name, type, grade, description, broken_on AS brokenOn,
                    send_count AS sendCount, rating_sum AS ratingSum, rating_count AS ratingCount,
                    avg_rating AS avgRating
             FROM climbs WHERE id = ? LIMIT 1",
            &[DbParam::Int(climb_id)],
        )
        .await?
    else {
        return Ok(None);
    };
    let ct = ClimbType::parse(&row.get_string("type")?).ok_or(DbError::Column("type"))?;
    Ok(Some(ClimbRecord {
        id: row.get_i64("id")?,
        area_id: row.get_i64("areaId")?,
        name: row.get_string("name")?,
        climb_type: ct,
        grade: row.get_opt_i64("grade")?,
        description: row.get_opt_string("description")?,
        broken_on: row.get_opt_string("brokenOn")?,
        send_count: row.get_i64("sendCount")?,
        rating_sum: row.get_i64("ratingSum")?,
        rating_count: row.get_i64("ratingCount")?,
        avg_rating: row.get_opt_f64("avgRating")?,
    }))
}

pub async fn create_area<D: DbExecutor>(
    db: &D,
    parent_id: i64,
    name: &str,
    description: Option<&str>,
) -> Result<i64, DbError> {
    let row = db
        .query_one(
            "INSERT INTO areas (parent_id, name, description) VALUES (?, ?, ?) RETURNING id",
            &[
                DbParam::Int(parent_id),
                DbParam::Text(name.to_string()),
                match description {
                    Some(d) => DbParam::Text(d.to_string()),
                    None => DbParam::Null,
                },
            ],
        )
        .await?
        .ok_or(DbError::Column("id"))?;
    row.get_i64("id")
}

pub async fn update_area_description<D: DbExecutor>(
    db: &D,
    area_id: i64,
    description: Option<&str>,
) -> Result<(), DbError> {
    db.execute(
        "UPDATE areas SET description = ? WHERE id = ?",
        &[
            match description {
                Some(d) => DbParam::Text(d.to_string()),
                None => DbParam::Null,
            },
            DbParam::Int(area_id),
        ],
    )
    .await?;
    Ok(())
}

pub async fn create_climb<D: DbExecutor>(
    db: &D,
    area_id: i64,
    name: &str,
    climb_type: ClimbType,
    grade: i64,
    description: Option<&str>,
) -> Result<i64, DbError> {
    let row = db
        .query_one(
            "INSERT INTO climbs (area_id, name, type, grade, description) VALUES (?, ?, ?, ?, ?) RETURNING id",
            &[
                DbParam::Int(area_id),
                DbParam::Text(name.to_string()),
                DbParam::Text(climb_type.as_str().to_string()),
                DbParam::Int(grade),
                match description {
                    Some(d) => DbParam::Text(d.to_string()),
                    None => DbParam::Null,
                },
            ],
        )
        .await?
        .ok_or(DbError::Column("id"))?;
    row.get_i64("id")
}

pub async fn update_climb_description<D: DbExecutor>(
    db: &D,
    climb_id: i64,
    description: Option<&str>,
) -> Result<(), DbError> {
    db.execute(
        "UPDATE climbs SET description = ? WHERE id = ?",
        &[
            match description {
                Some(d) => DbParam::Text(d.to_string()),
                None => DbParam::Null,
            },
            DbParam::Int(climb_id),
        ],
    )
    .await?;
    Ok(())
}

pub async fn get_climb_list_choices<D: DbExecutor>(
    db: &D,
    owner_id: &str,
    climb_id: i64,
) -> Result<Vec<ClimbListChoice>, DbError> {
    let rows = db
        .query_all(
            "SELECT l.id AS id, l.title AS title,
                    (SELECT COUNT(*) FROM climb_list_items i WHERE i.list_id = l.id) AS climbCount,
                    EXISTS (SELECT 1 FROM climb_list_items i WHERE i.list_id = l.id AND i.climb_id = ?) AS hasClimb
             FROM climb_lists l
             WHERE l.user_id = ?
             ORDER BY l.updated_at DESC, l.id DESC",
            &[DbParam::Int(climb_id), DbParam::Text(owner_id.to_string())],
        )
        .await?;
    rows.into_iter()
        .map(|row| {
            Ok(ClimbListChoice {
                id: row.get_i64("id")?,
                title: row.get_string("title")?,
                climb_count: row.get_i64("climbCount")?,
                has_climb: row.get_i64("hasClimb")? == 1,
            })
        })
        .collect()
}

pub fn area_details_from_subtree(area: AreaWithSubtreeSize) -> PublicAreaDetails {
    PublicAreaDetails {
        id: area.id,
        name: area.name,
        parent_id: area.parent_id,
        description: area.description,
    }
}
