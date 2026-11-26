use std::collections::BTreeMap;

use axum::{
    body::Body,
    extract::{OriginalUri, Path, State},
    http::{Method, Request as HttpRequest, StatusCode, header},
    response::{IntoResponse, Response},
};
use betabook_db::public_catalog::{
    count_areas, count_climbs, get_area_sitemap_rows, get_climb_sitemap_rows, get_public_area,
    get_public_area_trail, get_public_climb, get_public_sends_for_climb, get_public_subareas,
    resolve_public_subarea, search_public_climbs,
};
use betabook_db::social::{CLIMB_VIDEO_LIMIT, get_climb_videos};
use betabook_domain::public_catalog::{
    PublicArea, has_protected_catalog_params, parse_id, parse_public_catalog_options,
};
use betabook_domain::seo::{
    Crumb, PageMetadata, area_description, area_json_ld, area_title, climb_description,
    climb_json_ld, climb_title, default_home_metadata, escape_html, escape_json_for_script,
    location_trail, render_json_ld_scripts, render_robots_txt, render_sitemap_index,
    render_sitemap_urlset, sitemap_static_urls, website_json_ld,
};
use betabook_domain::site::{SITE_DESCRIPTION, SITE_NAME, SITE_URL};
use betabook_domain::slug::{area_href, climb_href, slugify};
use serde::Deserialize;
use serde_json::{Value, json};
use url::form_urlencoded;

use crate::state::{ApiError, AppState};

const SITEMAP_SHARD_SIZE: usize = 40_000;
const HEAD_PLACEHOLDER: &str = "<!--BETABOOK_HEAD-->";
const JSONLD_PLACEHOLDER: &str = "<!--BETABOOK_JSONLD-->";
const PRELOAD_PLACEHOLDER: &str = "<!--BETABOOK_PRELOAD-->";
const DATA_PLACEHOLDER: &str = "<!--BETABOOK_DATA-->";

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct SpaManifestEntry {
    pub file: String,
    #[serde(default)]
    pub css: Vec<String>,
    #[serde(default)]
    pub imports: Vec<String>,
}

fn fallback_shell_html() -> &'static str {
    "<!doctype html>
<html lang=\"en\">
  <head>
    <meta charset=\"utf-8\">
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
    <!--BETABOOK_HEAD-->
    <!--BETABOOK_JSONLD-->
    <!--BETABOOK_PRELOAD-->
  </head>
  <body>
    <div id=\"root\"></div>
    <!--BETABOOK_DATA-->
  </body>
</html>
"
}

async fn load_asset_text(state: &AppState, asset_path: &str) -> Result<Option<String>, ApiError> {
    let Ok(assets) = state.env().assets("ASSETS") else {
        return Ok(None);
    };
    let req = HttpRequest::builder()
        .method(Method::GET)
        .uri(format!(
            "{}{}",
            state.request_origin.trim_end_matches('/'),
            asset_path
        ))
        .body(worker::Body::empty())
        .map_err(ApiError::internal)?;
    if let Ok(resp) = assets.fetch_request(req).await
        && resp.status().is_success()
    {
        let mut worker_resp = worker::Response::try_from(resp).map_err(ApiError::internal)?;
        if let Ok(text) = worker_resp.text().await {
            return Ok(Some(text));
        }
    }
    Ok(None)
}

