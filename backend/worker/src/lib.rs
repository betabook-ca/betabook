mod auth;
mod middleware;
mod observability;
mod routes;
mod rpc;
mod state;

use axum::{
    Json, Router,
    extract::State,
    routing::{get, post},
};
use serde::Serialize;
use tower_service::Service;
use worker::{Context, Env, HttpRequest, Result, event, wasm_bindgen};

use crate::middleware::apply_security_headers;
use crate::state::AppState;

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Serialize)]
struct HealthResponse {
    ok: bool,
    timezone: Option<String>,
}

async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
    Json(HealthResponse {
        ok: true,
        timezone: state.cf_timezone,
    })
}

// Both the HTTP router and the OpenAPI coverage check expand this table.
macro_rules! worker_routes {
    ($consumer:ident) => {
        $consumer! {
            get "/api/health" => health;
            get "/api/public/usage" => routes::usage::usage;
            get "/api/auth/get-session" => auth::routes::get_session;
            post "/api/auth/sign-up/email" => auth::routes::sign_up_email;
            post "/api/auth/send-verification-email" => auth::routes::send_verification_email_route;
            get "/api/auth/verify-email" => auth::routes::verify_email;
            post "/api/auth/sign-in/email" => auth::routes::sign_in_email;
            get "/api/auth/reset-password/{token}" => auth::routes::reset_link;
            post "/api/auth/sign-out" => auth::routes::sign_out;
            post "/api/auth/request-password-reset" => auth::routes::request_password_reset;
            post "/api/auth/reset-password" => auth::routes::reset_password;
            post "/api/auth/sign-in/social" => auth::routes::sign_in_social;
            get "/api/auth/callback/google" => auth::routes::google_callback;
            post "/api/auth/delete-user" => auth::routes::delete_user;
            get "/api/terms/status" => auth::routes::terms_status;
            post "/api/terms/accept" => auth::routes::accept_terms;
            get "/api/avatars/{*key}" => routes::avatars::get_avatar;
            get "/api/catalog/export" => routes::catalog_export::download_catalog_export;
            get "/api/public/search/climbs" => routes::public_catalog::search_climbs;
            get "/api/public/search/areas" => routes::public_catalog::search_areas;
            get "/api/public/areas/{id}/climbs" => routes::public_catalog::area_climbs;
            get "/api/public/areas/{id}" => routes::public_catalog::area_details;
            get "/api/public/climbs/{id}" => routes::public_catalog::climb_details;
            get "/robots.txt" => routes::seo::robots_txt;
            get "/sitemap-index.xml" => routes::seo::sitemap_index;
            get "/sitemap/{shard}" => routes::seo::sitemap_shard;
            get "/about" => routes::static_pages::about_page;
            get "/terms" => routes::static_pages::terms_page;
            get "/terms/{version}" => routes::static_pages::terms_version_page;
            get "/api/config/auth" => routes::member_search::auth_config;
            get "/api/search/climbs" => routes::member_search::search_climbs;
            get "/api/search/areas" => routes::member_search::search_areas;
            get "/api/search/climbers" => routes::member_search::search_climbers;
            get "/api/areas/{id}/climbs" => routes::member_search::area_climbs;
            get "/api/friends" => routes::member_search::friends_list;
            get "/api/friends/suggestions" => routes::member_search::friend_suggestions;
            get "/api/friends/companions" => routes::member_pages::friend_companions;
            get "/api/feed" => routes::member_pages::feed_api;
            get "/api/climbs/{id}/sends" => routes::member_pages::climb_sends_api;
            get "/api/climbs/{id}/lists" => routes::member_pages::climb_lists_api;
            get "/api/users/{id}/sends" => routes::member_pages::user_sends_api;
            get "/api/users/{id}/sends/export" => routes::member_pages::user_sends_export_api;
            get "/api/users/{id}/journal" => routes::member_pages::user_journal_api;
            get "/api/pages/users/{id}/projects" => routes::projects::board;
            get "/api/pages/projects/{token}" => routes::projects::shared;
            get "/projects/{token}" => routes::seo::shared_project_page;
            get "/users/{id}/projects" => routes::seo::owner_progress_page;
            get "/users/{id}/projects/sent" => routes::seo::owner_progress_page;
            get "/api/pages/users/{id}/lists" => routes::climb_lists::index;
            get "/api/pages/users/{id}/lists/{list_id}" => routes::climb_lists::detail;
            get "/api/pages/lists/{token}" => routes::climb_lists::shared;
            get "/users/{id}/lists" => routes::seo::member_list_html;
            get "/users/{id}/lists/{list_id}" => routes::seo::member_list_html;
            get "/lists/{token}" => routes::seo::shared_list_html;
            get "/users/{id}/analytics" => routes::profile_analytics::html;
            get "/api/pages/users/{id}/analytics" => routes::profile_analytics::page;
            get "/users/{id}/trips" => routes::trips::member_html;
            get "/users/{id}/trips/{trip}" => routes::trips::member_html;
            get "/users/{id}/trips/{trip}/analytics" => routes::trips::member_html;
            get "/trips/{token}" => routes::trips::shared_html;
            get "/trips/{token}/analytics" => routes::trips::shared_html;
            get "/api/pages/users/{id}/trips" => routes::trips::list;
            get "/api/pages/users/{id}/trips/{trip}" => routes::trips::detail;
            get "/api/pages/users/{id}/trips/{trip}/analytics" => routes::trips::detail;
            get "/api/pages/users/{id}/trips/{trip}/photos" => routes::trips::photos;
            get "/api/pages/trips/{token}/photos" => routes::trips::shared_photos;
            get "/api/pages/trips/{token}" => routes::trips::shared;
            get "/api/pages/trips/{token}/analytics" => routes::trips::shared;
            get "/api/users/{id}/goals" => routes::goals::read;
            get "/api/pages/users/{id}/goals" => routes::goals::overview;
            get "/users/{id}/goals" => routes::seo::owner_progress_page;
            get "/tutorial/{tour}" => routes::entry_pages::tutorial;
            get "/tutorial/{tour}/{step}" => routes::entry_pages::tutorial;
            get "/users/{id}" => routes::entry_pages::profile;
            get "/users/{id}/journal" => routes::entry_pages::profile;
            get "/users/{id}/sends" => routes::entry_pages::profile;
            get "/admin/requests" => routes::moderation::html;
            get "/api/pages/admin/requests" => routes::moderation::queue;
            get "/api/pages/tutorial" => routes::member_pages::tutorial_state;
            get "/api/pages/feed" => routes::member_pages::feed_page_loader;
            get "/api/pages/friends" => routes::member_pages::friends_page_loader;
            get "/api/pages/account" => routes::member_pages::account_page_loader;
            get "/api/pages/users/{id}" => routes::member_pages::user_profile_page_loader;
            get "/api/pages/users/{id}/sends" => routes::member_pages::user_sends_page_loader;
            get "/api/pages/users/{id}/journal" => routes::member_pages::user_journal_page_loader;
            get "/api/pages/areas/{id}" => routes::member_pages::area_page_loader;
            get "/api/pages/climbs/new" => routes::member_pages::new_climb_page_loader;
            get "/api/pages/climbs/{id}" => routes::member_pages::climb_page_loader;
            get "/account/import" => routes::imports::html;
            get "/api/import/kaya" => routes::import_sources::kaya;
            get "/api/import/mountain-project" => routes::import_sources::mountain_project;
            post "/api/client-errors" => routes::actions::client_errors;
            post "/api/actions/{name}" => routes::actions::dispatch_action;
            get "/areas/new" => routes::seo::spa_fallback;
            get "/climbs/new" => routes::seo::spa_fallback;
            get "/areas/{id}" => routes::seo::area_page;
            get "/areas/{id}/{*slug}" => routes::seo::area_page_with_slug;
            get "/climbs/{id}" => routes::seo::climb_page;
            get "/climbs/{id}/{*slug}" => routes::seo::climb_page_with_slug;

        }
    };
}
macro_rules! build_router {
    ($( $method:ident $path:literal => $handler:path; )*) => {
        Router::new()$(.route($path, $method($handler)))*
    };
}

