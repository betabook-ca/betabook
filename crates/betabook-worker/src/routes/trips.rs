use super::{
    actions::{action_err, action_ok, action_value, allow_rate_limit, map_mutation_result},
    member_pages::{no_store_json, profile_header_data},
};
use crate::auth::session::{require_member_session, resolve_optional_session};
use crate::state::{ApiError, AppState};
use axum::{
    extract::{OriginalUri, Path, State},
    http::{HeaderMap, StatusCode},
    response::Response,
};
use betabook_db::{
    public_catalog::get_area_breadcrumbs,
    trips::{self, ShareAccess, TripReader},
};
use betabook_domain::markdown::{HeadingTopLevel, render_safe_markdown};
use betabook_domain::{
    profile_share::parse_share_token, public_catalog::parse_id, trips::TripInput,
};
use serde_json::{Value, json};

fn not_found() -> ApiError {
    ApiError::new(StatusCode::NOT_FOUND, "Trip not found").no_store()
}
fn ok(payload: Value) -> Response {
    no_store_json(StatusCode::OK, payload)
}

#[worker::send]
pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(owner): Path<String>,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let header = profile_header_data(&state, &owner, &session)
        .await?
        .filter(|h| h.access.trips)
        .ok_or_else(not_found)?;
    let trips = trips::member_trips(state.db(), &owner, &session.user.id, None).await?;
    Ok(ok(
        json!({"header":header,"trips":trips,"timezone":state.cf_timezone}),
    ))
}

async fn views(
    state: &AppState,
    owner: &str,
    reader: &TripReader<'_>,
    analytics: bool,
    journal_visible: bool,
) -> Result<Value, ApiError> {
    if analytics {
        return Ok(
            json!({"analytics":trips::analytics(state.db(),owner,reader,journal_visible).await?}),
        );
    }
    let rows = trips::day_rows(state.db(), owner, reader).await?;
    let area_ids = rows
        .sends
        .iter()
        .map(|s| s.area_id)
        .chain(rows.entries.iter().filter_map(|j| j.area_id))
        .collect::<Vec<_>>();
    let areas = get_area_breadcrumbs(state.db(), &area_ids, 2).await?;
    Ok(json!({"rows":rows,"breadcrumbs":areas}))
}

#[worker::send]
pub async fn detail(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, raw)): Path<(String, String)>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let id = parse_id(&raw).ok_or_else(not_found)?;
    let session = require_member_session(&state, &headers).await?;
    let viewer = &session.user.id;
    let header = profile_header_data(&state, &owner, &session)
        .await?
        .filter(|h| h.access.trips)
        .ok_or_else(not_found)?;
    let trip = trips::member_trips(state.db(), &owner, viewer, Some(id))
        .await?
        .pop()
        .ok_or_else(not_found)?;
    let analytics = uri.path().ends_with("/analytics");
    let notes = if !analytics && trip.summary.has_notes != 0 {
        trips::member_notes(state.db(), &owner, viewer, id).await?
    } else {
        None
    };
    let share = if header.is_owner && !analytics {
        trips::owner_share(state.db(), &owner, id).await?
    } else {
        None
    };
    let view = views(
        &state,
        &owner,
        &TripReader::Member {
            viewer,
            trip_id: id,
        },
        analytics,
        header.access.journal,
    )
    .await?;
    Ok(ok(json!({
        "header": header, "trip": trip, "notes": notes,
        "notesHtml": notes.as_deref().map(|s| render_safe_markdown(s, HeadingTopLevel::H3)),
        "share": share, "view": view, "timezone": state.cf_timezone
    })))
}