pub(crate) async fn load_spa_manifest(
    state: &AppState,
) -> Result<BTreeMap<String, SpaManifestEntry>, ApiError> {
    let Some(raw) = load_asset_text(state, "/spa-manifest.json").await? else {
        return Ok(BTreeMap::new());
    };
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

pub(crate) fn primary_stylesheet_href(
    manifest: &BTreeMap<String, SpaManifestEntry>,
) -> Option<String> {
    manifest
        .get("index.html")
        .and_then(|entry| entry.css.first())
        .map(|file| format!("/{file}"))
}

fn render_modulepreload_tags(
    manifest: &BTreeMap<String, SpaManifestEntry>,
    entry_key: &str,
) -> String {
    let mut visited = std::collections::BTreeSet::new();
    let mut stack = vec![entry_key.to_string()];
    let mut files = std::collections::BTreeSet::new();

    while let Some(key) = stack.pop() {
        if !visited.insert(key.clone()) {
            continue;
        }
        let Some(entry) = manifest.get(&key) else {
            continue;
        };
        if key != "index.html" {
            files.insert(format!("/{}", entry.file));
        }
        for dep in &entry.imports {
            if !visited.contains(dep) {
                stack.push(dep.clone());
            }
        }
    }

    files
        .into_iter()
        .map(|href| {
            format!(
                "<link rel=\"modulepreload\" href=\"{}\">",
                escape_html(&href)
            )
        })
        .collect::<Vec<_>>()
        .join("\n    ")
}

async fn load_index_html(state: &AppState) -> Result<String, ApiError> {
    Ok(load_asset_text(state, "/index.html")
        .await?
        .unwrap_or_else(|| fallback_shell_html().to_string()))
}

fn render_bootstrap_script(data: Option<&Value>) -> String {
    let Some(payload) = data else {
        return String::new();
    };
    let json = serde_json::to_string(payload).unwrap_or_else(|_| "null".to_string());
    format!(
        "<script id=\"__BETABOOK_DATA__\" type=\"application/json\">{}</script>",
        escape_json_for_script(&json)
    )
}

fn replace_or_insert_before(
    html: String,
    placeholder: &str,
    replacement: &str,
    tag: &str,
) -> String {
    if html.contains(placeholder) {
        html.replace(placeholder, replacement)
    } else if replacement.is_empty() {
        html
    } else {
        html.replace(tag, &format!("    {replacement}\n  {tag}"))
    }
}

fn inject_seo_into_html(
    template: &str,
    meta: &PageMetadata,
    json_ld: &[Value],
    preload_tags: &str,
    bootstrap_data: Option<&Value>,
) -> String {
    let head = meta.render_head_tags();
    let scripts = render_json_ld_scripts(json_ld);
    let data_script = render_bootstrap_script(bootstrap_data);

    let html = replace_or_insert_before(template.to_string(), HEAD_PLACEHOLDER, &head, "</head>");
    let html = replace_or_insert_before(html, JSONLD_PLACEHOLDER, &scripts, "</head>");
    let html = replace_or_insert_before(html, PRELOAD_PLACEHOLDER, preload_tags, "</head>");
    replace_or_insert_before(html, DATA_PLACEHOLDER, &data_script, "</body>")
}

fn html_response(status: StatusCode, html: String) -> Response {
    (
        status,
        [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
        Body::from(html),
    )
        .into_response()
}

fn permanent_redirect(path: &str, raw_query: Option<&str>) -> Response {
    let location = match raw_query {
        Some(q) if !q.is_empty() => format!("{path}?{q}"),
        _ => path.to_string(),
    };
    (
        StatusCode::PERMANENT_REDIRECT,
        [(header::LOCATION, location)],
        Body::empty(),
    )
        .into_response()
}

fn canonical_slug_matches(provided: Option<&str>, expected_slug: &str) -> bool {
    match provided {
        None => expected_slug.is_empty(),
        Some(raw) => !expected_slug.is_empty() && raw == expected_slug,
    }
}

#[worker::send]
pub async fn robots_txt() -> Response {
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
        Body::from(render_robots_txt()),
    )
        .into_response()
}

#[worker::send]
pub async fn sitemap_index(State(state): State<AppState>) -> Result<Response, ApiError> {
    let areas = count_areas(state.db()).await?;
    let climbs = count_climbs(state.db()).await?;
    let area_shards = areas.div_ceil(SITEMAP_SHARD_SIZE).max(1);
    let climb_shards = climbs.div_ceil(SITEMAP_SHARD_SIZE);
    let xml = render_sitemap_index(area_shards + climb_shards);
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/xml; charset=utf-8")
        .body(Body::from(xml))
        .map_err(ApiError::internal)
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
        return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from("Not found"))
            .map_err(ApiError::internal);
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

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/xml; charset=utf-8")
        .body(Body::from(render_sitemap_urlset(&urls)))
        .map_err(ApiError::internal)
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

    let raw_query = uri.query().unwrap_or("");
    let subarea_param = form_urlencoded::parse(raw_query.as_bytes())
        .find(|(k, _)| k == "subarea")
        .and_then(|(_, v)| parse_id(&v));

    let trail = get_public_area_trail(state.db(), id).await?;
    let subareas = get_public_subareas(state.db(), id).await?;
    let scope = resolve_public_subarea(
        state.db(),
        &PublicArea {
            id: area.id,
            name: area.name.clone(),
            parent_id: area.parent_id,
        },
        subarea_param,
    )
    .await?;

    let canonical = area_href(area.id, &area.name);
    let ancestors: Vec<_> = trail.iter().take(trail.len().saturating_sub(1)).collect();

    let bootstrap_data = if has_protected_catalog_params(raw_query, true) {
        None
    } else {
        let mut options = parse_public_catalog_options(raw_query);
        options.area_id = Some(scope.id);
        let climbs_page = search_public_climbs(state.db(), &options).await?;
        Some(json!({
            "route": "area",
            "path": canonical,
            "query": raw_query,
            "data": {
                "areaId": area.id,
                "area": area,
                "ancestors": ancestors,
                "subareas": subareas,
                "climbsPage": climbs_page,
            }
        }))
    };

    let parent_name = ancestors.last().map(|a| a.name.as_str());
    let ancestor_names: Vec<String> = ancestors.iter().map(|a| a.name.clone()).collect();
    let short_trail = location_trail(&ancestor_names, 3);
    let title = area_title(&area.name, parent_name);
    let desc = area_description(&area.name, &short_trail, area.description.as_deref());

    let has_query = !raw_query.is_empty();
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

    let manifest = load_spa_manifest(&state).await?;
    let preload_tags = render_modulepreload_tags(&manifest, "routes/area-route.tsx");
    let html = inject_seo_into_html(
        &load_index_html(&state).await?,
        &meta,
        &json_ld,
        &preload_tags,
        bootstrap_data.as_ref(),
    );
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
    let public_sends = get_public_sends_for_climb(state.db(), id).await?;
    let videos = get_climb_videos(state.db(), id, None, CLIMB_VIDEO_LIMIT).await?;

    let area = trail.last().cloned();
    let ancestors = &trail[..trail.len().saturating_sub(1)];

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

    let bootstrap_data = json!({
        "route": "climb",
        "path": canonical,
        "data": {
            "climbId": climb.id,
            "climb": climb,
            "area": area,
            "ancestors": ancestors,
            "publicSends": public_sends,
            "videos": videos,
        }
    });

    let manifest = load_spa_manifest(&state).await?;
    let preload_tags = render_modulepreload_tags(&manifest, "routes/climb-route.tsx");
    let html = inject_seo_into_html(
        &load_index_html(&state).await?,
        &meta,
        &json_ld,
        &preload_tags,
        Some(&bootstrap_data),
    );
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
    let html = inject_seo_into_html(&load_index_html(state).await?, &meta, &[], "", None);
    Ok(html_response(StatusCode::NOT_FOUND, html))
}

