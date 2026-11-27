//! Public search entry for a cold /search visit. The HTML and the first SPA
//! result pages are built from the same reads; this code never accepts a viewer.
use std::fmt::Write;

use betabook_db::{
    DbError, DbExecutor,
    public_catalog::{get_public_area_trail, search_public_areas, search_public_climbs},
};
use betabook_domain::{
    public_catalog::{
        PublicAreasPage, PublicCatalogOptions, PublicClimbsPage, SubtreeClimbsSort,
        has_protected_catalog_params, parse_public_catalog_options,
    },
    seo::escape_html,
    slug::area_href,
};
use serde::Serialize;
use serde_json::{Value, json};
use url::form_urlencoded;

use super::public_catalog_html::climb_list;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Mode {
    All,
    Climbs,
    Areas,
    Climbers,
}

impl Mode {
    fn parse(name: Option<&str>) -> Self {
        match name {
            Some("all") => Self::All,
            Some("area") => Self::Areas,
            Some("climber") => Self::Climbers,
            _ => Self::Climbs,
        }
    }
    fn key(self) -> &'static str {
        match self {
            Self::All => "all",
            Self::Climbs => "climb",
            Self::Areas => "area",
            Self::Climbers => "climber",
        }
    }
    fn label(self) -> &'static str {
        match self {
            Self::All => "All",
            Self::Climbs => "Climbs",
            Self::Areas => "Areas",
            Self::Climbers => "Climbers",
        }
    }
}

struct Search {
    pairs: Vec<(String, String)>,
    mode: Mode,
    name: String,
}

impl Search {
    fn parse(query: &str) -> Self {
        let pairs: Vec<_> = form_urlencoded::parse(query.as_bytes())
            .into_owned()
            .collect();
        let first = |key: &str| {
            pairs
                .iter()
                .find(|(k, _)| k == key)
                .map(|(_, v)| v.as_str())
        };
        Self {
            mode: Mode::parse(first("mode")),
            name: first("name").unwrap_or("").to_owned(),
            pairs,
        }
    }

    fn encoded(&self, include: impl Fn(&str) -> bool) -> String {
        form_urlencoded::Serializer::new(String::new())
            .extend_pairs(self.pairs.iter().filter(|(key, _)| include(key)))
            .finish()
    }

    fn options(&self) -> PublicCatalogOptions {
        // React normalizes its filter inputs before constructing the first public API URL.
        // Empty numeric values become zero and JS also accepts 0x/0o/0b literals.
        let mut api_query = form_urlencoded::Serializer::new(String::new());
        for (key, value) in &self.pairs {
            if matches!(key.as_str(), "mode" | "page" | "offset" | "limit") {
                continue;
            }
            if matches!(
                key.as_str(),
                "boulderRange" | "sportRange" | "tradRange" | "ratingRange" | "minAscents"
            ) {
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    api_query.append_pair(key, "0");
                    continue;
                }
                let radix = match trimmed.as_bytes().get(..2) {
                    Some(b"0x" | b"0X") => Some(16),
                    Some(b"0b" | b"0B") => Some(2),
                    Some(b"0o" | b"0O") => Some(8),
                    _ => None,
                };
                if let Some(radix) = radix
                    && trimmed.len() > 2
                    && let Some(number) = trimmed[2..].chars().try_fold(0.0, |n, c| {
                        c.to_digit(radix)
                            .map(|d| n * f64::from(radix) + f64::from(d))
                    })
                {
                    api_query.append_pair(key, &number.to_string());
                    continue;
                }
            }
            api_query.append_pair(key, value);
        }
        parse_public_catalog_options(&api_query.finish())
    }

    fn sign_in(&self, label: &str) -> String {
        let next = format!(
            "/search?{}",
            self.encoded(|key| matches!(
                key,
                "mode"
                    | "name"
                    | "areaId"
                    | "areaName"
                    | "sort"
                    | "discipline"
                    | "boulderRange"
                    | "sportRange"
                    | "tradRange"
                    | "ratingRange"
                    | "minAscents"
                    | "excludeSent"
            ))
        );
        let params = form_urlencoded::Serializer::new(String::new())
            .append_pair("next", &next)
            .finish();
        format!(
            r#"<p class="text-sm text-muted"><a class="link" href="/sign-in?{}">Sign in</a> {label}</p>"#,
            escape_html(&params)
        )
    }
    fn form(&self) -> String {
        let mut html = format!(
            r#"<div class="flex flex-col gap-6"><header><h1 class="font-display text-3xl font-semibold tracking-tight">Find climbs</h1><p class="text-sm text-muted">Browse an area by grade, rating and ascents, or search by name.</p></header><form action="/search" method="get" role="search" class="flex gap-2"><input type="hidden" name="mode" value="{}">"#,
            self.mode.key()
        );
        for (name, value) in &self.pairs {
            if matches!(
                name.as_str(),
                "areaId"
                    | "areaName"
                    | "sort"
                    | "discipline"
                    | "boulderRange"
                    | "sportRange"
                    | "tradRange"
                    | "ratingRange"
                    | "minAscents"
                    | "excludeSent"
            ) {
                let _ = write!(
                    html,
                    r#"<input type="hidden" name="{}" value="{}">"#,
                    name,
                    escape_html(value)
                );
            }
        }
        let _ = write!(
            html,
            r#"<label class="sr-only" for="public-search-name">Search Betabook</label><input type="search" id="public-search-name" name="name" value="{}" class="min-w-0 flex-1 rounded-md border border-separator px-3 py-2"><button type="submit" class="rounded-md border border-separator px-3">Search</button></form><nav aria-label="Search categories" class="flex flex-wrap gap-2">"#,
            escape_html(&self.name)
        );
        for mode in [Mode::All, Mode::Climbs, Mode::Areas, Mode::Climbers] {
            let mut params = form_urlencoded::Serializer::new(String::new());
            params.append_pair("mode", mode.key());
            if !self.name.is_empty() {
                params.append_pair("name", &self.name);
            }
            let current = if mode == self.mode {
                r#" aria-current="page""#
            } else {
                ""
            };
            let _ = write!(
                html,
                r#"<a href="/search?{}"{} class="rounded-full border border-separator px-3 py-1 text-sm">{}</a>"#,
                escape_html(&params.finish()),
                current,
                mode.label()
            );
        }
        html.push_str("</nav>");
        html
    }
}

