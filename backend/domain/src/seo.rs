use serde::Serialize;
use serde_json::{Value, json};

use crate::grades::{ClimbType, GradePreferences, format_grade};
use crate::site::{
    LANDING_PAGE_PATHS, OG_IMAGE_ALT, OG_IMAGE_HEIGHT, OG_IMAGE_URL, OG_IMAGE_WIDTH,
    SITE_DESCRIPTION, SITE_NAME, SITE_URL,
};
use crate::terms::{TERMS_VERSIONS, terms_href};

pub fn escape_html(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            c => out.push(c),
        }
    }
    out
}

pub fn escape_json_for_script(json: &str) -> String {
    json.replace('<', "\\u003c")
        .replace('>', "\\u003e")
        .replace('&', "\\u0026")
        .replace('\u{2028}', "\\u2028")
        .replace('\u{2029}', "\\u2029")
}

#[derive(Debug, Clone)]
pub struct Crumb {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone)]
pub struct PageMetadata {
    pub title: String,
    pub description: String,
    pub canonical_path: Option<String>,
    pub og_type: &'static str,
    pub index: bool,
}

impl PageMetadata {
    pub fn indexable(
        title: impl Into<String>,
        description: impl Into<String>,
        path: impl Into<String>,
        og_type: &'static str,
    ) -> Self {
        Self {
            title: title.into(),
            description: description.into(),
            canonical_path: Some(path.into()),
            og_type,
            index: true,
        }
    }

    pub fn noindex(title: impl Into<String>, description: impl Into<String>) -> Self {
        Self {
            title: title.into(),
            description: description.into(),
            canonical_path: None,
            og_type: "website",
            index: false,
        }
    }

    pub fn full_title(&self) -> String {
        if self.og_type == "profile"
            || self.title == SITE_NAME
            || self.title.ends_with(&format!(" · {SITE_NAME}"))
        {
            self.title.clone()
        } else {
            format!("{} · {SITE_NAME}", self.title)
        }
    }

    pub fn render_head_tags(&self) -> String {
        let title = escape_html(&self.full_title());
        let og_title = escape_html(&self.title);
        let desc = escape_html(&self.description);
        let og_image = format!("{SITE_URL}{OG_IMAGE_URL}");
        let mut tags = vec![
            format!("<title>{title}</title>"),
            format!("<meta name=\"description\" content=\"{desc}\">"),
            format!("<meta property=\"og:type\" content=\"{}\">", self.og_type),
            format!("<meta property=\"og:site_name\" content=\"{SITE_NAME}\">"),
            format!("<meta property=\"og:title\" content=\"{og_title}\">"),
            format!("<meta property=\"og:description\" content=\"{desc}\">"),
            r#"<link rel="icon" href="/favicon.ico" sizes="32x32"><link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-icon.png"><link rel="manifest" href="/manifest.webmanifest">"#.to_owned(),
            format!("<meta property=\"og:image\" content=\"{og_image}\">"),
            format!("<meta property=\"og:image:width\" content=\"{OG_IMAGE_WIDTH}\">"),
            format!("<meta property=\"og:image:height\" content=\"{OG_IMAGE_HEIGHT}\">"),
            format!(
                "<meta property=\"og:image:alt\" content=\"{}\">",
                escape_html(OG_IMAGE_ALT)
            ),
            "<meta name=\"twitter:card\" content=\"summary_large_image\">".to_string(),
            format!("<meta name=\"twitter:title\" content=\"{og_title}\">"),
            format!("<meta name=\"twitter:description\" content=\"{desc}\">"),
            format!("<meta name=\"twitter:image\" content=\"{og_image}\">"),
        ];
        if let Some(path) = &self.canonical_path {
            let abs = escape_html(&format!("{SITE_URL}{path}"));
            tags.push(format!("<link rel=\"canonical\" href=\"{abs}\">"));
            tags.push(format!("<meta property=\"og:url\" content=\"{abs}\">"));
        }
        if !self.index {
            tags.push("<meta name=\"robots\" content=\"noindex\">".to_string());
        }
        tags.join("\n    ")
    }
}