#[worker::send]
pub async fn shared_project_page(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<Response, ApiError> {
    use betabook_db::projects::SharedAccess;
    let access = super::projects::resolve_link(&state, &token).await?;
    let (status, meta) = match &access {
        SharedAccess::Visible { project, .. } => {
            let name = &project.owner_name;
            let climb = project.climb_name();
            let (title, description) = if project.sent {
                (
                    format!("{name} sent {climb}"),
                    format!(
                        "See the sessions behind {name}'s ascent of {climb} on {SITE_NAME}, a climbing logbook and crag database."
                    ),
                )
            } else {
                (
                    format!("{name} is projecting {climb}"),
                    format!(
                        "Follow {name}'s progress on {climb} on {SITE_NAME}, a climbing logbook and crag database."
                    ),
                )
            };
            let mut meta = PageMetadata::noindex(title, description);
            meta.og_type = "article";
            (StatusCode::OK, meta)
        }
        SharedAccess::Expired => (
            StatusCode::OK,
            PageMetadata::noindex("Shared project", SITE_DESCRIPTION),
        ),
        SharedAccess::Hidden => (
            StatusCode::NOT_FOUND,
            PageMetadata::noindex("Shared project", SITE_DESCRIPTION),
        ),
    };
    let data =
        json!({"route":"shared-project", "path":format!("/projects/{token}"), "data":access});
    render_project_shell(&state, &meta, status, Some(&data)).await
}

#[worker::send]
pub async fn owner_project_page(
    State(state): State<AppState>,
    headers: http::HeaderMap,
    Path(owner): Path<String>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let session = crate::auth::session::resolve_optional_session(&state, &headers).await?;
    let member = session.filter(|s| {
        betabook_domain::terms::has_accepted_current_terms(
            s.user.terms_version.as_deref(),
            s.user.terms_accepted_at,
        )
    });
    let (status, title) = match member {
        None => (StatusCode::OK, "Member content".to_owned()),
        Some(s) if s.user.id == owner => {
            let label = if uri.path().ends_with("/sent") {
                "Sent projects"
            } else {
                "Projects"
            };
            (StatusCode::OK, format!("{} · {label}", s.user.name))
        }
        Some(_) => (StatusCode::NOT_FOUND, "Not found".to_owned()),
    };
    render_project_shell(
        &state,
        &PageMetadata::noindex(title, SITE_DESCRIPTION),
        status,
        None,
    )
    .await
}

async fn render_project_shell(
    state: &AppState,
    meta: &PageMetadata,
    status: StatusCode,
    bootstrap: Option<&Value>,
) -> Result<Response, ApiError> {
    let manifest = load_spa_manifest(state).await?;
    let preload = render_modulepreload_tags(&manifest, "routes/projects-route.tsx");
    let html = inject_seo_into_html(
        &load_index_html(state).await?,
        meta,
        &[],
        &preload,
        bootstrap,
    );
    let mut response = html_response(status, html);
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        http::HeaderValue::from_static("private, no-store"),
    );
    Ok(response)
}

