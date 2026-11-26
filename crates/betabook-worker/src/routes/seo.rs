use axum::{
    body::Body,
    extract::{OriginalUri, Path, State},
    http::{Method, Request as HttpRequest, StatusCode, header},
    response::Response,
};
use betabook_db::public_catalog::{
    count_areas, count_climbs, get_area_sitemap_rows, get_climb_sitemap_rows, get_public_area,
    get_public_area_trail, get_public_climb,
};
use betabook_domain::public_catalog::parse_id;
use betabook_domain::seo::{
    Crumb, PageMetadata, area_description, area_json_ld, area_title, climb_description,
    climb_json_ld, climb_title, default_home_metadata, location_trail, render_sitemap_index,
    render_sitemap_urlset, sitemap_static_urls, website_json_ld,
};
use betabook_domain::seo::{render_json_ld_scripts, render_robots_txt};
use betabook_domain::site::{SITE_DESCRIPTION, SITE_NAME, SITE_URL};
use betabook_domain::slug::{area_href, climb_href, slugify};
use serde_json::Value;

use crate::state::{ApiError, AppState};

const SITEMAP_SHARD_SIZE: usize = 40_000;
const HEAD_PLACEHOLDER: &str = "<!--BETABOOK_HEAD-->";
const JSONLD_PLACEHOLDER: &str = "<!--BETABOOK_JSONLD-->";

fn fallback_shell_html() -> &'static str {
    "<!doctype html>
<html lang=\"en\">
  <head>
    <meta charset=\"utf-8\">
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
    <!--BETABOOK_HEAD-->
    <!--BETABOOK_JSONLD-->
  </head>
  <body>
    <div id=\"root\"></div>
  </body>
</html>
"
}

async fn load_index_html(state: &AppState) -> Result<String, ApiError> {
    if let Ok(assets) = state.env().assets("ASSETS") {
        let req = HttpRequest::builder()
            .method(Method::GET)
            .uri(format!(
                "{}/index.html",
                state.request_origin.trim_end_matches('/')
            ))
            .body(worker::Body::empty())
            .map_err(ApiError::internal)?;
        if let Ok(resp) = assets.fetch_request(req).await
            && resp.status().is_success()
        {
            let mut worker_resp = worker::Response::try_from(resp).map_err(ApiError::internal)?;
            if let Ok(html) = worker_resp.text().await {
                return Ok(html);
            }
        }
    }
    Ok(fallback_shell_html().to_string())
}

fn inject_seo_into_html(template: &str, meta: &PageMetadata, json_ld: &[Value]) -> String {
    let head = meta.render_head_tags();
    let scripts = render_json_ld_scripts(json_ld);
    let with_head = if template.contains(HEAD_PLACEHOLDER) {
        template.replace(HEAD_PLACEHOLDER, &head)
    } else {
        template.replace("</head>", &format!("    {head}\n  </head>"))
    };
    if with_head.contains(JSONLD_PLACEHOLDER) {
        with_head.replace(JSONLD_PLACEHOLDER, &scripts)
    } else {
        with_head.replace("</head>", &format!("    {scripts}\n  </head>"))
    }
}

fn html_response(status: StatusCode, html: String) -> Response {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .body(Body::from(html))
        .unwrap()
}

fn permanent_redirect(path: &str, raw_query: Option<&str>) -> Response {
    let location = match raw_query {
        Some(q) if !q.is_empty() => format!("{path}?{q}"),
        _ => path.to_string(),
    };
    Response::builder()
        .status(StatusCode::PERMANENT_REDIRECT)
        .header(header::LOCATION, location)
        .body(Body::empty())
        .unwrap()
}

fn canonical_slug_matches(provided: Option<&str>, expected_slug: &str) -> bool {
    match provided {
        None => expected_slug.is_empty(),
        Some(raw) => !expected_slug.is_empty() && raw == expected_slug,
    }
}

#[worker::send]
pub async fn robots_txt() -> Response {
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(Body::from(render_robots_txt()))
        .unwrap()
}

#[worker::send]
pub async fn sitemap_index(State(state): State<AppState>) -> Result<Response, ApiError> {
    let areas = count_areas(state.db()).await?;
    let climbs = count_climbs(state.db()).await?;
    let area_shards = areas.div_ceil(SITEMAP_SHARD_SIZE).max(1);
    let climb_shards = climbs.div_ceil(SITEMAP_SHARD_SIZE);
    let xml = render_sitemap_index(area_shards + climb_shards);
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/xml; charset=utf-8")
        .body(Body::from(xml))
        .unwrap())
}

