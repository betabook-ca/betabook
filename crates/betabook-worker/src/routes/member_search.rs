use axum::{
    Json,
    extract::{OriginalUri, Path, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use betabook_db::fts::PAGE_SIZE;
use betabook_db::public_catalog::{
    get_area_breadcrumbs, get_public_area, resolve_public_subarea, search_public_areas,
    search_public_climbs,
};
use betabook_db::social::{
    AREA_SEARCH_PAGE_SIZE, CLIMBERS_PAGE_SIZE, FRIENDS_PAGE_SIZE, get_climb_send_stats,
    get_climber_suggestions, get_climbers_page, get_friends_page, get_pending_friend_request_count,
    get_user_sent_climb_ids,
};
use betabook_domain::public_catalog::{
    DEFAULT_PUBLIC_PAGE_SIZE, MAX_PAGINATION_OFFSET, PublicArea, parse_id,
    parse_member_catalog_options,
};
use serde_json::{Value, json};
use url::form_urlencoded;

use crate::auth::session::require_member_session;
use crate::state::{ApiError, AppState};

fn no_store_json(status: StatusCode, body: Value) -> Response {
    let mut resp = (status, Json(body)).into_response();
    resp.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store"),
    );
    resp
}

fn parse_offset_param(raw_query: &str) -> Option<usize> {
    let raw = form_urlencoded::parse(raw_query.as_bytes())
        .find(|(k, _)| k == "offset")
        .map(|(_, v)| v.into_owned())?;
    let parsed: f64 = raw.trim().parse().ok()?;
    if !parsed.is_finite() || parsed.fract() != 0.0 || parsed < 0.0 {
        return Some(0);
    }
    let val = parsed as usize;
    (val <= MAX_PAGINATION_OFFSET).then_some(val)
}

fn parse_query_offset_default_zero(raw_query: &str) -> Option<usize> {
    if form_urlencoded::parse(raw_query.as_bytes()).any(|(k, _)| k == "offset") {
        parse_offset_param(raw_query)
    } else {
        Some(0)
    }
}

#[worker::send]
pub async fn auth_config(State(state): State<AppState>) -> Response {
    let google_enabled = state.env_var("GOOGLE_CLIENT_ID").is_some()
        && state.env_var("GOOGLE_CLIENT_SECRET").is_some();
    let turnstile_site_key = if state.env_var("TURNSTILE_SECRET_KEY").is_some() {
        state.env_var("TURNSTILE_SITE_KEY")
    } else {
        None
    };
    no_store_json(
        StatusCode::OK,
        json!({
            "googleEnabled": google_enabled,
            "turnstileSiteKey": turnstile_site_key,
        }),
    )
}

#[worker::send]
pub async fn search_climbs(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let raw_query = uri.query().unwrap_or("");
    let options =
        parse_member_catalog_options(raw_query, &session.user.id, DEFAULT_PUBLIC_PAGE_SIZE);
    let Some(offset) = options.offset else {
        return Ok(no_store_json(
            StatusCode::OK,
            json!({
                "climbs": [],
                "hasNextPage": false,
                "sendStats": {},
                "areaBreadcrumbs": {},
                "sentClimbIds": [],
            }),
        ));
    };

    let page = search_public_climbs(state.db(), &options).await?;
    let climb_ids: Vec<i64> = page.climbs.iter().map(|c| c.id).collect();
    let area_ids: Vec<i64> = page.climbs.iter().map(|c| c.area_id).collect();

    let send_stats = get_climb_send_stats(state.db(), &climb_ids).await?;
    let area_breadcrumbs = get_area_breadcrumbs(state.db(), &area_ids, 2).await?;
    let sent_climb_ids = get_user_sent_climb_ids(state.db(), &session.user.id, &climb_ids).await?;

    let has_next_page = page.has_next_page && offset + options.page_size <= MAX_PAGINATION_OFFSET;

    Ok(no_store_json(
        StatusCode::OK,
        json!({
            "climbs": page.climbs,
            "hasNextPage": has_next_page,
            "sendStats": send_stats,
            "areaBreadcrumbs": area_breadcrumbs,
            "sentClimbIds": sent_climb_ids,
        }),
    ))
}

#[worker::send]
pub async fn search_areas(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let raw_query = uri.query().unwrap_or("");
    let options = parse_member_catalog_options(raw_query, &session.user.id, AREA_SEARCH_PAGE_SIZE);
    let Some(offset) = options.offset else {
        return Ok(no_store_json(
            StatusCode::OK,
            json!({
                "areas": [],
                "hasNextPage": false,
                "areaBreadcrumbs": {},
            }),
        ));
    };

    let page = search_public_areas(state.db(), &options).await?;
    let area_ids: Vec<i64> = page.areas.iter().map(|a| a.id).collect();
    let area_breadcrumbs = get_area_breadcrumbs(state.db(), &area_ids, 2).await?;
    let has_next_page = page.has_next_page && offset + options.page_size <= MAX_PAGINATION_OFFSET;

    Ok(no_store_json(
        StatusCode::OK,
        json!({
            "areas": page.areas,
            "hasNextPage": has_next_page,
            "areaBreadcrumbs": area_breadcrumbs,
        }),
    ))
}

#[worker::send]
pub async fn search_climbers(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let raw_query = uri.query().unwrap_or("");
    let name = form_urlencoded::parse(raw_query.as_bytes())
        .find(|(k, _)| k == "name")
        .map(|(_, v)| v.into_owned())
        .unwrap_or_default();
    let Some(offset) = parse_query_offset_default_zero(raw_query) else {
        return Ok(no_store_json(
            StatusCode::OK,
            json!({ "climbers": [], "hasMore": false }),
        ));
    };

    let page = get_climbers_page(
        state.db(),
        Some(&session.user.id),
        &name,
        offset,
        CLIMBERS_PAGE_SIZE,
    )
    .await?;
    let has_more = page.has_more && offset + CLIMBERS_PAGE_SIZE <= MAX_PAGINATION_OFFSET;
    Ok(no_store_json(
        StatusCode::OK,
        json!({
            "climbers": page.climbers,
            "hasMore": has_more,
        }),
    ))
}

#[worker::send]
pub async fn area_climbs(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(raw_id): Path<String>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let Some(id) = parse_id(&raw_id) else {
        return Ok(no_store_json(
            StatusCode::NOT_FOUND,
            json!({ "error": "Area not found" }),
        ));
    };
    let Some(area) = get_public_area(state.db(), id).await? else {
        return Ok(no_store_json(
            StatusCode::NOT_FOUND,
            json!({ "error": "Area not found" }),
        ));
    };

    let raw_query = uri.query().unwrap_or("");
    let subarea_id = form_urlencoded::parse(raw_query.as_bytes())
        .find(|(k, _)| k == "subarea")
        .and_then(|(_, v)| parse_id(&v));
    let scope = resolve_public_subarea(
        state.db(),
        &PublicArea {
            id: area.id,
            name: area.name,
            parent_id: area.parent_id,
        },
        subarea_id,
    )
    .await?;

    let mut options = parse_member_catalog_options(raw_query, &session.user.id, PAGE_SIZE);
    let Some(offset) = options.offset else {
        return Ok(no_store_json(
            StatusCode::OK,
            json!({
                "climbs": [],
                "hasNextPage": false,
                "sendStats": {},
                "areaBreadcrumbs": {},
                "sentClimbIds": [],
            }),
        ));
    };
    options.area_id = Some(scope.id);

    let page = search_public_climbs(state.db(), &options).await?;
    let climb_ids: Vec<i64> = page.climbs.iter().map(|c| c.id).collect();
    let area_ids: Vec<i64> = page.climbs.iter().map(|c| c.area_id).collect();

    let send_stats = get_climb_send_stats(state.db(), &climb_ids).await?;
    let area_breadcrumbs = get_area_breadcrumbs(state.db(), &area_ids, 2).await?;
    let sent_climb_ids = get_user_sent_climb_ids(state.db(), &session.user.id, &climb_ids).await?;
    let has_next_page = page.has_next_page && offset + PAGE_SIZE <= MAX_PAGINATION_OFFSET;

    Ok(no_store_json(
        StatusCode::OK,
        json!({
            "climbs": page.climbs,
            "page": (offset / PAGE_SIZE) + 1,
            "pageSize": PAGE_SIZE,
            "hasNextPage": has_next_page,
            "sendStats": send_stats,
            "areaBreadcrumbs": area_breadcrumbs,
            "sentClimbIds": sent_climb_ids,
        }),
    ))
}

#[worker::send]
pub async fn friends_list(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let raw_query = uri.query().unwrap_or("");
    let view = form_urlencoded::parse(raw_query.as_bytes())
        .find(|(k, _)| k == "view")
        .map(|(_, v)| v.into_owned());

    if view.as_deref() == Some("count") {
        let count = get_pending_friend_request_count(state.db(), &session.user.id).await?;
        return Ok(no_store_json(
            StatusCode::OK,
            json!({
                "userId": session.user.id,
                "count": count,
            }),
        ));
    }

    let Some(offset) = parse_query_offset_default_zero(raw_query) else {
        return Ok(no_store_json(
            StatusCode::OK,
            json!({ "friends": [], "hasMore": false }),
        ));
    };
    let requests_only = view.as_deref() == Some("requests");
    let page = get_friends_page(state.db(), &session.user.id, requests_only, offset).await?;
    let has_more = page.has_more && offset + FRIENDS_PAGE_SIZE <= MAX_PAGINATION_OFFSET;
    Ok(no_store_json(
        StatusCode::OK,
        json!({
            "friends": page.friends,
            "hasMore": has_more,
        }),
    ))
}

#[worker::send]
pub async fn friend_suggestions(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let climbers = get_climber_suggestions(state.db(), &session.user.id, 6).await?;
    Ok(no_store_json(
        StatusCode::OK,
        json!({ "climbers": climbers }),
    ))
}