#[worker::send]
pub async fn shared_list_html(
    State(state): State<AppState>,
    headers: http::HeaderMap,
    Path(raw): Path<String>,
) -> Result<Response, ApiError> {
    let Some(token) = betabook_domain::profile_share::parse_share_token(&raw) else {
        return render_not_found(&state).await;
    };
    let Some(link) = betabook_db::climb_lists::shared_list(state.db(), token).await? else {
        return render_not_found(&state).await;
    };
    if super::climb_lists::shared_viewer(&state, &headers)
        .await?
        .as_deref()
        == Some(link.owner_id.as_str())
    {
        let mut url = url::Url::parse(&state.request_origin).map_err(ApiError::internal)?;
        url.path_segments_mut()
            .map_err(|_| ApiError::internal("Invalid origin"))?
            .clear()
            .extend(["users", &link.owner_id, "lists", &link.list.id.to_string()]);
        return Response::builder()
            .status(StatusCode::TEMPORARY_REDIRECT)
            .header(header::LOCATION, url.path())
            .header(header::CACHE_CONTROL, "private, no-store")
            .body(Body::empty())
            .map_err(ApiError::internal);
    }
    let meta = if link.live {
        let mut meta = PageMetadata::noindex(
            format!("{} · {}", link.owner_name, link.list.title),
            format!(
                "See {}'s list of climbs on {SITE_NAME}, a climbing logbook and crag database.",
                link.owner_name
            ),
        );
        meta.og_type = "article";
        meta
    } else {
        PageMetadata::noindex("Shared list", SITE_DESCRIPTION)
    };
    render_list_shell(&state, StatusCode::OK, &meta).await
}

#[worker::send]
pub async fn member_list_html(
    State(state): State<AppState>,
    headers: http::HeaderMap,
    Path(params): Path<BTreeMap<String, String>>,
) -> Result<Response, ApiError> {
    let viewer = super::climb_lists::shared_viewer(&state, &headers).await?;
    let title = match viewer {
        None => Some("Member content".to_owned()),
        Some(viewer) => {
            let owner = params
                .get("id")
                .ok_or_else(|| ApiError::internal("Missing route owner"))?;
            match params.get("list_id") {
                Some(raw) => match parse_id(raw) {
                    Some(id) => {
                        betabook_db::climb_lists::member_page_title(
                            state.db(),
                            owner,
                            &viewer,
                            Some(id),
                        )
                        .await?
                    }
                    None => None,
                },
                None => {
                    betabook_db::climb_lists::member_page_title(state.db(), owner, &viewer, None)
                        .await?
                }
            }
        }
    };
    let (status, title) = match title {
        Some(title) => (StatusCode::OK, title),
        None => (StatusCode::NOT_FOUND, "Not found".to_owned()),
    };
    render_list_shell(
        &state,
        status,
        &PageMetadata::noindex(title, SITE_DESCRIPTION),
    )
    .await
}

async fn render_list_shell(
    state: &AppState,
    status: StatusCode,
    meta: &PageMetadata,
) -> Result<Response, ApiError> {
    let manifest = load_spa_manifest(state).await?;
    let preload = render_modulepreload_tags(&manifest, "routes/lists-route.tsx");
    let html = inject_seo_into_html(&load_index_html(state).await?, meta, &[], &preload, None);
    let mut response = html_response(status, html);
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        http::HeaderValue::from_static("private, no-store"),
    );
    Ok(response)
}

