use axum::{
    Json,
    extract::{OriginalUri, Path, State},
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use betabook_db::public_catalog::{
    get_public_area, get_public_area_trail, get_public_climb, get_public_sends_for_climb,
    get_public_subareas, resolve_public_subarea, search_public_areas, search_public_climbs,
};
use betabook_db::social::{CLIMB_VIDEO_LIMIT, get_climb_videos};
use betabook_domain::public_catalog::{
    PublicArea, has_protected_catalog_params, parse_id, parse_public_catalog_options,
};
use serde_json::json;
use url::form_urlencoded;

use crate::state::{ApiError, AppState};

fn protected_params_rejected() -> Response {
    let mut resp = (
        StatusCode::UNAUTHORIZED,
        Json(json!({ "error": "Not signed in" })),
    )
        .into_response();
    resp.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store"),
    );
    resp
}

#[worker::send]
pub async fn search_climbs(
    State(state): State<AppState>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let raw_query = uri.query().unwrap_or("");
    if has_protected_catalog_params(raw_query, true) {
        return Ok(protected_params_rejected());
    }
    let options = parse_public_catalog_options(raw_query);
    let page = search_public_climbs(state.db(), &options).await?;
    Ok(Json(page).into_response())
}

#[worker::send]
pub async fn search_areas(
    State(state): State<AppState>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let raw_query = uri.query().unwrap_or("");
    if has_protected_catalog_params(raw_query, false) {
        return Ok(protected_params_rejected());
    }
    let options = parse_public_catalog_options(raw_query);
    let page = search_public_areas(state.db(), &options).await?;
    Ok(Json(page).into_response())
}

#[worker::send]
pub async fn area_climbs(
    State(state): State<AppState>,
    Path(raw_id): Path<String>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let raw_query = uri.query().unwrap_or("");
    if has_protected_catalog_params(raw_query, true) {
        return Ok(protected_params_rejected());
    }
    let Some(id) = parse_id(&raw_id) else {
        return Ok((
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Area not found" })),
        )
            .into_response());
    };
    let Some(area) = get_public_area(state.db(), id).await? else {
        return Ok((
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Area not found" })),
        )
            .into_response());
    };
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

    let mut options = parse_public_catalog_options(raw_query);
    options.area_id = Some(scope.id);
    let page = search_public_climbs(state.db(), &options).await?;
    Ok(Json(page).into_response())
}

#[worker::send]
pub async fn area_details(
    State(state): State<AppState>,
    Path(raw_id): Path<String>,
) -> Result<Response, ApiError> {
    let Some(id) = parse_id(&raw_id) else {
        return Ok((
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Area not found" })),
        )
            .into_response());
    };
    let Some(area) = get_public_area(state.db(), id).await? else {
        return Ok((
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Area not found" })),
        )
            .into_response());
    };
    let trail = get_public_area_trail(state.db(), id).await?;
    let ancestors = &trail[..trail.len().saturating_sub(1)];
    let subareas = get_public_subareas(state.db(), id).await?;
    Ok(Json(json!({
        "area": area,
        "ancestors": ancestors,
        "trail": trail,
        "subareas": subareas,
    }))
    .into_response())
}

#[worker::send]
pub async fn climb_details(
    State(state): State<AppState>,
    Path(raw_id): Path<String>,
) -> Result<Response, ApiError> {
    let Some(id) = parse_id(&raw_id) else {
        return Ok((
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Climb not found" })),
        )
            .into_response());
    };
    let Some(climb) = get_public_climb(state.db(), id).await? else {
        return Ok((
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Climb not found" })),
        )
            .into_response());
    };
    let trail = get_public_area_trail(state.db(), climb.area_id).await?;
    let area = trail.last().cloned();
    let ancestors = &trail[..trail.len().saturating_sub(1)];
    let public_sends = get_public_sends_for_climb(state.db(), id).await?;
    let videos = get_climb_videos(state.db(), id, None, CLIMB_VIDEO_LIMIT).await?;
    Ok(Json(json!({
        "climb": climb,
        "area": area,
        "ancestors": ancestors,
        "trail": trail,
        "publicSends": public_sends,
        "videos": videos,
    }))
    .into_response())
}