pub fn default_home_metadata(has_query: bool) -> PageMetadata {
    if has_query {
        PageMetadata::noindex(
            format!("{SITE_NAME} — Climbing Logbook & Crag Database"),
            SITE_DESCRIPTION,
        )
    } else {
        PageMetadata::indexable(
            format!("{SITE_NAME} — Climbing Logbook & Crag Database"),
            SITE_DESCRIPTION,
            "/",
            "website",
        )
    }
}

pub fn location_trail(names: &[String], max: usize) -> String {
    let start = names.len().saturating_sub(max);
    names[start..].join(", ")
}

pub fn climb_title(
    name: &str,
    climb_type: ClimbType,
    grade: Option<i64>,
    area_name: &str,
) -> String {
    let grade_label = format_grade(climb_type, grade, GradePreferences::default());
    if grade_label == "—" {
        format!("{name} · {area_name}")
    } else {
        format!("{name} · {grade_label} · {area_name}")
    }
}

pub fn climb_description(
    name: &str,
    climb_type: ClimbType,
    grade: Option<i64>,
    description: Option<&str>,
    trail: &str,
) -> String {
    let grade_label = format_grade(climb_type, grade, GradePreferences::default());
    let grade_part = if grade_label == "—" {
        String::new()
    } else {
        format!("{grade_label} ")
    };
    let discipline = match climb_type {
        ClimbType::Boulder => "boulder problem",
        ClimbType::Sport => "sport route",
        ClimbType::Trad => "trad route",
    };
    let where_part = if trail.is_empty() {
        String::new()
    } else {
        format!(" in {trail}")
    };
    let detail = description.map(str::trim).filter(|s| !s.is_empty());
    match detail {
        Some(text) => format!("{name} is a {grade_part}{discipline}{where_part}. {text}"),
        None => format!(
            "{name} is a {grade_part}{discipline}{where_part}. Community rating and logged ascents on {SITE_NAME}."
        ),
    }
}

pub fn area_title(name: &str, parent_name: Option<&str>) -> String {
    match parent_name {
        Some(parent) => format!("{name} climbing · {parent}"),
        None => format!("{name} climbing"),
    }
}

pub fn area_description(name: &str, trail: &str, description: Option<&str>) -> String {
    let where_part = if trail.is_empty() {
        name.to_string()
    } else {
        format!("{name}, {trail}")
    };
    let detail = description.map(str::trim).filter(|s| !s.is_empty());
    match detail {
        Some(text) => format!("Explore climbing in {where_part}. {text}"),
        None => {
            format!("Explore climbing in {where_part}. Routes and boulder problems on {SITE_NAME}.")
        }
    }
}

pub fn breadcrumb_json_ld(crumbs: &[Crumb]) -> Value {
    let items: Vec<Value> = crumbs
        .iter()
        .enumerate()
        .map(|(idx, c)| {
            json!({
                "@type": "ListItem",
                "position": idx + 1,
                "name": c.name,
                "item": format!("{SITE_URL}{}", c.path),
            })
        })
        .collect();
    json!({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": items,
    })
}

pub fn website_json_ld() -> Value {
    json!({
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": SITE_NAME,
        "url": SITE_URL,
        "potentialAction": {
            "@type": "SearchAction",
            "target": {
                "@type": "EntryPoint",
                "urlTemplate": format!("{SITE_URL}/?name={{search_term_string}}"),
            },
            "query-input": "required name=search_term_string",
        },
    })
}

fn contained_in_place(ancestor_names: &[String]) -> Option<Value> {
    let mut place: Option<Value> = None;
    for name in ancestor_names {
        let mut obj = serde_json::Map::new();
        obj.insert("@type".to_string(), Value::String("Place".to_string()));
        obj.insert("name".to_string(), Value::String(name.clone()));
        if let Some(parent) = place {
            obj.insert("containedInPlace".to_string(), parent);
        }
        place = Some(Value::Object(obj));
    }
    place
}

