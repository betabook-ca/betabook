use axum::{
    extract::{OriginalUri, Path, State},
    http::{HeaderMap, StatusCode},
    response::Response,
};
use betabook_db::{
    auth::AuthSession,
    climb_lists::{self as db, ListAccess},
    public_catalog::get_area_breadcrumbs,
    sends::MutationError,
    social::get_account_user,
};
use betabook_domain::{
    climb_lists::{INVALID_EDIT, LIST_MISSING, LIST_UNAVAILABLE, ListInput},
    profile_share::{parse_share_token, share_expiry_modifier},
    public_catalog::{parse_id, parse_member_catalog_options, parse_public_catalog_options},
};
use serde_json::{Value, json};

use super::actions::{action_err, action_ok, action_value, allow_rate_limit, map_mutation_result};
use super::member_pages::{ProfileHeaderData, no_store_json, profile_header_data};
use crate::{
    auth::session::{require_member_session, resolve_optional_session},
    state::{ApiError, AppState},
};

fn missing() -> ApiError {
    ApiError::new(StatusCode::NOT_FOUND, "List not found").no_store()
}

async fn profile(
    state: &AppState,
    owner: &str,
    session: &AuthSession,
) -> Result<ProfileHeaderData, ApiError> {
    profile_header_data(state, owner, session)
        .await?
        .filter(|p| p.access.lists)
        .ok_or_else(missing)
}

#[worker::send]
pub async fn index(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(owner): Path<String>,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let header = profile(&state, &owner, &session).await?;
    let audience = if header.is_owner {
        get_account_user(state.db(), &owner).await?.map(|u| {
            if u.is_private {
                "private".to_owned()
            } else {
                u.climb_list_visibility
            }
        })
    } else {
        None
    };
    let lists = db::lists(state.db(), &owner, &session.user.id).await?;
    Ok(no_store_json(
        StatusCode::OK,
        json!({"mode":"index","header":header,"lists":lists,"audience":audience}),
    ))
}

async fn item_payload(
    state: &AppState,
    access: ListAccess<'_>,
    viewer: Option<&str>,
    raw: &str,
) -> Result<Value, ApiError> {
    let sort = url::form_urlencoded::parse(raw.as_bytes())
        .find(|(k, _)| k == "sort")
        .map(|(_, v)| v.into_owned())
        .unwrap_or_default();
    let options = match viewer {
        Some(id) => parse_member_catalog_options(raw, id, 50),
        None => parse_public_catalog_options(raw),
    };
    let items = db::items(state.db(), access, viewer, &options, &sort).await?;
    let areas: Vec<i64> = items.iter().map(|i| i.area_id).collect();
    let breadcrumbs = get_area_breadcrumbs(state.db(), &areas, 2).await?;
    Ok(json!({"items":items,"areaBreadcrumbs":breadcrumbs}))
}

#[worker::send]
pub async fn detail(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, raw)): Path<(String, String)>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let session = require_member_session(&state, &headers).await?;
    let viewer = &session.user.id;
    let id = parse_id(&raw).ok_or_else(missing)?;
    let header = profile(&state, &owner, &session).await?;
    let access = ListAccess::Member {
        list_id: id,
        viewer,
    };
    let list = db::list(state.db(), &owner, access)
        .await?
        .ok_or_else(missing)?;
    let share = if header.is_owner {
        db::owner_share(state.db(), viewer, id).await?
    } else {
        None
    };
    let page = item_payload(&state, access, Some(viewer), uri.query().unwrap_or("")).await?;
    Ok(no_store_json(
        StatusCode::OK,
        json!({"mode":"detail","header":header,"list":list,"share":share,"shareOrigin":state.auth_url().trim_end_matches('/'),"page":page}),
    ))
}