#[worker::send]
pub async fn sitemap_shard(
    State(state): State<AppState>,
    Path(raw_shard): Path<String>,
) -> Result<Response, ApiError> {
    let shard_num = raw_shard
        .strip_suffix(".xml")
        .and_then(|s| s.parse::<usize>().ok());
    let Some(shard) = shard_num else {
        return Ok(Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from("Not found"))
            .unwrap());
    };

    let areas = count_areas(state.db()).await?;
    let climbs = count_climbs(state.db()).await?;
    let area_shards = areas.div_ceil(SITEMAP_SHARD_SIZE).max(1);
    let climb_shards = climbs.div_ceil(SITEMAP_SHARD_SIZE);

    let urls = if shard >= area_shards + climb_shards {
        Vec::new()
    } else if shard < area_shards {
        let rows =
            get_area_sitemap_rows(state.db(), SITEMAP_SHARD_SIZE, shard * SITEMAP_SHARD_SIZE)
                .await?;
        let mut entries: Vec<String> = if shard == 0 {
            sitemap_static_urls()
        } else {
            Vec::new()
        };
        entries.extend(
            rows.into_iter()
                .map(|r| format!("{SITE_URL}{}", area_href(r.id, &r.name))),
        );
        entries
    } else {
        let climb_offset = (shard - area_shards) * SITEMAP_SHARD_SIZE;
        let rows = get_climb_sitemap_rows(state.db(), SITEMAP_SHARD_SIZE, climb_offset).await?;
        rows.into_iter()
            .map(|r| format!("{SITE_URL}{}", climb_href(r.id, &r.name)))
            .collect()
    };

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/xml; charset=utf-8")
        .body(Body::from(render_sitemap_urlset(&urls)))
        .unwrap())
}

async fn render_area_page(
    state: State<AppState>,
    raw_id: String,
    provided_slug: Option<String>,
    uri: http::Uri,
) -> Result<Response, ApiError> {
    let Some(id) = parse_id(&raw_id) else {
        return render_not_found(&state).await;
    };
    let Some(area) = get_public_area(state.db(), id).await? else {
        return render_not_found(&state).await;
    };
    let expected_slug = slugify(&area.name);
    if !canonical_slug_matches(provided_slug.as_deref(), &expected_slug) {
        return Ok(permanent_redirect(
            &area_href(area.id, &area.name),
            uri.query(),
        ));
    }

    let trail = get_public_area_trail(state.db(), id).await?;
    let ancestors: Vec<_> = trail.iter().take(trail.len().saturating_sub(1)).collect();
    let parent_name = ancestors.last().map(|a| a.name.as_str());
    let ancestor_names: Vec<String> = ancestors.iter().map(|a| a.name.clone()).collect();
    let short_trail = location_trail(&ancestor_names, 3);
    let title = area_title(&area.name, parent_name);
    let desc = area_description(&area.name, &short_trail, area.description.as_deref());
    let canonical = area_href(area.id, &area.name);

    let has_query = uri.query().is_some_and(|q| !q.is_empty());
    let mut meta = PageMetadata::indexable(title, desc.clone(), canonical.clone(), "website");
    if has_query {
        meta.index = false;
    }

    let mut crumbs: Vec<Crumb> = vec![Crumb {
        name: SITE_NAME.to_string(),
        path: String::new(),
    }];
    crumbs.extend(trail.iter().map(|a| Crumb {
        name: a.name.clone(),
        path: area_href(a.id, &a.name),
    }));
    let json_ld = area_json_ld(&area.name, &canonical, &desc, &crumbs, &ancestor_names);

    let html = inject_seo_into_html(&load_index_html(&state).await?, &meta, &json_ld);
    Ok(html_response(StatusCode::OK, html))
}

#[worker::send]
pub async fn area_page(
    state: State<AppState>,
    Path(raw_id): Path<String>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    render_area_page(state, raw_id, None, uri).await
}

#[worker::send]
pub async fn area_page_with_slug(
    state: State<AppState>,
    Path((raw_id, slug)): Path<(String, String)>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    render_area_page(state, raw_id, Some(slug), uri).await
}

async fn render_climb_page(
    state: State<AppState>,
    raw_id: String,
    provided_slug: Option<String>,
    uri: http::Uri,
) -> Result<Response, ApiError> {
    let Some(id) = parse_id(&raw_id) else {
        return render_not_found(&state).await;
    };
    let Some(climb) = get_public_climb(state.db(), id).await? else {
        return render_not_found(&state).await;
    };
    let expected_slug = slugify(&climb.name);
    if !canonical_slug_matches(provided_slug.as_deref(), &expected_slug) {
        return Ok(permanent_redirect(
            &climb_href(climb.id, &climb.name),
            uri.query(),
        ));
    }

    let trail = get_public_area_trail(state.db(), climb.area_id).await?;
    let area_names: Vec<String> = trail.iter().map(|a| a.name.clone()).collect();
    let short_trail = location_trail(&area_names, 3);
    let title = climb_title(&climb.name, climb.climb_type, climb.grade, &climb.area_name);
    let desc = climb_description(
        &climb.name,
        climb.climb_type,
        climb.grade,
        climb.description.as_deref(),
        &short_trail,
    );
    let canonical = climb_href(climb.id, &climb.name);
    let meta = PageMetadata::indexable(title, desc.clone(), canonical.clone(), "article");

    let mut crumbs: Vec<Crumb> = vec![Crumb {
        name: SITE_NAME.to_string(),
        path: String::new(),
    }];
    crumbs.extend(trail.iter().map(|a| Crumb {
        name: a.name.clone(),
        path: area_href(a.id, &a.name),
    }));
    crumbs.push(Crumb {
        name: climb.name.clone(),
        path: canonical.clone(),
    });
    let json_ld = climb_json_ld(&climb.name, &canonical, &desc, &crumbs);

    let html = inject_seo_into_html(&load_index_html(&state).await?, &meta, &json_ld);
    Ok(html_response(StatusCode::OK, html))
}