#[cfg(feature = "api-spec")]
pub mod api_contract;

fn router(state: AppState) -> Router {
    worker_routes!(build_router)
        .fallback(routes::seo::spa_fallback)
        .with_state(state)
}

#[event(fetch)]
async fn fetch(
    req: HttpRequest,
    env: Env,
    ctx: Context,
) -> Result<http::Response<axum::body::Body>> {
    let path = req.uri().path().to_string();
    let state = match AppState::from_request(&req, env, ctx) {
        Ok(state) => state,
        Err(error) => {
            use axum::response::IntoResponse;
            let detail = observability::ErrorDetail::new(error);
            observability::request_error(req.method().as_str(), &path, Some(&detail));
            return Ok(apply_security_headers(
                &path,
                (
                    http::StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error":"Internal server error"})),
                )
                    .into_response(),
            ));
        }
    };
    let auth_path = path.strip_prefix("/api/auth/");
    if req.method() == http::Method::POST
        && !(if auth_path.is_some() {
            middleware::trusted_auth_write(req.headers(), &state.request_origin, &state.auth_url())
        } else {
            middleware::trusted_write(req.headers(), &state.request_origin)
        })
    {
        use axum::response::IntoResponse;
        return Ok(apply_security_headers(
            &path,
            (
                http::StatusCode::FORBIDDEN,
                Json(serde_json::json!({"error":"Invalid origin"})),
            )
                .into_response(),
        ));
    }
    if let Some(path_suffix) = auth_path
        && !middleware::local_auth_base(&state.auth_url())
        && let Some(response) =
            auth::limits::check(req.headers(), &format!("/{path_suffix}"), state.now_ms())
    {
        return Ok(apply_security_headers(&path, response));
    }
    let method = req.method().to_string();
    let mut response = router(state.clone()).call(req).await?;
    state.apply_renewed_cookie(&mut response);
    if response.status().is_server_error() {
        observability::request_error(
            &method,
            &path,
            response.extensions().get::<observability::ErrorDetail>(),
        );
    }
    Ok(apply_security_headers(&path, response))
}

// workers-rs' #[event(scheduled)] discards the handler result. Return the
// promise directly so Cloudflare records an export failure as a failed run.
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn scheduled(
    _event: worker::worker_sys::ScheduledEvent,
    env: Env,
    _ctx: worker::worker_sys::ScheduleContext,
) -> worker::js_sys::Promise {
    worker::wasm_bindgen_futures::future_to_promise(async move {
        routes::catalog_export::run_scheduled_catalog_export(&env)
            .await
            .map_err(|error| {
                observability::background_error("catalog_export", error);
                worker::js_sys::Error::new("Catalog export failed")
            })?;
        Ok(wasm_bindgen::JsValue::UNDEFINED)
    })
}