pub(super) async fn shared_viewer(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<Option<String>, ApiError> {
    let session = resolve_optional_session(state, headers).await?;
    Ok(session
        .filter(|s| {
            betabook_domain::terms::has_accepted_current_terms(
                s.user.terms_version.as_deref(),
                s.user.terms_accepted_at,
            )
        })
        .map(|s| s.user.id))
}

#[worker::send]
pub async fn shared(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(raw): Path<String>,
    OriginalUri(uri): OriginalUri,
) -> Result<Response, ApiError> {
    let token = parse_share_token(&raw).ok_or_else(missing)?;
    let shared = db::shared_list(state.db(), token)
        .await?
        .ok_or_else(missing)?;
    let member = shared_viewer(&state, &headers).await?;
    let viewer = member.as_deref();
    let data = if viewer == Some(shared.owner_id.as_str()) {
        json!({"mode":"owner","ownerId":shared.owner_id,"listId":shared.list.id})
    } else if !shared.live {
        json!({"mode":"expired"})
    } else {
        let page = item_payload(
            &state,
            ListAccess::Link(token),
            viewer,
            uri.query().unwrap_or(""),
        )
        .await?;
        // A link represents exactly one list. Its database id and private profile fields
        // never enter this payload, even for a member with permission to copy it.
        json!({"mode":"shared","owner":{"id":shared.owner_id,"name":shared.owner_name,"image":shared.owner_image},
            "list":{"title":shared.list.title,"description":shared.list.description,"climbCount":shared.list.climb_count},"page":page})
    };
    Ok(no_store_json(StatusCode::OK, data))
}

fn invalid(msg: &str) -> MutationError {
    MutationError::Validation(msg.to_owned())
}
fn id(value: Option<&Value>, message: &str) -> Result<i64, MutationError> {
    value
        .and_then(Value::as_i64)
        .filter(|n| (1..=9_007_199_254_740_991).contains(n))
        .ok_or_else(|| invalid(message))
}

fn input(raw: Option<&Value>) -> Result<ListInput, MutationError> {
    let raw = raw
        .and_then(Value::as_object)
        .ok_or_else(|| invalid("Check the form"))?;
    let title = raw
        .get("title")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid("Name your list."))?;
    let description = match raw.get("description") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) => Some(s.as_str()),
        _ => return Err(invalid("Check the form")),
    };
    ListInput::parse(title, description).map_err(invalid)
}

async fn mutate(
    state: &AppState,
    owner: &str,
    name: &str,
    args: &[Value],
) -> Result<Option<Value>, MutationError> {
    let db = state.db();
    let first = args.first();
    if name == "createClimbList" {
        let climb = args
            .get(1)
            .and_then(|obj| obj.get("climbId"))
            .map(|v| id(Some(v), "Climb not found"))
            .transpose()?;
        return Ok(Some(json!(
            db::create(db, owner, &input(first)?, climb).await?
        )));
    }
    if name == "copyClimbList" {
        let source = if let Some(raw) = first.and_then(|v| v.get("token")) {
            ListAccess::Link(
                raw.as_str()
                    .and_then(parse_share_token)
                    .ok_or_else(|| invalid(LIST_UNAVAILABLE))?,
            )
        } else {
            ListAccess::Member {
                list_id: id(first.and_then(|v| v.get("listId")), LIST_UNAVAILABLE)?,
                viewer: owner,
            }
        };
        return Ok(Some(json!(
            db::copy(db, owner, &input(args.get(1))?, source).await?
        )));
    }
    let list = id(first, LIST_MISSING)?;
    match name {
        "updateClimbList" => db::update(db, owner, list, &input(args.get(1))?).await?,
        "deleteClimbList" => db::delete(db, owner, list).await?,
        "addClimbToList" => {
            return Ok(Some(json!(
                db::add(db, owner, list, id(args.get(1), "Climb not found")?).await?
            )));
        }
        "saveClimbListEdits" => {
            let order = args
                .get(1)
                .and_then(Value::as_array)
                .ok_or_else(|| invalid(INVALID_EDIT))?;
            let ids = order
                .iter()
                .map(|v| id(Some(v), INVALID_EDIT))
                .collect::<Result<Vec<_>, _>>()?;
            db::save_edits(db, owner, list, &ids).await?;
        }
        "shareClimbList" => {
            let modifier = share_expiry_modifier(args.get(1).and_then(Value::as_str).unwrap_or(""))
                .map_err(invalid)?;
            return Ok(Some(json!(db::share(db, owner, list, modifier).await?)));
        }
        "unshareClimbList" => db::unshare(db, owner, list).await?,
        _ => return Err(invalid("Unknown list action")),
    }
    Ok(None)
}

pub(super) async fn action(
    state: &AppState,
    headers: &HeaderMap,
    name: &str,
    args: &[Value],
) -> Result<Response, ApiError> {
    let session = match require_member_session(state, headers).await {
        Ok(s) => s,
        Err(e) => return Ok(action_err(e.message)),
    };
    let owner = &session.user.id;
    if name != "unshareClimbList"
        && !allow_rate_limit(state, "CLIMB_LIST_RATE_LIMITER", owner).await
    {
        return Ok(action_err("Too many changes — try again in a minute"));
    }
    map_mutation_result(
        mutate(state, owner, name, args).await,
        |value| match value {
            Some(v) => action_value(v),
            None => action_ok(),
        },
    )
}