#[derive(Serialize)]
struct AreaSelection {
    id: String,
    name: String,
    path: String,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchSeed {
    #[serde(skip_serializing_if = "Option::is_none")]
    climbs_page: Option<PublicClimbsPage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    areas_page: Option<PublicAreasPage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    area_selection: Option<AreaSelection>,
}

fn render_areas(html: &mut String, page: &PublicAreasPage, preview: bool) {
    html.push_str(
        r#"<section aria-label="Areas results"><h2 class="text-xl font-semibold">Areas</h2>"#,
    );
    if page.areas.is_empty() {
        html.push_str("<p>No matching areas. Try another name or clear a filter.</p>");
    } else {
        html.push_str(r#"<ul class="divide-y divide-separator">"#);
        for area in page
            .areas
            .iter()
            .take(if preview { 3 } else { page.areas.len() })
        {
            let context = area
                .ancestor_path
                .as_deref()
                .unwrap_or("Area")
                .replace(" > ", " / ");
            let _ = write!(
                html,
                r#"<li><a class="block px-3 py-3" href="{}"><span class="block font-medium">{}</span><span class="text-xs text-muted">{}</span></a></li>"#,
                escape_html(&area_href(area.id, &area.name)),
                escape_html(&area.name),
                escape_html(&context)
            );
        }
        html.push_str("</ul>");
    }
    html.push_str("</section>");
}

/// The page's mode chooses result sections; it is not a catalog API parameter.
/// Never run a public prefetch on behalf of a protected catalog query.
pub(super) async fn render(
    db: &impl DbExecutor,
    raw_query: &str,
) -> Result<(String, Option<Value>), DbError> {
    let search = Search::parse(raw_query);
    let mut html = search.form();
    let catalog_query = search.encoded(|key| key != "mode");
    if has_protected_catalog_params(&catalog_query, true) {
        html.push_str(&search.sign_in("to view member search results."));
        html.push_str("</div>");
        return Ok((html, None));
    }
    // Location pagination belongs to the API. The search screen always starts at page 1.
    let mut options = search.options();
    let mut seed = SearchSeed::default();
    if let Some(id) = options.area_id {
        let trail = get_public_area_trail(db, id).await?;
        let (name, path) = if let Some((area, ancestors)) = trail.split_last() {
            (
                area.name.clone(),
                ancestors
                    .iter()
                    .map(|a| a.name.as_str())
                    .collect::<Vec<_>>()
                    .join(" / "),
            )
        } else {
            ("Unavailable area".to_owned(), String::new())
        };
        let _ = write!(
            html,
            r#"<p class="text-sm text-muted">Area: {}</p>"#,
            escape_html(&name)
        );
        seed.area_selection = Some(AreaSelection {
            id: id.to_string(),
            name,
            path,
        });
    }
    let named = !search.name.trim().is_empty();
    if search.mode == Mode::Climbs || (search.mode == Mode::All && named) {
        let page = search_public_climbs(db, &options).await?;
        html.push_str(
            r#"<section aria-label="Climbs results"><h2 class="text-xl font-semibold">Climbs</h2>"#,
        );
        let empty = "No matching climbs. Try another name or clear a filter.";
        if search.mode == Mode::All {
            let preview = PublicClimbsPage {
                climbs: page.climbs.iter().take(3).cloned().collect(),
                area_breadcrumbs: page.area_breadcrumbs.clone(),
                has_next_page: false,
            };
            html.push_str(&climb_list(&preview, empty));
        } else {
            html.push_str(&climb_list(&page, empty));
        }
        html.push_str("</section>");
        seed.climbs_page = Some(page);
    }
    if matches!(search.mode, Mode::Areas | Mode::All) && named {
        // Just as in publicSearchParams(), area search only uses name, scope and name ordering.
        if options.sort != SubtreeClimbsSort::NameDesc {
            options.sort = SubtreeClimbsSort::NameAsc;
        }
        let page = search_public_areas(db, &options).await?;
        render_areas(&mut html, &page, search.mode == Mode::All);
        seed.areas_page = Some(page);
    } else if !named && matches!(search.mode, Mode::Areas | Mode::All) {
        html.push_str("<p>Start typing to find areas.</p>");
    }
    if matches!(search.mode, Mode::Climbers | Mode::All) {
        html.push_str(&search.sign_in("to view climbers."));
    }
    html.push_str("</div>");
    Ok((
        html,
        Some(
            json!({"route":"search","path":"/search","query":search.encoded(|_|true),"data":seed}),
        ),
    ))
}
