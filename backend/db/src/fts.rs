use betabook_domain::grades::ClimbType;
use betabook_domain::public_catalog::{
    DEFAULT_BOULDER_RANGE, DEFAULT_SPORT_RANGE, DEFAULT_TRAD_RANGE, DisciplineGradeFilter,
    MAX_PAGINATION_OFFSET,
};

use crate::executor::DbParam;

pub const PAGE_SIZE: usize = 50;

pub fn clamp_page_size(page_size: usize, fallback: usize, max: usize) -> usize {
    if page_size == 0 {
        fallback
    } else {
        page_size.min(max).max(1)
    }
}

pub fn clamp_offset(offset: usize) -> usize {
    offset.min(MAX_PAGINATION_OFFSET)
}

pub fn to_fts_prefix_query(raw: &str) -> String {
    raw.split_whitespace()
        .map(|word| word.replace('"', "\"\"").trim().to_string())
        .filter(|word| !word.is_empty())
        .map(|word| format!("\"{word}\"*"))
        .collect::<Vec<_>>()
        .join(" ")
}

/// D1 limits LIKE patterns to 50 bytes. Keep an indexed prefix lookup, then
/// compare the full literal prefix when UTF-8 or escaping reaches that limit.
pub fn literal_prefix_condition(column: &str, value: &str, params: &mut Vec<DbParam>) -> String {
    let mut pattern = String::new();
    let mut bytes = 1_usize; // trailing '%'
    let mut consumed = 0_usize;
    for ch in value.chars() {
        let escaped = match ch {
            '\\' => "\\\\".to_string(),
            '%' => "\\%".to_string(),
            '_' => "\\_".to_string(),
            other => other.to_string(),
        };
        if bytes + escaped.len() > 50 {
            break;
        }
        pattern.push_str(&escaped);
        bytes += escaped.len();
        consumed += ch.len_utf8();
    }
    pattern.push('%');
    params.push(DbParam::Text(pattern));
    if consumed < value.len() {
        params.push(DbParam::Text(value.to_string()));
        params.push(DbParam::Text(value.to_string()));
        format!(
            "({column} LIKE ? ESCAPE '\\' AND substr({column}, 1, length(?)) = ? COLLATE NOCASE)"
        )
    } else {
        format!("({column} LIKE ? ESCAPE '\\')")
    }
}

fn discipline_grade_condition(
    climb_type: ClimbType,
    range: [i64; 2],
    full_range: [i64; 2],
    params: &mut Vec<DbParam>,
) -> String {
    let [min, max] = range;
    params.push(DbParam::Text(climb_type.as_str().to_string()));
    if min <= full_range[0] && max >= full_range[1] {
        "climbs.type = ?".to_string()
    } else {
        params.push(DbParam::Int(min));
        params.push(DbParam::Int(max));
        "(climbs.type = ? AND climbs.grade BETWEEN ? AND ?)".to_string()
    }
}

pub fn discipline_grade_conditions(
    filter: &DisciplineGradeFilter,
    params: &mut Vec<DbParam>,
) -> Vec<String> {
    let mut clauses = Vec::new();
    if filter.disciplines.contains(&ClimbType::Boulder)
        && let Some(range) = filter.boulder_range
    {
        clauses.push(discipline_grade_condition(
            ClimbType::Boulder,
            range,
            DEFAULT_BOULDER_RANGE,
            params,
        ));
    }
    if filter.disciplines.contains(&ClimbType::Sport)
        && let Some(range) = filter.sport_range
    {
        clauses.push(discipline_grade_condition(
            ClimbType::Sport,
            range,
            DEFAULT_SPORT_RANGE,
            params,
        ));
    }
    if filter.disciplines.contains(&ClimbType::Trad)
        && let Some(range) = filter.trad_range
    {
        clauses.push(discipline_grade_condition(
            ClimbType::Trad,
            range,
            DEFAULT_TRAD_RANGE,
            params,
        ));
    }
    clauses
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_safe_fts5_prefix_queries() {
        assert_eq!(to_fts_prefix_query("squam"), "\"squam\"*");
        assert_eq!(
            to_fts_prefix_query("don't \"quote\" -test"),
            "\"don't\"* \"\"\"quote\"\"\"* \"-test\"*"
        );
        assert_eq!(to_fts_prefix_query("   "), "");
    }
}
