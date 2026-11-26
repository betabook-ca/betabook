use axum::{
    extract::{OriginalUri, Path, State},
    http::{HeaderMap, StatusCode},
    response::Response,
};
use betabook_db::{analytics, journal::get_user_hashtags, social::get_user_profile};
use betabook_domain::{
    analytics_layout::Layout,
    sends::{is_valid_journal_tag, normalize_tag},
    seo::PageMetadata,
    site::SITE_DESCRIPTION,
    terms::has_accepted_current_terms,
};
use serde_json::{Value, json};

use super::{
    actions::{action_err, action_ok},
    member_pages::{no_store_json, profile_header_data},
};
use crate::{
    auth::session::{require_member_session, resolve_optional_session},
    state::{ApiError, AppState},
};

#[worker::send]
pub async fn page(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(owner): Path<String>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let viewer = &session.user.id;
    let header = profile_header_data(&state, &owner, &session)
        .await?
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "Climber not found").no_store())?;
    let mut selected_tags = Vec::new();
    for (key, value) in url::form_urlencoded::parse(uri.query().unwrap_or_default().as_bytes()) {
        if key == "tag" {
            let tag = normalize_tag(&value);
            if is_valid_journal_tag(&tag) && !selected_tags.contains(&tag) {
                selected_tags.push(tag);
            }
        }
    }
    let db = state.db();
    let sends = analytics::profile_sends(db, &owner, viewer, &selected_tags).await?;
    let sessions = if header.access.journal {
        Some(analytics::profile_sessions(db, &owner, viewer, &selected_tags).await?)
    } else {
        None
    };
    let tags = get_user_hashtags(db, &owner, Some(viewer), false, false).await?;
    let now = state.now_ms();
    let today = super::goal_refresh::today(state.cf_timezone.as_deref().unwrap_or("UTC"), now)?;
    let month = today
        .get(..7)
        .ok_or_else(|| ApiError::internal("Invalid civil date"))?;
    let overview = analytics::overview(db, &owner, viewer, month).await?;
    let (layout, dismissed) = if header.is_owner {
        analytics::owner_preferences(db, &owner).await?
    } else {
        (None, true)
    };
    Ok(no_store_json(
        StatusCode::OK,
        json!({
            "header": header,
            "rows": sends,
            "highlightSessions": sessions,
            "overview": overview,
            "tags": tags,
            "layout": layout,
            "showAnnouncement": !dismissed,
            "viewerCreatedAt": session.user.created_at,
            "nowMs": now,
        }),
    ))
}

#[worker::send]
pub async fn html(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(owner): Path<String>,
) -> Result<Response, ApiError> {
    let session = resolve_optional_session(&state, &headers)
        .await?
        .filter(|s| {
            has_accepted_current_terms(s.user.terms_version.as_deref(), s.user.terms_accepted_at)
        });
    let (status, title) = if let Some(session) = session {
        match get_user_profile(state.db(), &owner)
            .await?
            .filter(|u| !u.is_private || u.id == session.user.id)
        {
            Some(user) => (StatusCode::OK, format!("{} · Analytics", user.name)),
            None => (StatusCode::NOT_FOUND, "Climber not found".to_owned()),
        }
    } else {
        (StatusCode::OK, "Member content".to_owned())
    };
    super::seo::member_shell(
        &state,
        status,
        &PageMetadata::noindex(title, SITE_DESCRIPTION),
        "routes/profile-analytics-route.tsx",
    )
    .await
}

pub(super) async fn save(
    state: &AppState,
    headers: &HeaderMap,
    args: &[Value],
) -> Result<Response, ApiError> {
    let session = match require_member_session(state, headers).await {
        Ok(s) => s,
        Err(e) => return Ok(action_err(e.message)),
    };
    let Some(layout) = args
        .first()
        .and_then(|v| serde_json::from_value::<Layout>(v.clone()).ok())
        .and_then(Layout::normalized)
    else {
        return Ok(action_err(
            "This layout could not be saved. Restore defaults and try again.",
        ));
    };
    analytics::save_layout(state.db(), &session.user.id, &json!(layout)).await?;
    Ok(action_ok())
}
