use super::profile_payloads::{
    JournalResponse, JournalSlice, JournalView, JournalWorkspace, ProfilePage, ProfileTab,
    SendsResponse, SendsView, SendsWorkspace, SharedOwner, SharedProfile,
};
use axum::{
    Json,
    extract::{OriginalUri, Path, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use betabook_db::auth::get_share_link_owner;
use betabook_db::content_access::{can_read_journal, get_profile_access};
use betabook_db::feed::{FEED_PAGE_SIZE, FeedCursor, get_feed_page};
use betabook_db::fts::PAGE_SIZE;
use betabook_db::journal::{
    CLIMB_JOURNAL_ENTRY_LIMIT, JOURNAL_PAGE_SIZE, JournalCursor, JournalFilter,
    get_journal_for_climb, get_journal_page, get_user_hashtags, has_journal_entries,
};
use betabook_db::member_catalog::{
    get_area_with_subtree_size, get_climb_by_id, get_climb_list_choices,
    get_subtree_grade_histogram,
};
use betabook_db::public_catalog::{
    get_area_breadcrumbs, get_public_area_trail, get_public_subareas, resolve_public_subarea,
    search_public_climbs,
};
use betabook_db::sends::{
    CLIMB_SENDS_PAGE_SIZE, USER_SENDS_PAGE_SIZE, UserSendsExportCursor, UserSendsFilter,
    get_climb_send_summary, get_sends_for_climb, get_sends_for_user_export_page,
    get_sends_for_user_page, get_user_send_for_climb, get_user_sends_summary, has_user_sends,
};
use betabook_db::social::{
    CLIMB_VIDEO_LIMIT, get_account_user, get_climb_send_stats, get_climb_videos,
    get_climber_hardest, get_climber_suggestions, get_friends_page, get_friendship_status,
    get_journal_filter_friends, get_product_tour_state, get_profile_share_token, get_user_profile,
    get_user_sent_climb_ids, search_companion_friends,
};
use betabook_domain::grades::{BoulderScale, GradePreferences, RopeScale};
use betabook_domain::profile_share::profile_token_from_query;
use betabook_domain::public_catalog::{
    MAX_PAGINATION_OFFSET, MAX_RATING, PublicArea, parse_id, parse_member_catalog_options,
};
use betabook_domain::sends::{
    ASCENT_STYLES, is_real_iso_date, is_valid_journal_tag, normalize_tag,
};
use betabook_domain::terms::has_accepted_current_terms;
use serde::{Deserialize, Serialize};
use serde_json::json;
use url::form_urlencoded;

use crate::auth::session::{require_member_session, resolve_optional_session};
use crate::state::{ApiError, AppState};

const SHARED_PROFILE_SENDS: usize = 5;
const CATALOG_EXPORT_KEY: &str = "catalog/latest.json";

pub(super) fn no_store_json(status: StatusCode, body: impl Serialize) -> Response {
    let mut resp = (status, Json(body)).into_response();
    resp.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store"),
    );
    resp
}

fn grade_prefs_from_strings(boulder: &str, rope: &str) -> GradePreferences {
    GradePreferences {
        boulder: BoulderScale::parse(boulder).unwrap_or_default(),
        rope: RopeScale::parse(rope).unwrap_or_default(),
    }
}

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProfileHeaderData {
    pub user: betabook_db::social::UserProfileRow,
    pub is_owner: bool,
    pub access: betabook_db::content_access::ProfileAccess,
    #[cfg_attr(
        feature = "api-spec",
        schemars(with = "betabook_domain::wire::FriendshipStatus")
    )]
    pub relationship: String,
    pub hardest: Vec<betabook_db::social::HardestSend>,
}

pub(super) async fn profile_header_data(
    state: &AppState,
    user_id: &str,
    session: &betabook_db::auth::AuthSession,
) -> Result<Option<ProfileHeaderData>, ApiError> {
    let viewer_id = &session.user.id;
    let Some(user) = get_user_profile(state.db(), user_id).await? else {
        return Ok(None);
    };
    let is_owner = *viewer_id == user.id;
    if user.is_private && !is_owner {
        return Ok(None);
    }
    let access = get_profile_access(state.db(), user_id, viewer_id).await?;
    let relationship = if is_owner {
        "none".to_owned()
    } else {
        get_friendship_status(state.db(), viewer_id, user_id).await?
    };
    let prefs = grade_prefs_from_strings(
        &session.user.boulder_grade_scale,
        &session.user.rope_grade_scale,
    );
    let hardest = get_climber_hardest(state.db(), user_id, prefs).await?;
    Ok(Some(ProfileHeaderData {
        user,
        is_owner,
        access,
        relationship,
        hardest,
    }))
}

