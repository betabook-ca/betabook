use std::future::Future;

use betabook_domain::grades::{ClimbType, GradePreferences, format_grade};
use serde::Serialize;

use crate::executor::{DbError, DbExecutor, DbParam};

pub const CATALOG_EXPORT_KEY: &str = "catalog/latest.json";
pub const CATALOG_EXPORT_SCHEMA_VERSION: u32 = 1;
pub const DEFAULT_CATALOG_PAGE_SIZE: usize = 1000;
pub const CATALOG_EXPORT_PART_SIZE: usize = 5 * 1024 * 1024;

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CatalogAreaRow {
    pub id: i64,
    pub parent_id: Option<i64>,
    pub name: String,
    pub description: Option<String>,
}

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CatalogClimbRow {
    pub id: i64,
    pub area_id: i64,
    pub name: String,
    #[serde(rename = "type")]
    pub climb_type: ClimbType,
    pub grade: Option<i64>,
    pub description: Option<String>,
}

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExportClimbItem<'a> {
    id: i64,
    area_id: i64,
    name: &'a str,
    #[serde(rename = "type")]
    climb_type: ClimbType,
    grade: Option<i64>,
    description: Option<&'a str>,
    grade_label: Option<&'static str>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CatalogCounts {
    pub area_count: i64,
    pub climb_count: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CatalogExportSummary {
    pub generated_at: String,
    pub area_count: i64,
    pub climb_count: i64,
    pub size: usize,
}

pub async fn get_catalog_counts<D: DbExecutor>(db: &D) -> Result<CatalogCounts, DbError> {
    let row = db
        .query_one(
            "SELECT (SELECT count(*) FROM areas) AS area_count, (SELECT count(*) FROM climbs) AS climb_count",
            &[],
        )
        .await?
        .ok_or(DbError::Column("area_count"))?;
    Ok(CatalogCounts {
        area_count: row.get_i64("area_count")?,
        climb_count: row.get_i64("climb_count")?,
    })
}

pub async fn get_catalog_areas_after<D: DbExecutor>(
    db: &D,
    after_id: i64,
    limit: usize,
) -> Result<Vec<CatalogAreaRow>, DbError> {
    let rows = db
        .query_all(
            "SELECT id, parent_id AS parentId, name, description FROM areas WHERE id > ? ORDER BY id ASC LIMIT ?",
            &[DbParam::Int(after_id), DbParam::Int(limit as i64)],
        )
        .await?;
    rows.into_iter()
        .map(|r| {
            Ok(CatalogAreaRow {
                id: r.get_i64("id")?,
                parent_id: r.get_opt_i64("parentId")?,
                name: r.get_string("name")?,
                description: r.get_opt_string("description")?,
            })
        })
        .collect()
}

pub async fn get_catalog_climbs_after<D: DbExecutor>(
    db: &D,
    after_id: i64,
    limit: usize,
) -> Result<Vec<CatalogClimbRow>, DbError> {
    let rows = db
        .query_all(
            "SELECT id, area_id AS areaId, name, type, grade, description FROM climbs WHERE id > ? ORDER BY id ASC LIMIT ?",
            &[DbParam::Int(after_id), DbParam::Int(limit as i64)],
        )
        .await?;
    rows.into_iter()
        .map(|r| {
            let raw_type = r.get_string("type")?;
            let climb_type = ClimbType::parse(&raw_type).ok_or(DbError::Column("type"))?;
            Ok(CatalogClimbRow {
                id: r.get_i64("id")?,
                area_id: r.get_i64("areaId")?,
                name: r.get_string("name")?,
                climb_type,
                grade: r.get_opt_i64("grade")?,
                description: r.get_opt_string("description")?,
            })
        })
        .collect()
}

struct PartBuffer {
    part_size: usize,
    pending: Vec<u8>,
    part_number: usize,
    total_size: usize,
}

impl PartBuffer {
    fn new(part_size: usize) -> Self {
        Self {
            part_size,
            pending: Vec::with_capacity(part_size),
            part_number: 0,
            total_size: 0,
        }
    }