pub fn area_json_ld(
    name: &str,
    path: &str,
    description: &str,
    crumbs: &[Crumb],
    ancestor_names: &[String],
) -> Vec<Value> {
    let mut place = serde_json::Map::new();
    place.insert(
        "@context".to_string(),
        Value::String("https://schema.org".to_string()),
    );
    place.insert("@type".to_string(), Value::String("Place".to_string()));
    place.insert("name".to_string(), Value::String(name.to_string()));
    place.insert(
        "url".to_string(),
        Value::String(format!("{SITE_URL}{path}")),
    );
    place.insert(
        "description".to_string(),
        Value::String(description.to_string()),
    );
    if let Some(parent) = contained_in_place(ancestor_names) {
        place.insert("containedInPlace".to_string(), parent);
    }
    vec![breadcrumb_json_ld(crumbs), Value::Object(place)]
}

pub fn climb_json_ld(name: &str, path: &str, description: &str, crumbs: &[Crumb]) -> Vec<Value> {
    vec![
        breadcrumb_json_ld(crumbs),
        json!({
            "@context": "https://schema.org",
            "@type": "WebPage",
            "name": name,
            "url": format!("{SITE_URL}{path}"),
            "description": description,
            "isPartOf": {
                "@type": "WebSite",
                "name": SITE_NAME,
                "url": SITE_URL,
            },
        }),
    ]
}

pub fn render_json_ld_scripts<T: Serialize>(nodes: &[T]) -> String {
    nodes
        .iter()
        .filter_map(|node| serde_json::to_string(node).ok())
        .map(|raw| {
            format!(
                "<script type=\"application/ld+json\">{}</script>",
                escape_json_for_script(&raw)
            )
        })
        .collect::<Vec<_>>()
        .join("\n    ")
}

pub fn render_robots_txt() -> String {
    format!(
        "User-agent: *\nDisallow: /sign-in\nDisallow: /sign-up\nDisallow: /?\nDisallow: /search?\nDisallow: /areas/*?\nDisallow: /api/public/search/\nSitemap: {SITE_URL}/sitemap-index.xml\n"
    )
}

pub fn sitemap_static_urls() -> Vec<String> {
    let mut paths: Vec<String> = vec![String::new()];
    for path in LANDING_PAGE_PATHS {
        paths.push(path.to_string());
    }
    paths.push("/about".to_string());
    paths.push("/contact".to_string());
    paths.push("/terms".to_string());
    for entry in TERMS_VERSIONS {
        paths.push(terms_href(entry.version));
    }
    paths
        .into_iter()
        .map(|p| format!("{SITE_URL}{p}"))
        .collect()
}

pub fn render_sitemap_index(active_shards: usize) -> String {
    let mut entries = String::new();
    for id in 0..active_shards {
        entries.push_str(&format!(
            "  <sitemap><loc>{SITE_URL}/sitemap/{id}.xml</loc></sitemap>\n"
        ));
    }
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<sitemapindex xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n{entries}</sitemapindex>\n"
    )
}

pub fn render_sitemap_urlset(urls: &[String]) -> String {
    let mut entries = String::new();
    for url in urls {
        entries.push_str(&format!("  <url><loc>{}</loc></url>\n", escape_html(url)));
    }
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n{entries}</urlset>\n"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_climb_and_area_metadata_without_ratings() {
        assert_eq!(
            climb_title("Superfly", ClimbType::Boulder, Some(10), "Grand Wall"),
            "Superfly · V9 · Grand Wall"
        );
        let desc = climb_description(
            "Superfly",
            ClimbType::Boulder,
            Some(10),
            None,
            "Squamish, Grand Wall",
        );
        assert!(desc.contains("V9 boulder problem in Squamish, Grand Wall."));
        assert_eq!(
            area_title("Grand Wall", Some("Squamish")),
            "Grand Wall climbing · Squamish"
        );
    }

    #[test]
    fn escapes_script_breakout_in_json_ld() {
        let scripts =
            render_json_ld_scripts(&[json!({ "name": "</script><script>alert(1)</script>" })]);
        assert!(!scripts.contains("</script><script>"));
        assert!(scripts.contains("\\u003c/script\\u003e"));
    }

    #[test]
    fn renders_robots_and_sitemaps() {
        let robots = render_robots_txt();
        assert!(robots.contains("Disallow: /api/public/search/"));
        assert!(robots.contains("Sitemap: https://betabook.ca/sitemap-index.xml"));
        assert!(sitemap_static_urls().contains(&"https://betabook.ca".to_string()));
        assert!(render_sitemap_index(2).contains("/sitemap/1.xml"));
    }
}