pub(super) fn parse_query_map(raw_query: &str) -> Vec<(String, String)> {
    form_urlencoded::parse(raw_query.as_bytes())
        .into_owned()
        .collect()
}

pub(super) fn first_param<'a>(pairs: &'a [(String, String)], key: &str) -> Option<&'a str> {
    pairs
        .iter()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.as_str())
}

fn all_params(pairs: &[(String, String)], key: &str) -> Vec<String> {
    pairs
        .iter()
        .filter(|(k, _)| k == key)
        .map(|(_, v)| v.clone())
        .collect()
}

fn parse_date_filter(
    pairs: &[(String, String)],
) -> (Option<String>, Option<String>, Option<String>) {
    if let Some(date) = first_param(pairs, "date")
        && is_real_iso_date(date)
    {
        return (Some(date.to_string()), None, None);
    }
    let raw_from = first_param(pairs, "dateFrom").filter(|d| is_real_iso_date(d));
    let raw_to = first_param(pairs, "dateTo").filter(|d| is_real_iso_date(d));
    match (raw_from, raw_to) {
        (Some(a), Some(b)) if a > b => (None, Some(b.to_string()), Some(a.to_string())),
        (a, b) => (None, a.map(ToString::to_string), b.map(ToString::to_string)),
    }
}

fn parse_offset_strict(pairs: &[(String, String)]) -> Option<usize> {
    let Some(raw) = first_param(pairs, "offset") else {
        return Some(0);
    };
    let Ok(val) = raw.trim().parse::<f64>() else {
        return Some(0);
    };
    if !val.is_finite() || val.fract() != 0.0 || val < 0.0 {
        return Some(0);
    }
    let offset = val as usize;
    (offset <= MAX_PAGINATION_OFFSET).then_some(offset)
}

fn parse_user_sends_filter(raw_query: &str) -> UserSendsFilter {
    let pairs = parse_query_map(raw_query);
    let catalog = parse_member_catalog_options(raw_query, "", USER_SENDS_PAGE_SIZE);
    let (date, date_from, date_to) = parse_date_filter(&pairs);

    let sort = match first_param(&pairs, "sort") {
        Some(
            s @ ("date_desc" | "date_asc" | "grade_desc" | "grade_asc" | "rating_desc"
            | "rating_asc"),
        ) => s.to_string(),
        _ => "date_desc".to_string(),
    };

    let mut tags = Vec::new();
    for raw in all_params(&pairs, "tag") {
        let normalized = normalize_tag(&raw);
        if is_valid_journal_tag(&normalized) && !tags.contains(&normalized) {
            tags.push(normalized);
        }
    }

    let ascent_styles: Vec<String> = all_params(&pairs, "ascentStyle")
        .into_iter()
        .filter(|s| ASCENT_STYLES.contains(&s.as_str()))
        .collect();

    let parse_rating = |key: &str| -> i64 {
        first_param(&pairs, key)
            .and_then(|v| v.trim().parse::<f64>().ok())
            .filter(|n| n.is_finite() && n.fract() == 0.0 && *n >= 0.0 && *n <= MAX_RATING as f64)
            .map(|n| n as i64)
            .unwrap_or(0)
    };

    let area_id = first_param(&pairs, "areaId").map(|raw| parse_id(raw).unwrap_or(0));

    UserSendsFilter {
        filter: catalog.filter,
        date,
        date_from,
        date_to,
        tags,
        name: first_param(&pairs, "name").map(ToString::to_string),
        area_name: first_param(&pairs, "areaName").map(ToString::to_string),
        area_id,
        sort,
        ascent_styles,
        min_rating: parse_rating("minRating"),
        max_rating: parse_rating("maxRating"),
    }
}