#[worker::send]
pub async fn shared(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(token): Path<String>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let token = parse_share_token(&token).ok_or_else(not_found)?;
    let session = optional_member(&state, &headers).await?;
    let access = trips::shared_trip(state.db(), token).await?;
    let (owner, id) = match &access {
        ShareAccess::Hidden => return Err(not_found()),
        ShareAccess::Expired { owner, id } | ShareAccess::Visible { owner, id, .. } => (owner, *id),
    };
    let analytics = uri.path().ends_with("/analytics");
    if session.is_some_and(|s| s.user.id == *owner) {
        let owner = url::form_urlencoded::byte_serialize(owner.as_bytes()).collect::<String>();
        return Ok(ok(
            json!({"redirectTo":format!("/users/{owner}/trips/{id}{}",if analytics{"/analytics"}else{""})}),
        ));
    }
    let ShareAccess::Visible {
        owner,
        name,
        image,
        trip,
        notes,
        ..
    } = access
    else {
        return Ok(ok(json!({"expired":true})));
    };
    let view = views(&state, &owner, &TripReader::Link { token }, analytics, true).await?;
    Ok(ok(json!({
        "owner": {"id":owner, "name":name, "image":image},
        "trip": trip, "notes": notes,
        "notesHtml": notes.as_deref().map(|s| render_safe_markdown(s, HeadingTopLevel::H3)),
        "view": view, "timezone": state.cf_timezone
    })))
}

pub(super) async fn action(
    name: &str,
    args: &[Value],
    state: &AppState,
    headers: &HeaderMap,
) -> Result<Response, ApiError> {
    let session = match require_member_session(state, headers).await {
        Ok(s) => s,
        Err(e) => return crate::routes::actions::session_error(e),
    };
    let owner = &session.user.id;
    if name != "unshareTrip" && !allow_rate_limit(state, "JOURNAL_RATE_LIMITER", owner).await {
        return Ok(action_err("Too many changes — try again in a minute"));
    }
    let id = args.first().and_then(Value::as_i64).filter(|id| *id > 0);
    if name == "saveTrip" {
        if id.is_none() && !args.first().is_some_and(Value::is_null) {
            return Ok(action_err("Trip not found"));
        }
        let Some(input) = args
            .get(1)
            .and_then(|v| serde_json::from_value::<TripInput>(v.clone()).ok())
        else {
            return Ok(action_err("Check the form"));
        };
        let input = match input.validate() {
            Ok(v) => v,
            Err(e) => return Ok(action_err(e)),
        };
        return map_mutation_result(
            trips::save(state.db(), owner, id, &input, state.now_ms()).await,
            action_value,
        );
    }
    let Some(id) = id else {
        return Ok(action_err("Trip not found"));
    };
    match name {
        "saveTripNotes" => {
            let Some(text) = args.get(1).and_then(Value::as_str) else {
                return Ok(action_err("Check the form"));
            };
            map_mutation_result(
                trips::notes(state.db(), owner, id, text, state.now_ms()).await,
                |()| action_ok(),
            )
        }
        "deleteTrip" => {
            trips::delete(state.db(), owner, id).await?;
            Ok(action_ok())
        }
        "removeMyTripTag" => {
            map_mutation_result(trips::remove_tag(state.db(), owner, id).await, |()| {
                action_ok()
            })
        }
        "shareTrip" => {
            let modifier = match betabook_domain::profile_share::share_expiry_modifier(
                args.get(1).and_then(Value::as_str).unwrap_or(""),
            ) {
                Ok(m) => m,
                Err(e) => return Ok(action_err(e)),
            };
            map_mutation_result(
                trips::share(state.db(), owner, id, modifier).await,
                action_value,
            )
        }
        "unshareTrip" => {
            trips::unshare(state.db(), owner, id).await?;
            Ok(action_ok())
        }
        _ => Err(not_found()),
    }
}

