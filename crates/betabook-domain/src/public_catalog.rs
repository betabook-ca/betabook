use std::collections::{BTreeMap, HashSet};

use serde::{Deserialize, Serialize};
use url::form_urlencoded;

use crate::grades::{BOULDER_HUECO, ClimbType, ROPE_YDS};

pub const DEFAULT_BOULDER_RANGE: [i64; 2] = [0, (BOULDER_HUECO.len() as i64) - 1];
pub const DEFAULT_SPORT_RANGE: [i64; 2] = [0, (ROPE_YDS.len() as i64) - 1];
pub const DEFAULT_TRAD_RANGE: [i64; 2] = [0, (ROPE_YDS.len() as i64) - 1];

pub const MAX_RATING: i64 = 5;
pub const DEFAULT_RATING_RANGE: [i64; 2] = [0, 0];

pub const MAX_SUGGESTION_LIMIT: usize = 10;
pub const DEFAULT_SUGGESTION_LIMIT: usize = 5;
pub const MAX_PAGINATION_OFFSET: usize = 10_000;
pub const DEFAULT_PUBLIC_PAGE_SIZE: usize = 25;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SubtreeClimbsSort {
    NameAsc,
    NameDesc,
    GradeAsc,
    GradeDesc,
    RatingAsc,
    RatingDesc,
    AscentsAsc,
    #[default]
    AscentsDesc,
}

impl SubtreeClimbsSort {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "name_asc" => Some(Self::NameAsc),
            "name_desc" => Some(Self::NameDesc),
            "grade_asc" => Some(Self::GradeAsc),
            "grade_desc" => Some(Self::GradeDesc),
            "rating_asc" => Some(Self::RatingAsc),
            "rating_desc" => Some(Self::RatingDesc),
            "ascents_asc" => Some(Self::AscentsAsc),
            "ascents_desc" => Some(Self::AscentsDesc),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::NameAsc => "name_asc",
            Self::NameDesc => "name_desc",
            Self::GradeAsc => "grade_asc",
            Self::GradeDesc => "grade_desc",
            Self::RatingAsc => "rating_asc",
            Self::RatingDesc => "rating_desc",
            Self::AscentsAsc => "ascents_asc",
            Self::AscentsDesc => "ascents_desc",
        }
    }
}