#[worker::send]
pub async fn climb_page(
    state: State<AppState>,
    Path(raw_id): Path<String>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    render_climb_page(state, raw_id, None, uri).await
}

#[worker::send]
pub async fn climb_page_with_slug(
    state: State<AppState>,
    Path((raw_id, slug)): Path<(String, String)>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    render_climb_page(state, raw_id, Some(slug), uri).await
}

async fn render_not_found(state: &AppState) -> Result<Response, ApiError> {
    let meta = PageMetadata::noindex("Not found", SITE_DESCRIPTION);
    let html = inject_seo_into_html(&load_index_html(state).await?, &meta, &[]);
    Ok(html_response(StatusCode::NOT_FOUND, html))
}

fn route_metadata(path: &str, has_query: bool) -> (PageMetadata, Vec<Value>) {
    match path {
        "/" => (default_home_metadata(has_query), vec![website_json_ld()]),
        "/about" => (
            PageMetadata::indexable(
                "About Betabook",
                "About Betabook, an open climbing logbook and crag database.",
                "/about",
                "website",
            ),
            Vec::new(),
        ),
        "/contact" => (
            PageMetadata::indexable(
                "Contact",
                "Contact the Betabook maintainers.",
                "/contact",
                "website",
            ),
            Vec::new(),
        ),
        "/terms" => (
            PageMetadata::indexable(
                "Terms of Service",
                "Betabook Terms of Service.",
                "/terms",
                "website",
            ),
            Vec::new(),
        ),
        "/climbing-logbook" => (
            PageMetadata::indexable(
                "Climbing Logbook Features",
                "Sends, journal, projects, analytics and friends on Betabook.",
                "/climbing-logbook",
                "website",
            ),
            Vec::new(),
        ),
        "/kaya-import" => (
            PageMetadata::indexable(
                "Import from KAYA",
                "Import your KAYA climbing profile or CSV export into Betabook.",
                "/kaya-import",
                "website",
            ),
            Vec::new(),
        ),
        "/sendage-import" => (
            PageMetadata::indexable(
                "Import from Sendage",
                "Import your Sendage climbing profile or CSV export into Betabook.",
                "/sendage-import",
                "website",
            ),
            Vec::new(),
        ),
        "/mountain-project-import" => (
            PageMetadata::indexable(
                "Import from Mountain Project",
                "Import your Mountain Project ticks or CSV export into Betabook.",
                "/mountain-project-import",
                "website",
            ),
            Vec::new(),
        ),
        "/costs" => (
            PageMetadata::indexable(
                "Cost Transparency",
                "This month's Cloudflare usage and what Betabook costs to run.",
                "/costs",
                "website",
            ),
            Vec::new(),
        ),
        _ => (
            PageMetadata::noindex(SITE_NAME, SITE_DESCRIPTION),
            Vec::new(),
        ),
    }
}

#[worker::send]
pub async fn spa_fallback(
    State(state): State<AppState>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let path = uri.path();
    if path.starts_with("/api/") {
        return Ok(Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::CACHE_CONTROL, "private, no-store")
            .body(Body::from("{\"error\":\"Not found\"}"))
            .unwrap());
    }

    if let Ok(assets) = state.env().assets("ASSETS") {
        // Non-HTML asset requests (chunks, fonts, images) pass straight through ASSETS.
        let looks_like_asset = path.rsplit('/').next().is_some_and(|seg| seg.contains('.'))
            && !path.ends_with(".html");
        if looks_like_asset {
            let asset_req = HttpRequest::builder()
                .method(Method::GET)
                .uri(format!(
                    "{}{}",
                    state.request_origin.trim_end_matches('/'),
                    uri.path_and_query().map(|pq| pq.as_str()).unwrap_or(path)
                ))
                .body(worker::Body::empty())
                .map_err(ApiError::internal)?;
            if let Ok(resp) = assets.fetch_request(asset_req).await {
                let status = resp.status();
                let mut worker_resp =
                    worker::Response::try_from(resp).map_err(ApiError::internal)?;
                let mut builder = Response::builder().status(status);
                for (name, val) in worker_resp.headers().entries() {
                    builder = builder.header(name, val);
                }
                let bytes = worker_resp.bytes().await?;
                return Ok(builder.body(Body::from(bytes)).unwrap());
            }
        }
    }

    let has_query = uri.query().is_some_and(|q| !q.is_empty());
    let (meta, json_ld) = route_metadata(path, has_query);
    let html = inject_seo_into_html(&load_index_html(&state).await?, &meta, &json_ld);
    Ok(html_response(StatusCode::OK, html))
}