#[worker::send]
pub async fn shared_html(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(raw): Path<String>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    use betabook_domain::seo::PageMetadata;
    use betabook_domain::site::{SITE_DESCRIPTION, SITE_NAME};
    let access = if let Some(token) = parse_share_token(&raw) {
        trips::shared_trip(state.db(), token).await?
    } else {
        ShareAccess::Hidden
    };
    let mut status = StatusCode::OK;
    let mut meta = PageMetadata::noindex("Shared trip", SITE_DESCRIPTION);
    match &access {
        ShareAccess::Hidden => status = StatusCode::NOT_FOUND,
        ShareAccess::Expired { owner, id } | ShareAccess::Visible { owner, id, .. } => {
            let session = optional_member(&state, &headers).await?;
            if session.is_some_and(|s| s.user.id == *owner) {
                let suffix = if uri.path().ends_with("/analytics") {
                    "/analytics"
                } else {
                    ""
                };
                let owner =
                    url::form_urlencoded::byte_serialize(owner.as_bytes()).collect::<String>();
                return Response::builder()
                    .status(StatusCode::TEMPORARY_REDIRECT)
                    .header(
                        http::header::LOCATION,
                        format!("/users/{owner}/trips/{id}{suffix}"),
                    )
                    .header(http::header::CACHE_CONTROL, "private, no-store")
                    .body(axum::body::Body::empty())
                    .map_err(ApiError::internal);
            }
        }
    }
    if let ShareAccess::Visible { name, trip, .. } = access {
        meta = PageMetadata::noindex(
            format!("{name} · {}", trip.name),
            format!(
                "See {name}'s trip, day by day, on {SITE_NAME}, a climbing logbook and crag database."
            ),
        );
        meta.og_type = "article";
    }
    super::seo::member_shell(&state, status, &meta, "routes/trips-route.tsx").await
}

async fn optional_member(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<Option<betabook_db::auth::AuthSession>, ApiError> {
    Ok(resolve_optional_session(state, headers).await?.filter(|s| {
        betabook_domain::terms::has_accepted_current_terms(
            s.user.terms_version.as_deref(),
            s.user.terms_accepted_at,
        )
    }))
}

#[worker::send]
pub async fn member_html(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(params): Path<std::collections::HashMap<String, String>>,
) -> Result<Response, ApiError> {
    use betabook_domain::{seo::PageMetadata, site::SITE_DESCRIPTION};
    let (status, title) = if let Some(session) = optional_member(&state, &headers).await? {
        let owner = params.get("id").ok_or_else(not_found)?;
        let title = match params.get("trip") {
            Some(raw) => match parse_id(raw) {
                Some(id) => {
                    trips::member_title(state.db(), owner, &session.user.id, Some(id)).await?
                }
                None => None,
            },
            None => trips::member_title(state.db(), owner, &session.user.id, None).await?,
        };
        title.map_or((StatusCode::NOT_FOUND, "Trip not found".into()), |t| {
            (StatusCode::OK, t)
        })
    } else {
        (StatusCode::OK, "Member content".into())
    };
    super::seo::member_shell(
        &state,
        status,
        &PageMetadata::noindex(title, SITE_DESCRIPTION),
        "routes/trips-route.tsx",
    )
    .await
}

async fn album_response(row: Option<betabook_db::DbRow>) -> Result<Response, ApiError> {
    let link = row.ok_or_else(not_found)?.get_opt_string("album_url")?;
    Ok(ok(json!(super::trip_album::load(link.as_deref()).await)))
}

#[worker::send]
pub async fn photos(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, raw)): Path<(String, String)>,
) -> Result<Response, ApiError> {
    let id = parse_id(&raw).ok_or_else(not_found)?;
    let session = require_member_session(&state, &headers).await?;
    album_response(trips::member_album(state.db(), &owner, id, &session.user.id).await?).await
}

#[worker::send]
pub async fn shared_photos(
    State(state): State<AppState>,
    Path(raw): Path<String>,
) -> Result<Response, ApiError> {
    let token = parse_share_token(&raw).ok_or_else(not_found)?;
    album_response(trips::shared_album(state.db(), token).await?).await
}
