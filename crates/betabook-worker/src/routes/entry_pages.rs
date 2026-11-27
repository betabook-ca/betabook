use axum::{
    extract::{OriginalUri, Path, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use betabook_db::{
    auth::get_share_link_owner, content_access::can_read_journal, social::get_user_profile,
};
use betabook_domain::{
    profile_share::parse_share_token, seo::PageMetadata, site::SITE_DESCRIPTION,
};
use serde::Deserialize;
use std::collections::BTreeMap;

use super::{
    climb_lists::shared_viewer,
    seo::{member_shell, render_not_found},
};
use crate::state::{ApiError, AppState};

#[worker::send]
pub async fn profile(
    State(state): State<AppState>,
    Path(owner): Path<String>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let suffix = uri.path().trim_end_matches('/').split('/').nth(3);
    let (label, chunk) = match suffix {
        Some("journal") => (" · Journal", "routes/user-journal-route.tsx"),
        Some("sends") => (" · Sends", "routes/user-sends-route.tsx"),
        _ => ("", "routes/user-profile-route.tsx"),
    };
    let mut title = "Member content".to_owned();
    if let Some(viewer) = shared_viewer(&state, &headers).await? {
        let Some(user) = get_user_profile(state.db(), &owner)
            .await?
            .filter(|p| !p.is_private || viewer == owner)
        else {
            return render_not_found(&state).await;
        };
        if suffix == Some("journal") && !can_read_journal(state.db(), &owner, Some(&viewer)).await?
        {
            return render_not_found(&state).await;
        }
        title = format!("{}{label}", user.name);
    } else if suffix.is_none() {
        let mut shares = url::form_urlencoded::parse(uri.query().unwrap_or("").as_bytes())
            .filter(|(k, _)| k == "share");
        if let Some((_, raw)) = shares.next()
            && shares.next().is_none()
            && let Some(token) = parse_share_token(&raw)
            && let Some(profile) = get_share_link_owner(state.db(), token).await?
            && profile.id == owner
        {
            title = format!("{} · Climbing profile", profile.name);
        }
    }
    member_shell(
        &state,
        StatusCode::OK,
        &PageMetadata::noindex(title, SITE_DESCRIPTION),
        chunk,
    )
    .await
}

#[derive(Deserialize)]
struct Step<'a> {
    id: &'a str,
}

#[worker::send]
pub async fn tutorial(
    State(state): State<AppState>,
    Path(params): Path<BTreeMap<String, String>>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let meta = PageMetadata::noindex("Tutorial", SITE_DESCRIPTION);
    if shared_viewer(&state, &headers).await?.is_some() {
        let catalog: BTreeMap<&str, Vec<Step<'_>>> =
            serde_json::from_str(include_str!("../../../../lib/product-tour-steps.json"))
                .map_err(ApiError::internal)?;
        let tour = params.get("tour").map_or("", String::as_str);
        let Some(steps) = catalog.get(tour) else {
            return render_not_found(&state).await;
        };
        if let Some(step) = params.get("step") {
            if !steps.iter().any(|s| s.id == step) {
                return render_not_found(&state).await;
            }
        } else if let Some(first) = steps.first() {
            let pairs: Vec<_> =
                url::form_urlencoded::parse(uri.query().unwrap_or("").as_bytes()).collect();
            let single = |key: &str, value: &str| {
                let mut values = pairs.iter().filter(|(k, _)| k == key);
                values.next().is_some_and(|(_, v)| v == value) && values.next().is_none()
            };
            let query = if single("from", "account") {
                "?from=account"
            } else if single("mode", "updates") {
                "?mode=updates"
            } else {
                ""
            };
            return Ok((
                StatusCode::TEMPORARY_REDIRECT,
                [
                    (
                        header::LOCATION,
                        format!("/tutorial/{tour}/{}{query}", first.id),
                    ),
                    (header::CACHE_CONTROL, "private, no-store".to_owned()),
                ],
            )
                .into_response());
        }
    }
    member_shell(&state, StatusCode::OK, &meta, "routes/tutorial-route.tsx").await
}