    async fn push<F, Fut>(&mut self, chunk: &[u8], emit: &mut F) -> Result<(), DbError>
    where
        F: FnMut(usize, Vec<u8>) -> Fut,
        Fut: Future<Output = Result<(), DbError>>,
    {
        self.pending.extend_from_slice(chunk);
        while self.pending.len() >= self.part_size {
            let mut rest = self.pending.split_off(self.part_size);
            std::mem::swap(&mut self.pending, &mut rest);
            self.part_number += 1;
            self.total_size += rest.len();
            emit(self.part_number, rest).await?;
        }
        Ok(())
    }

    async fn finish<F, Fut>(mut self, emit: &mut F) -> Result<usize, DbError>
    where
        F: FnMut(usize, Vec<u8>) -> Fut,
        Fut: Future<Output = Result<(), DbError>>,
    {
        if !self.pending.is_empty() {
            self.part_number += 1;
            self.total_size += self.pending.len();
            emit(self.part_number, self.pending).await?;
        }
        Ok(self.total_size)
    }
}

pub async fn stream_catalog_export_parts<D, F, Fut>(
    db: &D,
    counts: CatalogCounts,
    generated_at: &str,
    page_size: usize,
    part_size: usize,
    mut emit_part: F,
) -> Result<CatalogExportSummary, DbError>
where
    D: DbExecutor,
    F: FnMut(usize, Vec<u8>) -> Fut,
    Fut: Future<Output = Result<(), DbError>>,
{
    if page_size == 0 || part_size == 0 {
        return Err(DbError::Query(
            "page_size and part_size must be positive".to_string(),
        ));
    }

    let mut buffer = PartBuffer::new(part_size);
    let header = format!(
        "{{\"schemaVersion\":{CATALOG_EXPORT_SCHEMA_VERSION},\"generatedAt\":{},\"areas\":[",
        serde_json::to_string(generated_at)?
    );
    buffer.push(header.as_bytes(), &mut emit_part).await?;

    let mut after_id = 0_i64;
    let mut first = true;
    loop {
        let batch = get_catalog_areas_after(db, after_id, page_size).await?;
        if !batch.is_empty() {
            let mut chunk = String::new();
            for row in &batch {
                if !first {
                    chunk.push(',');
                }
                first = false;
                chunk.push_str(&serde_json::to_string(row)?);
            }
            buffer.push(chunk.as_bytes(), &mut emit_part).await?;
        }
        if batch.len() < page_size {
            break;
        }
        let last_id = batch.last().map(|r| r.id).unwrap_or(after_id);
        if last_id <= after_id {
            return Err(DbError::Query(
                "Catalog export cursor did not advance".to_string(),
            ));
        }
        after_id = last_id;
    }

    buffer.push(b"],\"climbs\":[", &mut emit_part).await?;

    after_id = 0;
    first = true;
    loop {
        let batch = get_catalog_climbs_after(db, after_id, page_size).await?;
        if !batch.is_empty() {
            let mut chunk = String::new();
            for row in &batch {
                if !first {
                    chunk.push(',');
                }
                first = false;
                let item = ExportClimbItem {
                    id: row.id,
                    area_id: row.area_id,
                    name: &row.name,
                    climb_type: row.climb_type,
                    grade: row.grade,
                    description: row.description.as_deref(),
                    grade_label: row.grade.map(|g| {
                        format_grade(row.climb_type, Some(g), GradePreferences::default())
                    }),
                };
                chunk.push_str(&serde_json::to_string(&item)?);
            }
            buffer.push(chunk.as_bytes(), &mut emit_part).await?;
        }
        if batch.len() < page_size {
            break;
        }
        let last_id = batch.last().map(|r| r.id).unwrap_or(after_id);
        if last_id <= after_id {
            return Err(DbError::Query(
                "Catalog export cursor did not advance".to_string(),
            ));
        }
        after_id = last_id;
    }

    buffer.push(b"]}", &mut emit_part).await?;
    let size = buffer.finish(&mut emit_part).await?;

    Ok(CatalogExportSummary {
        generated_at: generated_at.to_string(),
        area_count: counts.area_count,
        climb_count: counts.climb_count,
        size,
    })
}