fn parse_journal_filter(raw_query: &str, is_owner: bool) -> JournalFilter {
    let pairs = parse_query_map(raw_query);
    let (date, date_from, date_to) = parse_date_filter(&pairs);

    let view = match first_param(&pairs, "view") {
        Some(v @ ("all" | "sessions" | "training")) => v.to_string(),
        _ => "all".to_string(),
    };

    let raw_q = first_param(&pairs, "q").unwrap_or("");
    let collapsed = raw_q.split_whitespace().collect::<Vec<_>>().join(" ");
    let normalized_q: String = collapsed.chars().take(100).collect();

    let mut tags = Vec::new();
    for raw in all_params(&pairs, "tag") {
        let norm = normalize_tag(&raw);
        if is_valid_journal_tag(&norm) && !tags.contains(&norm) {
            tags.push(norm);
        }
    }

    let friend_ids = if is_owner {
        let mut ids = Vec::new();
        for raw in all_params(&pairs, "friendId") {
            let trimmed = raw.trim().to_string();
            if !trimmed.is_empty() && !ids.contains(&trimmed) {
                ids.push(trimmed);
            }
        }
        ids
    } else {
        Vec::new()
    };

    let climb_id = first_param(&pairs, "climbId").and_then(parse_id);
    let year = first_param(&pairs, "year")
        .and_then(|raw| raw.trim().parse::<i64>().ok())
        .filter(|y| (1900..=2200).contains(y));

    JournalFilter {
        view,
        query: (!normalized_q.is_empty()).then_some(normalized_q),
        tags,
        friend_ids,
        climb_id,
        date,
        date_from,
        date_to,
        year,
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawFeedCursor {
    version: Option<i64>,
    date: Option<String>,
    user_id: Option<String>,
    view: Option<String>,
}

fn parse_feed_cursor(raw: Option<&str>, view: &str) -> Result<Option<FeedCursor>, ()> {
    let Some(raw) = raw else {
        return Ok(None);
    };
    if raw.len() > 500 {
        return Err(());
    }
    let parsed: RawFeedCursor = serde_json::from_str(raw).map_err(|_| ())?;
    if parsed.version != Some(1) || parsed.view.as_deref() != Some(view) {
        return Err(());
    }
    let date = parsed.date.ok_or(())?;
    if !is_real_iso_date(&date) {
        return Err(());
    }
    let user_id = parsed.user_id.ok_or(())?;
    if user_id.trim().is_empty() || user_id.len() > 128 {
        return Err(());
    }
    Ok(Some(FeedCursor { date, user_id }))
}

#[worker::send]
pub async fn feed_api(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let pairs = parse_query_map(uri.query().unwrap_or(""));
    let view = if first_param(&pairs, "view") == Some("sends") {
        "sends"
    } else {
        "all"
    };
    let Ok(cursor) = parse_feed_cursor(first_param(&pairs, "cursor"), view) else {
        return Ok(no_store_json(
            StatusCode::BAD_REQUEST,
            json!({ "error": "Invalid feed cursor" }),
        ));
    };
    let prefs = grade_prefs_from_strings(
        &session.user.boulder_grade_scale,
        &session.user.rope_grade_scale,
    );
    let page = get_feed_page(
        state.db(),
        &session.user.id,
        view,
        cursor.as_ref(),
        FEED_PAGE_SIZE,
        prefs,
    )
    .await?;
    Ok(no_store_json(
        StatusCode::OK,
        serde_json::to_value(page).map_err(ApiError::internal)?,
    ))
}

#[worker::send]
pub async fn friend_companions(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let pairs = parse_query_map(uri.query().unwrap_or(""));
    let q = first_param(&pairs, "q").unwrap_or("");
    let friends = if q.trim().is_empty() {
        Vec::new()
    } else {
        search_companion_friends(state.db(), &session.user.id, q).await?
    };
    Ok(no_store_json(StatusCode::OK, json!({ "friends": friends })))
}

#[worker::send]
pub async fn climb_sends_api(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(raw_id): Path<String>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let Some(climb_id) = parse_id(&raw_id) else {
        return Ok(no_store_json(
            StatusCode::NOT_FOUND,
            json!({ "error": "Climb not found" }),
        ));
    };
    let Some(climb) = get_climb_by_id(state.db(), climb_id).await? else {
        return Ok(no_store_json(
            StatusCode::NOT_FOUND,
            json!({ "error": "Climb not found" }),
        ));
    };
    let pairs = parse_query_map(uri.query().unwrap_or(""));
    let Some(offset) = parse_offset_strict(&pairs) else {
        return Ok(no_store_json(
            StatusCode::OK,
            json!({ "sends": [], "hasMore": false }),
        ));
    };
    let page = get_sends_for_climb(
        state.db(),
        climb.id,
        offset,
        CLIMB_SENDS_PAGE_SIZE,
        Some(&session.user.id),
    )
    .await?;
    let has_more = page.has_more && offset + CLIMB_SENDS_PAGE_SIZE <= MAX_PAGINATION_OFFSET;
    Ok(no_store_json(
        StatusCode::OK,
        json!({ "sends": page.sends, "hasMore": has_more }),
    ))
}

#[worker::send]
pub async fn climb_lists_api(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(raw_id): Path<String>,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let Some(climb_id) = parse_id(&raw_id) else {
        return Ok(no_store_json(
            StatusCode::NOT_FOUND,
            json!({ "error": "Climb not found" }),
        ));
    };
    let lists = get_climb_list_choices(state.db(), &session.user.id, climb_id).await?;
    Ok(no_store_json(StatusCode::OK, json!({ "lists": lists })))
}

#[worker::send]
pub async fn user_sends_api(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let Some(user) = get_user_profile(state.db(), &user_id).await? else {
        return Ok(no_store_json(
            StatusCode::NOT_FOUND,
            json!({ "error": "User not found" }),
        ));
    };
    if user.is_private && user.id != session.user.id {
        return Ok(no_store_json(
            StatusCode::NOT_FOUND,
            json!({ "error": "User not found" }),
        ));
    }

    let raw_query = uri.query().unwrap_or("");
    let pairs = parse_query_map(raw_query);
    let Some(offset) = parse_offset_strict(&pairs) else {
        return Ok(no_store_json(
            StatusCode::OK,
            json!({ "sends": [], "hasMore": false, "areaBreadcrumbs": {} }),
        ));
    };
    let filter = parse_user_sends_filter(raw_query);
    let page = get_sends_for_user_page(
        state.db(),
        &user_id,
        &filter,
        offset,
        USER_SENDS_PAGE_SIZE,
        Some(&session.user.id),
    )
    .await?;
    let area_ids: Vec<i64> = page.sends.iter().map(|s| s.area_id).collect();
    let area_breadcrumbs = get_area_breadcrumbs(state.db(), &area_ids, 2).await?;
    let has_more = page.has_more && offset + USER_SENDS_PAGE_SIZE <= MAX_PAGINATION_OFFSET;

    Ok(no_store_json(
        StatusCode::OK,
        SendsResponse {
            page: betabook_db::sends::UserSendsPage {
                sends: page.sends,
                has_more,
            },
            area_breadcrumbs,
        },
    ))
}

#[worker::send]
pub async fn user_sends_export_api(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    if session.user.id != user_id {
        return Ok(no_store_json(
            StatusCode::FORBIDDEN,
            json!({ "error": "Forbidden" }),
        ));
    }
    let pairs = parse_query_map(uri.query().unwrap_or(""));
    let raw_after_id = first_param(&pairs, "afterId");
    let raw_after_date = first_param(&pairs, "afterDate");
    let cursor = match (raw_after_id, raw_after_date) {
        (None, None) => None,
        (Some(id_str), Some(date_str)) => {
            let Some(id) = parse_id(id_str) else {
                return Ok(no_store_json(
                    StatusCode::BAD_REQUEST,
                    json!({ "error": "Invalid export cursor" }),
                ));
            };
            let date_sent = if date_str == "null" {
                None
            } else if is_real_iso_date(date_str) {
                Some(date_str.to_string())
            } else {
                return Ok(no_store_json(
                    StatusCode::BAD_REQUEST,
                    json!({ "error": "Invalid export cursor" }),
                ));
            };
            Some(UserSendsExportCursor { date_sent, id })
        }
        _ => {
            return Ok(no_store_json(
                StatusCode::BAD_REQUEST,
                json!({ "error": "Invalid export cursor" }),
            ));
        }
    };

    let page = get_sends_for_user_export_page(state.db(), &user_id, cursor.as_ref()).await?;
    Ok(no_store_json(
        StatusCode::OK,
        serde_json::to_value(page).map_err(ApiError::internal)?,
    ))
}

#[worker::send]
pub async fn user_journal_api(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let viewer_id = &session.user.id;
    if !can_read_journal(state.db(), &user_id, Some(viewer_id)).await? {
        return Ok(no_store_json(
            StatusCode::NOT_FOUND,
            json!({ "error": "User not found" }),
        ));
    }

    let raw_query = uri.query().unwrap_or("");
    let pairs = parse_query_map(raw_query);
    let cursor_date = first_param(&pairs, "cursorDate");
    let raw_cursor_id = first_param(&pairs, "cursorId");
    if cursor_date.is_some() != raw_cursor_id.is_some() {
        return Ok(no_store_json(
            StatusCode::BAD_REQUEST,
            json!({ "error": "Invalid cursor" }),
        ));
    }
    let cursor = match (cursor_date, raw_cursor_id) {
        (Some(d), Some(id_str)) => {
            let Some(id) = parse_id(id_str) else {
                return Ok(no_store_json(
                    StatusCode::BAD_REQUEST,
                    json!({ "error": "Invalid cursor" }),
                ));
            };
            if !is_real_iso_date(d) {
                return Ok(no_store_json(
                    StatusCode::BAD_REQUEST,
                    json!({ "error": "Invalid cursor" }),
                ));
            }
            Some(JournalCursor {
                entry_date: d.to_string(),
                id,
            })
        }
        _ => None,
    };

    let filter = parse_journal_filter(raw_query, *viewer_id == user_id);
    let page = get_journal_page(
        state.db(),
        &user_id,
        Some(viewer_id),
        &filter,
        cursor.as_ref(),
        JOURNAL_PAGE_SIZE,
    )
    .await?;
    let area_ids: Vec<i64> = page.entries.iter().filter_map(|e| e.area_id).collect();
    let area_breadcrumbs = get_area_breadcrumbs(state.db(), &area_ids, 2).await?;

    Ok(no_store_json(
        StatusCode::OK,
        JournalResponse {
            page: JournalSlice {
                entries: page.entries,
                has_more: page.has_more,
            },
            area_breadcrumbs,
        },
    ))
}

#[worker::send]
pub async fn feed_page_loader(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let pairs = parse_query_map(uri.query().unwrap_or(""));
    let view = if first_param(&pairs, "view") == Some("sends") {
        "sends"
    } else {
        "all"
    };
    let prefs = grade_prefs_from_strings(
        &session.user.boulder_grade_scale,
        &session.user.rope_grade_scale,
    );
    let page = get_feed_page(
        state.db(),
        &session.user.id,
        view,
        None,
        FEED_PAGE_SIZE,
        prefs,
    )
    .await?;
    let friends = get_friends_page(state.db(), &session.user.id, false, 0).await?;
    Ok(no_store_json(
        StatusCode::OK,
        json!({
            "view": view,
            "page": page,
            "hasFriends": !friends.friends.is_empty(),
        }),
    ))
}

#[worker::send]
pub async fn friends_page_loader(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let pairs = parse_query_map(uri.query().unwrap_or(""));
    let view = if first_param(&pairs, "view") == Some("requests") {
        "requests"
    } else {
        "friends"
    };
    let requests_only = view == "requests";
    let page = get_friends_page(state.db(), &session.user.id, requests_only, 0).await?;
    let suggestions = if requests_only {
        None
    } else {
        get_climber_suggestions(state.db(), &session.user.id, 6)
            .await
            .ok()
    };
    Ok(no_store_json(
        StatusCode::OK,
        json!({
            "view": view,
            "page": page,
            "suggestions": suggestions,
        }),
    ))
}

#[worker::send]
pub async fn account_page_loader(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let user = get_account_user(state.db(), &session.user.id).await?;
    let is_private = user.as_ref().is_some_and(|u| u.is_private);
    let share_url = if is_private {
        None
    } else {
        get_profile_share_token(state.db(), &session.user.id)
            .await?
            .map(|token| {
                format!(
                    "{}/users/{}?share={}",
                    state.auth_url().trim_end_matches('/'),
                    session.user.id,
                    token
                )
            })
    };

    let turnstile_site_key = if state.env_var("TURNSTILE_SECRET_KEY").is_some() {
        state.env_var("TURNSTILE_SITE_KEY")
    } else {
        None
    };

    let catalog_export = if let Ok(bucket) = state.env().bucket("CATALOG_EXPORTS")
        && let Ok(Some(head)) = bucket.head(CATALOG_EXPORT_KEY).await
        && let Ok(meta) = head.custom_metadata()
    {
        let generated_at = meta.get("generatedAt").cloned();
        let area_count = meta.get("areaCount").and_then(|s| s.parse::<u64>().ok());
        let climb_count = meta.get("climbCount").and_then(|s| s.parse::<u64>().ok());
        match (generated_at, area_count, climb_count) {
            (Some(generated), Some(areas), Some(climbs)) => Some(json!({
                "generatedAt": generated,
                "areaCount": areas,
                "climbCount": climbs,
                "size": head.size(),
            })),
            _ => None,
        }
    } else {
        None
    };

    let role = user.as_ref().and_then(|u| u.role.as_deref());
    let name = user
        .as_ref()
        .map(|u| u.name.clone())
        .unwrap_or_else(|| session.user.name.clone());
    let image = user
        .as_ref()
        .and_then(|u| u.image.clone())
        .or_else(|| session.user.image.clone());

    Ok(no_store_json(
        StatusCode::OK,
        json!({
            "user": {
                "id": session.user.id,
                "name": name,
                "email": session.user.email,
                "image": image,
            },
            "isPrivate": is_private,
            "journalVisibility": user.as_ref().map(|u| u.journal_visibility.as_str()).unwrap_or("friends"),
            "sendCommentVisibility": user.as_ref().map(|u| u.send_comment_visibility.as_str()).unwrap_or("public"),
            "tripVisibility": user.as_ref().map(|u| u.trip_visibility.as_str()).unwrap_or("friends"),
            "climbListVisibility": user.as_ref().map(|u| u.climb_list_visibility.as_str()).unwrap_or("friends"),
            "gradePreferences": {
                "boulder": user.as_ref().map(|u| u.boulder_grade_scale.as_str()).unwrap_or("hueco"),
                "rope": user.as_ref().map(|u| u.rope_grade_scale.as_str()).unwrap_or("yds"),
            },
            "shareUrl": share_url,
            "turnstileSiteKey": turnstile_site_key,
            "catalogExport": catalog_export,
            "isAdmin": role == Some("admin"),
        }),
    ))
}

async fn load_journal_view_data(
    state: &AppState,
    owner_id: &str,
    viewer_id: &str,
    raw_query: &str,
) -> Result<JournalView, ApiError> {
    let is_owner = viewer_id == owner_id;
    let filter = parse_journal_filter(raw_query, is_owner);
    let has_entries = has_journal_entries(state.db(), owner_id, Some(viewer_id)).await?;
    let first_page = get_journal_page(
        state.db(),
        owner_id,
        Some(viewer_id),
        &filter,
        None,
        JOURNAL_PAGE_SIZE,
    )
    .await?;
    let filtered_climb_name = match filter.climb_id {
        Some(cid) => get_climb_by_id(state.db(), cid).await?.map(|c| c.name),
        None => None,
    };
    let tour_state = if is_owner {
        get_product_tour_state(state.db(), owner_id).await?
    } else {
        None
    };
    let tags = get_user_hashtags(state.db(), owner_id, Some(viewer_id), false, true).await?;
    let friends = if is_owner {
        get_journal_filter_friends(state.db(), owner_id).await?
    } else {
        Vec::new()
    };
    let area_ids: Vec<i64> = first_page
        .entries
        .iter()
        .filter_map(|e| e.area_id)
        .collect();
    let area_breadcrumbs = get_area_breadcrumbs(state.db(), &area_ids, 2).await?;

    Ok(JournalView {
        has_entries,
        first_page: JournalSlice {
            entries: first_page.entries,
            has_more: first_page.has_more,
        },
        area_breadcrumbs,
        tags,
        friends,
        filtered_climb_name,
        tour_state,
    })
}

async fn load_sends_view_data(
    state: &AppState,
    owner_id: &str,
    viewer_id: &str,
    raw_query: &str,
) -> Result<SendsView, ApiError> {
    let filter = parse_user_sends_filter(raw_query);
    let has_sends = has_user_sends(state.db(), owner_id).await?;
    let first_page = get_sends_for_user_page(
        state.db(),
        owner_id,
        &filter,
        0,
        USER_SENDS_PAGE_SIZE,
        Some(viewer_id),
    )
    .await?;
    let tags = get_user_hashtags(state.db(), owner_id, Some(viewer_id), true, false).await?;
    let area_ids: Vec<i64> = first_page.sends.iter().map(|s| s.area_id).collect();
    let area_breadcrumbs = get_area_breadcrumbs(state.db(), &area_ids, 2).await?;

    Ok(SendsView {
        has_sends,
        first_page,
        area_breadcrumbs,
        tags,
    })
}

#[worker::send]
pub async fn user_profile_page_loader(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let raw_query = uri.query().unwrap_or("");
    let token = profile_token_from_query(raw_query);
    let session = if token.is_some() {
        resolve_optional_session(&state, &headers)
            .await?
            .filter(|s| {
                has_accepted_current_terms(
                    s.user.terms_version.as_deref(),
                    s.user.terms_accepted_at,
                )
            })
    } else {
        Some(require_member_session(&state, &headers).await?)
    };
    let Some(session) = session else {
        let token = token.ok_or_else(ApiError::unauthorized)?;
        let Some(owner) = get_share_link_owner(state.db(), &token).await? else {
            return Err(ApiError::unauthorized());
        };
        if owner.id != user_id {
            return Err(ApiError::unauthorized());
        }
        let hardest =
            get_climber_hardest(state.db(), &owner.id, GradePreferences::default()).await?;
        let summary =
            get_user_sends_summary(state.db(), &owner.id, GradePreferences::default()).await?;
        let recent = get_sends_for_user_page(
            state.db(),
            &owner.id,
            &UserSendsFilter::default(),
            0,
            SHARED_PROFILE_SENDS,
            None,
        )
        .await?;
        let area_ids: Vec<i64> = recent.sends.iter().map(|s| s.area_id).collect();
        let area_breadcrumbs = get_area_breadcrumbs(state.db(), &area_ids, 2).await?;
        return Ok(no_store_json(
            StatusCode::OK,
            ProfilePage::Shared(SharedProfile {
                owner: SharedOwner {
                    id: owner.id,
                    name: owner.name,
                    image: owner.image,
                },
                token: token.to_owned(),
                hardest,
                send_count: summary.send_count,
                sends: recent.sends,
                area_breadcrumbs,
            }),
        ));
    };

    let viewer_id = &session.user.id;
    let Some(profile) = get_user_profile(state.db(), &user_id).await? else {
        return Ok(no_store_json(
            StatusCode::NOT_FOUND,
            json!({ "error": "User not found" }),
        ));
    };
    if profile.is_private && profile.id != *viewer_id {
        return Ok(no_store_json(
            StatusCode::NOT_FOUND,
            json!({ "error": "User not found" }),
        ));
    }

    let is_owner = *viewer_id == profile.id;
    let access = get_profile_access(state.db(), &profile.id, viewer_id).await?;
    let relationship = if is_owner {
        "none".to_string()
    } else {
        get_friendship_status(state.db(), viewer_id, &profile.id).await?
    };
    let prefs = grade_prefs_from_strings(
        &session.user.boulder_grade_scale,
        &session.user.rope_grade_scale,
    );
    let hardest = get_climber_hardest(state.db(), &profile.id, prefs).await?;

    if access.journal {
        let journal = load_journal_view_data(&state, &profile.id, viewer_id, raw_query).await?;
        Ok(no_store_json(
            StatusCode::OK,
            ProfilePage::Member(ProfileTab::Journal(JournalWorkspace {
                header: ProfileHeaderData {
                    user: profile,
                    is_owner,
                    relationship,
                    access,
                    hardest,
                },
                journal,
            })),
        ))
    } else {
        let sends = load_sends_view_data(&state, &profile.id, viewer_id, raw_query).await?;
        Ok(no_store_json(
            StatusCode::OK,
            ProfilePage::Member(ProfileTab::Sends(SendsWorkspace {
                header: ProfileHeaderData {
                    user: profile,
                    is_owner,
                    relationship,
                    access,
                    hardest,
                },
                sends,
            })),
        ))
    }
}

#[worker::send]
pub async fn user_sends_page_loader(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let viewer_id = &session.user.id;
    let Some(header) = profile_header_data(&state, &user_id, &session).await? else {
        return Ok(no_store_json(
            StatusCode::NOT_FOUND,
            json!({ "error": "User not found" }),
        ));
    };
    let sends =
        load_sends_view_data(&state, &user_id, viewer_id, uri.query().unwrap_or("")).await?;

    Ok(no_store_json(
        StatusCode::OK,
        SendsWorkspace { header, sends },
    ))
}

#[worker::send]
pub async fn user_journal_page_loader(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let viewer_id = &session.user.id;
    let Some(profile) = get_user_profile(state.db(), &user_id).await? else {
        return Ok(no_store_json(
            StatusCode::NOT_FOUND,
            json!({ "error": "User not found" }),
        ));
    };
    if !can_read_journal(state.db(), &profile.id, Some(viewer_id)).await? {
        return Ok(no_store_json(
            StatusCode::NOT_FOUND,
            json!({ "error": "User not found" }),
        ));
    }

    let is_owner = *viewer_id == profile.id;
    let access = get_profile_access(state.db(), &profile.id, viewer_id).await?;
    let relationship = if is_owner {
        "none".to_string()
    } else {
        get_friendship_status(state.db(), viewer_id, &profile.id).await?
    };
    let prefs = grade_prefs_from_strings(
        &session.user.boulder_grade_scale,
        &session.user.rope_grade_scale,
    );
    let hardest = get_climber_hardest(state.db(), &profile.id, prefs).await?;
    let journal =
        load_journal_view_data(&state, &profile.id, viewer_id, uri.query().unwrap_or("")).await?;

    Ok(no_store_json(
        StatusCode::OK,
        JournalWorkspace {
            header: ProfileHeaderData {
                user: profile,
                is_owner,
                relationship,
                access,
                hardest,
            },
            journal,
        },
    ))
}

#[worker::send]
pub async fn area_page_loader(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(raw_id): Path<String>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let Some(area_id) = parse_id(&raw_id) else {
        return Ok(no_store_json(
            StatusCode::NOT_FOUND,
            json!({ "error": "Area not found" }),
        ));
    };
    let Some(area) = get_area_with_subtree_size(state.db(), area_id).await? else {
        return Ok(no_store_json(
            StatusCode::NOT_FOUND,
            json!({ "error": "Area not found" }),
        ));
    };
    let trail = get_public_area_trail(state.db(), area_id).await?;
    let ancestors = &trail[..trail.len().saturating_sub(1)];
    let subareas = get_public_subareas(state.db(), area_id).await?;
    let grade_histogram_rows = if area.large_subtree {
        Vec::new()
    } else {
        get_subtree_grade_histogram(state.db(), area_id).await?
    };

    let raw_query = uri.query().unwrap_or("");
    let subarea_id = form_urlencoded::parse(raw_query.as_bytes())
        .find(|(k, _)| k == "subarea")
        .and_then(|(_, v)| parse_id(&v));
    let scope = resolve_public_subarea(
        state.db(),
        &PublicArea {
            id: area.id,
            name: area.name.clone(),
            parent_id: area.parent_id,
        },
        subarea_id,
    )
    .await?;

    let mut options = parse_member_catalog_options(raw_query, &session.user.id, PAGE_SIZE);
    options.area_id = Some(scope.id);
    let page = search_public_climbs(state.db(), &options).await?;
    let climb_ids: Vec<i64> = page.climbs.iter().map(|c| c.id).collect();
    let area_ids: Vec<i64> = page.climbs.iter().map(|c| c.area_id).collect();
    let send_stats = get_climb_send_stats(state.db(), &climb_ids).await?;
    let area_breadcrumbs = get_area_breadcrumbs(state.db(), &area_ids, 2).await?;
    let sent_climb_ids = get_user_sent_climb_ids(state.db(), &session.user.id, &climb_ids).await?;
    let offset = options.offset.unwrap_or(0);
    let has_next_page = page.has_next_page && offset + PAGE_SIZE <= MAX_PAGINATION_OFFSET;

    Ok(no_store_json(
        StatusCode::OK,
        json!({
            "area": area,
            "ancestors": ancestors,
            "subareas": subareas,
            "gradeHistogramRows": grade_histogram_rows,
            "climbsPage": {
                "climbs": page.climbs,
                "hasNextPage": has_next_page,
                "sendStats": send_stats,
                "areaBreadcrumbs": area_breadcrumbs,
                "sentClimbIds": sent_climb_ids,
            },
        }),
    ))
}

#[worker::send]
pub async fn climb_page_loader(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(raw_id): Path<String>,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let Some(climb_id) = parse_id(&raw_id) else {
        return Ok(no_store_json(
            StatusCode::NOT_FOUND,
            json!({ "error": "Climb not found" }),
        ));
    };
    let Some(climb) = get_climb_by_id(state.db(), climb_id).await? else {
        return Ok(no_store_json(
            StatusCode::NOT_FOUND,
            json!({ "error": "Climb not found" }),
        ));
    };
    let trail = get_public_area_trail(state.db(), climb.area_id).await?;
    let area = trail.last().cloned();
    let ancestors = &trail[..trail.len().saturating_sub(1)];

    let viewer_id = &session.user.id;
    let user_send = get_user_send_for_climb(state.db(), viewer_id, climb.id)
        .await?
        .map(betabook_db::sends::SendRecord::into_editable);
    let summary = get_climb_send_summary(state.db(), climb.id).await?;
    let journal_entries = get_journal_for_climb(
        state.db(),
        viewer_id,
        Some(viewer_id),
        climb.id,
        CLIMB_JOURNAL_ENTRY_LIMIT,
    )
    .await?;
    let videos = get_climb_videos(state.db(), climb.id, Some(viewer_id), CLIMB_VIDEO_LIMIT).await?;
    let sends_page = get_sends_for_climb(
        state.db(),
        climb.id,
        0,
        CLIMB_SENDS_PAGE_SIZE,
        Some(viewer_id),
    )
    .await?;

    Ok(no_store_json(
        StatusCode::OK,
        json!({
            "climb": climb,
            "area": area,
            "ancestors": ancestors,
            "userSend": user_send,
            "summary": summary,
            "journalEntries": journal_entries,
            "videos": videos,
            "sendsPage": sends_page,
        }),
    ))
}

#[worker::send]
pub async fn new_climb_page_loader(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let _session = require_member_session(&state, &headers).await?;
    let pairs = parse_query_map(uri.query().unwrap_or(""));
    let selected_id = first_param(&pairs, "areaId").and_then(parse_id);
    let selected_area = if let Some(id) = selected_id {
        let trail = get_public_area_trail(state.db(), id).await?;
        trail.last().map(|area| {
            let ancestor_path = trail[..trail.len().saturating_sub(1)]
                .iter()
                .map(|a| a.name.as_str())
                .collect::<Vec<_>>()
                .join(" / ");
            json!({
                "id": area.id,
                "name": area.name,
                "ancestorPath": ancestor_path,
            })
        })
    } else {
        None
    };

    Ok(no_store_json(
        StatusCode::OK,
        json!({ "selectedArea": selected_area }),
    ))
}

#[worker::send]
pub async fn tutorial_state(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let progress = get_product_tour_state(state.db(), &session.user.id)
        .await?
        .ok_or_else(ApiError::unauthorized)?;
    Ok(no_store_json(StatusCode::OK, json!(progress)))
}
