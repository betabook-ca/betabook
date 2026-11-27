use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::Response,
};
use betabook_db::projects::{self, SharedAccess};
use betabook_domain::profile_share::parse_share_token;
use serde::Deserialize;
use serde_json::json;

use super::member_pages::no_store_json;
use crate::auth::session::require_member_session;
use crate::state::{ApiError, AppState};

#[derive(Deserialize)]
pub struct BoardQuery {
    #[serde(default)]
    sent: bool,
}

#[worker::send]
pub async fn board(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(owner): Path<String>,
    Query(query): Query<BoardQuery>,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    if session.user.id != owner {
        return Err(ApiError::new(StatusCode::NOT_FOUND, "Climber not found").no_store());
    }
    let data = projects::project_board(state.db(), &session.user.id, query.sent).await?;
    Ok(no_store_json(StatusCode::OK, json!(data)))
}

pub(super) async fn resolve_link(state: &AppState, token: &str) -> Result<SharedAccess, ApiError> {
    let Some(token) = parse_share_token(token) else {
        return Ok(SharedAccess::Hidden);
    };
    Ok(projects::shared_project(state.db(), token).await?)
}

#[worker::send]
pub async fn shared(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<Response, ApiError> {
    let access = resolve_link(&state, &token).await?;
    if matches!(access, SharedAccess::Hidden) {
        return Err(ApiError::new(StatusCode::NOT_FOUND, "Project not found").no_store());
    }
    Ok(no_store_json(StatusCode::OK, json!(access)))
}