pub fn parse_id(raw: &str) -> Option<i64> {
    let bytes = raw.as_bytes();
    if bytes.is_empty() || !(b'1'..=b'9').contains(&bytes[0]) {
        return None;
    }
    if !bytes[1..].iter().all(|b| b.is_ascii_digit()) {
        return None;
    }
    raw.parse::<i64>().ok().filter(|&id| id > 0)
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DisciplineGradeFilter {
    pub disciplines: Vec<ClimbType>,
    pub boulder_range: Option<[i64; 2]>,
    pub sport_range: Option<[i64; 2]>,
    pub trad_range: Option<[i64; 2]>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PublicCatalogOptions {
    pub filter: DisciplineGradeFilter,
    pub name: String,
    pub area_id: Option<i64>,
    pub area_name: Option<String>,
    pub sort: SubtreeClimbsSort,
    pub rating_range: [i64; 2],
    pub min_ascents: i64,
    pub exclude_sent_by: Option<String>,
    pub offset: Option<usize>,
    pub page_size: usize,
}

fn is_public_param(key: &str, climb_filters: bool) -> bool {
    let base = matches!(
        key,
        "name" | "areaId" | "areaName" | "subarea" | "page" | "offset" | "limit" | "sort"
    );
    if base {
        return true;
    }
    climb_filters
        && matches!(
            key,
            "discipline"
                | "boulderRange"
                | "sportRange"
                | "tradRange"
                | "ratingRange"
                | "minAscents"
        )
}

pub fn has_protected_catalog_params(raw_query: &str, climb_filters: bool) -> bool {
    let pairs: Vec<(String, String)> = form_urlencoded::parse(raw_query.as_bytes())
        .into_owned()
        .collect();
    let mut sort_value: Option<String> = None;
    for (k, v) in &pairs {
        if !is_public_param(k, climb_filters) {
            return true;
        }
        if k == "sort" && sort_value.is_none() {
            sort_value = Some(v.clone());
        }
    }
    if let Some(sort) = sort_value {
        if climb_filters {
            return SubtreeClimbsSort::parse(&sort).is_none();
        }
        return !matches!(sort.as_str(), "name_asc" | "name_desc");
    }
    false
}

fn parse_js_int(raw: &str) -> Option<i64> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let val: f64 = trimmed.parse().ok()?;
    if !val.is_finite() {
        return None;
    }
    Some(val.trunc() as i64)
}

fn parse_range(values: &[String], fallback: [i64; 2]) -> [i64; 2] {
    let nums: Vec<i64> = values
        .iter()
        .filter_map(|v| {
            let parsed = v.trim().parse::<f64>().ok()?;
            parsed.is_finite().then_some(parsed as i64)
        })
        .collect();
    if nums.len() < 2 {
        return fallback;
    }
    let min = *nums.iter().min().unwrap();
    let max = *nums.iter().max().unwrap();
    [min, max]
}

fn parse_rating_range(values: &[String]) -> [i64; 2] {
    if values.len() < 2 {
        return DEFAULT_RATING_RANGE;
    }
    let Ok(min_f) = values[0].trim().parse::<f64>() else {
        return DEFAULT_RATING_RANGE;
    };
    let Ok(max_f) = values[1].trim().parse::<f64>() else {
        return DEFAULT_RATING_RANGE;
    };
    if !min_f.is_finite() || !max_f.is_finite() {
        return DEFAULT_RATING_RANGE;
    }
    let clamp = |v: f64| (v.round() as i64).clamp(0, MAX_RATING);
    [clamp(min_f), clamp(max_f)]
}

fn parse_suggestion_limit(raw: Option<&str>) -> Option<usize> {
    let raw = raw?;
    match parse_js_int(raw) {
        Some(n) if n >= 1 => Some((n as usize).min(MAX_SUGGESTION_LIMIT)),
        _ => Some(DEFAULT_SUGGESTION_LIMIT),
    }
}

fn parse_page(raw: Option<&str>, page_size: usize) -> Option<usize> {
    let n = raw.and_then(parse_js_int).unwrap_or(1);
    let page = if n <= 0 { 1 } else { n as usize };
    let last_page = (MAX_PAGINATION_OFFSET / page_size) + 1;
    (page <= last_page).then_some(page)
}

fn parse_offset(raw: Option<&str>) -> Option<usize> {
    let Some(raw) = raw else {
        return Some(0);
    };
    let Ok(val) = raw.trim().parse::<f64>() else {
        return Some(0);
    };
    if !val.is_finite() || val.fract() != 0.0 || val < 0.0 {
        return Some(0);
    }
    let offset = val as usize;
    (offset <= MAX_PAGINATION_OFFSET).then_some(offset)
}

pub fn parse_public_catalog_options(raw_query: &str) -> PublicCatalogOptions {
    parse_catalog_options_inner(raw_query, None, DEFAULT_PUBLIC_PAGE_SIZE)
}

pub fn parse_member_catalog_options(
    raw_query: &str,
    viewer_id: &str,
    default_page_size: usize,
) -> PublicCatalogOptions {
    parse_catalog_options_inner(raw_query, Some(viewer_id), default_page_size)
}

fn parse_catalog_options_inner(
    raw_query: &str,
    viewer_id: Option<&str>,
    default_page_size: usize,
) -> PublicCatalogOptions {
    let mut map: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for (k, v) in form_urlencoded::parse(raw_query.as_bytes()) {
        map.entry(k.into_owned()).or_default().push(v.into_owned());
    }
    let first = |key: &str| map.get(key).and_then(|v| v.first()).map(String::as_str);

    let page_size = parse_suggestion_limit(first("limit")).unwrap_or(default_page_size);
    let offset = if map.contains_key("offset") {
        parse_offset(first("offset"))
    } else {
        parse_page(first("page"), page_size).map(|p| (p - 1) * page_size)
    };

    let disciplines: Vec<ClimbType> = map
        .get("discipline")
        .into_iter()
        .flatten()
        .filter_map(|s| ClimbType::parse(s))
        .collect();
    let discipline_set: HashSet<ClimbType> = disciplines.iter().copied().collect();

    let empty = Vec::new();
    let boulder_range = discipline_set.contains(&ClimbType::Boulder).then(|| {
        parse_range(
            map.get("boulderRange").unwrap_or(&empty),
            DEFAULT_BOULDER_RANGE,
        )
    });
    let sport_range = discipline_set
        .contains(&ClimbType::Sport)
        .then(|| parse_range(map.get("sportRange").unwrap_or(&empty), DEFAULT_SPORT_RANGE));
    let trad_range = discipline_set
        .contains(&ClimbType::Trad)
        .then(|| parse_range(map.get("tradRange").unwrap_or(&empty), DEFAULT_TRAD_RANGE));

    let area_id = first("areaId").map(|raw| parse_id(raw).unwrap_or(0));
    let sort = first("sort")
        .and_then(SubtreeClimbsSort::parse)
        .unwrap_or_default();
    let min_ascents = first("minAscents")
        .and_then(parse_js_int)
        .map(|v| v.max(0))
        .unwrap_or(0);
    let exclude_sent = matches!(first("excludeSent"), Some("1" | "true"));
    let exclude_sent_by = exclude_sent
        .then(|| viewer_id.map(ToString::to_string))
        .flatten();

    PublicCatalogOptions {
        filter: DisciplineGradeFilter {
            disciplines,
            boulder_range,
            sport_range,
            trad_range,
        },
        name: first("name").unwrap_or("").to_string(),
        area_id,
        area_name: first("areaName").map(ToString::to_string),
        sort,
        rating_range: parse_rating_range(map.get("ratingRange").unwrap_or(&empty)),
        min_ascents,
        exclude_sent_by,
        offset,
        page_size,
    }
}

pub fn public_has_next_page(fetched_len: usize, options: &PublicCatalogOptions) -> bool {
    fetched_len > options.page_size
        && options
            .offset
            .is_some_and(|offset| offset + options.page_size <= MAX_PAGINATION_OFFSET)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PublicArea {
    pub id: i64,
    pub name: String,
    pub parent_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PublicAreaDetails {
    pub id: i64,
    pub name: String,
    pub parent_id: Option<i64>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PublicAreaResult {
    pub id: i64,
    pub name: String,
    pub parent_id: Option<i64>,
    pub description: Option<String>,
    pub ancestor_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PublicClimb {
    pub id: i64,
    pub name: String,
    pub area_id: i64,
    pub area_name: String,
    #[serde(rename = "type")]
    pub climb_type: ClimbType,
    pub grade: Option<i64>,
    pub description: Option<String>,
    pub broken_on: Option<String>,
    pub avg_rating: Option<f64>,
    pub send_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PublicClimbSend {
    pub user_name: Option<String>,
    pub user_image: Option<String>,
    pub date_sent: Option<String>,
    pub ascent_style: String,
    pub rating: Option<i64>,
    pub suggested_grade: Option<i64>,
    pub grade_feel: String,
    pub comment: Option<String>,
    pub videos: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AreaBreadcrumbItem {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PublicClimbsPage {
    pub climbs: Vec<PublicClimb>,
    pub area_breadcrumbs: BTreeMap<i64, Vec<AreaBreadcrumbItem>>,
    pub has_next_page: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PublicAreasPage {
    pub areas: Vec<PublicAreaResult>,
    pub has_next_page: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enforces_protected_catalog_params() {
        assert!(!has_protected_catalog_params(
            "name=squamish&sort=name_asc",
            false
        ));
        assert!(has_protected_catalog_params(
            "name=squamish&sort=ascents_desc",
            false
        ));
        assert!(has_protected_catalog_params("excludeSent=1", true));
        assert!(!has_protected_catalog_params(
            "name=dream&discipline=boulder&boulderRange=3&boulderRange=8&sort=grade_desc",
            true
        ));
    }

    #[test]
    fn parses_ids_and_pagination() {
        assert_eq!(parse_id("42"), Some(42));
        assert_eq!(parse_id("0"), None);
        assert_eq!(parse_id("042"), None);
        assert_eq!(parse_id("1e0"), None);
        assert_eq!(parse_id("42 "), None);

        let opts = parse_public_catalog_options("limit=abc&page=2");
        assert_eq!(opts.page_size, DEFAULT_SUGGESTION_LIMIT);
        assert_eq!(opts.offset, Some(5));

        let capped = parse_public_catalog_options("offset=10001");
        assert_eq!(capped.offset, None);
    }
}