fn route_metadata(path: &str, has_query: bool) -> (PageMetadata, Vec<Value>, &'static str) {
    match path {
        "/" => (
            default_home_metadata(has_query),
            vec![website_json_ld()],
            "routes/home-route.tsx",
        ),
        "/search" => (
            PageMetadata::noindex("Find climbs", SITE_DESCRIPTION),
            Vec::new(),
            "routes/search-route.tsx",
        ),
        "/sign-in" => (
            PageMetadata::noindex("Sign in", SITE_DESCRIPTION),
            Vec::new(),
            "routes/auth-routes.tsx",
        ),
        "/sign-up" => (
            PageMetadata::noindex("Sign up", SITE_DESCRIPTION),
            Vec::new(),
            "routes/auth-routes.tsx",
        ),
        "/forgot-password" => (
            PageMetadata::noindex("Forgot password", SITE_DESCRIPTION),
            Vec::new(),
            "routes/auth-routes.tsx",
        ),
        "/reset-password" => (
            PageMetadata::noindex("Reset password", SITE_DESCRIPTION),
            Vec::new(),
            "routes/auth-routes.tsx",
        ),
        "/accept-terms" => (
            PageMetadata::noindex("Review the Terms of Service", SITE_DESCRIPTION),
            Vec::new(),
            "routes/auth-routes.tsx",
        ),
        "/contact" => (
            PageMetadata::indexable(
                "Contact us",
                "Report a wrong grade, a misplaced area or a bug, or send feedback about Betabook. No account needed.",
                "/contact",
                "website",
            ),
            Vec::new(),
            "routes/info-routes.tsx",
        ),
        "/climbing-logbook" => (
            PageMetadata::indexable(
                "Free climbing logbook",
                "A free climbing logbook for bouldering, sport and trad. Log sends and sessions, see your progression, and import from KAYA, Sendage or Mountain Project.",
                "/climbing-logbook",
                "website",
            ),
            Vec::new(),
            "routes/info-routes.tsx",
        ),
        "/kaya-import" => (
            PageMetadata::indexable(
                "Import your KAYA logbook",
                "Import outdoor boulders and routes into Betabook from a public KAYA profile or KAYA's CSV export.",
                "/kaya-import",
                "website",
            ),
            Vec::new(),
            "routes/info-routes.tsx",
        ),
        "/sendage-import" => (
            PageMetadata::indexable(
                "Import from Sendage",
                "Import your Sendage climbing profile or CSV export into Betabook.",
                "/sendage-import",
                "website",
            ),
            Vec::new(),
            "routes/info-routes.tsx",
        ),
        "/mountain-project-import" => (
            PageMetadata::indexable(
                "Import from Mountain Project",
                "Import your Mountain Project ticks or CSV export into Betabook.",
                "/mountain-project-import",
                "website",
            ),
            Vec::new(),
            "routes/info-routes.tsx",
        ),
        "/costs" => (
            PageMetadata::indexable(
                "Cost Transparency",
                "This month's Cloudflare usage and what Betabook costs to run.",
                "/costs",
                "website",
            ),
            Vec::new(),
            "routes/info-routes.tsx",
        ),
        _ => (
            PageMetadata::noindex(SITE_NAME, SITE_DESCRIPTION),
            Vec::new(),
            "routes/placeholder-route.tsx",
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
        return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::CACHE_CONTROL, "private, no-store")
            .body(Body::from("{\"error\":\"Not found\"}"))
            .map_err(ApiError::internal);
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
                return builder.body(Body::from(bytes)).map_err(ApiError::internal);
            }
        }
    }

    let raw_query = uri.query().unwrap_or("");
    let has_query = !raw_query.is_empty();
    let (meta, json_ld, chunk_key) = route_metadata(path, has_query);

    let bootstrap_data = if path == "/search" && !has_protected_catalog_params(raw_query, true) {
        let mode = form_urlencoded::parse(raw_query.as_bytes())
            .find(|(k, _)| k == "mode")
            .map(|(_, v)| v.into_owned());
        if matches!(mode.as_deref(), None | Some("climb")) {
            let options = parse_public_catalog_options(raw_query);
            let climbs_page = search_public_climbs(state.db(), &options).await?;
            Some(json!({
                "route": "search",
                "path": "/search",
                "query": raw_query,
                "data": {
                    "climbsPage": climbs_page,
                }
            }))
        } else {
            None
        }
    } else {
        None
    };

    let manifest = load_spa_manifest(&state).await?;
    let preload_tags = render_modulepreload_tags(&manifest, chunk_key);
    let html = inject_seo_into_html(
        &load_index_html(&state).await?,
        &meta,
        &json_ld,
        &preload_tags,
        bootstrap_data.as_ref(),
    );
    Ok(html_response(StatusCode::OK, html))
}
