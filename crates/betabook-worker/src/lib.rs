mod auth;
mod middleware;
mod routes;
mod state;

use axum::{
    Json, Router,
    extract::State,
    routing::{get, post},
};
use serde::Serialize;
use tower_service::Service;
use worker::{Context, Env, HttpRequest, Result, ScheduleContext, ScheduledEvent, event};

use crate::middleware::apply_security_headers;
use crate::state::AppState;

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

fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(health))
        // Auth & Terms
        .route("/api/auth/get-session", get(auth::routes::get_session))
        .route("/api/auth/sign-up/email", post(auth::routes::sign_up_email))
        .route(
            "/api/auth/send-verification-email",
            post(auth::routes::send_verification_email_route),
        )
        .route("/api/auth/verify-email", get(auth::routes::verify_email))
        .route("/api/auth/sign-in/email", post(auth::routes::sign_in_email))
        .route("/api/auth/sign-out", post(auth::routes::sign_out))
        .route(
            "/api/auth/request-password-reset",
            post(auth::routes::request_password_reset),
        )
        .route(
            "/api/auth/reset-password",
            post(auth::routes::reset_password),
        )
        .route(
            "/api/auth/sign-in/social",
            post(auth::routes::sign_in_social),
        )
        .route(
            "/api/auth/callback/google",
            get(auth::routes::google_callback),
        )
        .route("/api/auth/delete-user", post(auth::routes::delete_user))
        .route("/api/terms/status", get(auth::routes::terms_status))
        .route("/api/terms/accept", post(auth::routes::accept_terms))
        // Avatars & Catalog Export
        .route("/api/avatars/{*key}", get(routes::avatars::get_avatar))
        .route(
            "/api/catalog/export",
            get(routes::catalog_export::download_catalog_export),
        )
        // Public catalog & search APIs
        .route(
            "/api/public/search/climbs",
            get(routes::public_catalog::search_climbs),
        )
        .route(
            "/api/public/search/areas",
            get(routes::public_catalog::search_areas),
        )
        .route(
            "/api/public/areas/{id}/climbs",
            get(routes::public_catalog::area_climbs),
        )
        .route(
            "/api/public/areas/{id}",
            get(routes::public_catalog::area_details),
        )
        .route(
            "/api/public/climbs/{id}",
            get(routes::public_catalog::climb_details),
        )
        // SEO & Entity HTML entrypoints + Zero-JS Static Pages
        .route("/robots.txt", get(routes::seo::robots_txt))
        .route("/sitemap-index.xml", get(routes::seo::sitemap_index))
        .route("/sitemap/{shard}", get(routes::seo::sitemap_shard))
        .route("/about", get(routes::static_pages::about_page))
        .route("/terms", get(routes::static_pages::terms_page))
        .route(
            "/terms/{version}",
            get(routes::static_pages::terms_version_page),
        )
        // SPA config, member search, friends, and client action/error RPCs
        .route("/api/config/auth", get(routes::member_search::auth_config))
        .route(
            "/api/search/climbs",
            get(routes::member_search::search_climbs),
        )
        .route(
            "/api/search/areas",
            get(routes::member_search::search_areas),
        )
        .route(
            "/api/search/climbers",
            get(routes::member_search::search_climbers),
        )
        .route(
            "/api/areas/{id}/climbs",
            get(routes::member_search::area_climbs),
        )
        .route("/api/friends", get(routes::member_search::friends_list))
        .route(
            "/api/friends/suggestions",
            get(routes::member_search::friend_suggestions),
        )
        .route(
            "/api/friends/companions",
            get(routes::member_pages::friend_companions),
        )
        .route("/api/feed", get(routes::member_pages::feed_api))
        .route(
            "/api/climbs/{id}/sends",
            get(routes::member_pages::climb_sends_api),
        )
        .route(
            "/api/climbs/{id}/lists",
            get(routes::member_pages::climb_lists_api),
        )
        .route(
            "/api/users/{id}/sends",
            get(routes::member_pages::user_sends_api),
        )
        .route(
            "/api/users/{id}/sends/export",
            get(routes::member_pages::user_sends_export_api),
        )
        .route(
            "/api/users/{id}/journal",
            get(routes::member_pages::user_journal_api),
        )
        .route(
            "/api/pages/users/{id}/projects",
            get(routes::projects::board),
        )
        .route("/api/pages/projects/{token}", get(routes::projects::shared))
        .route("/projects/{token}", get(routes::seo::shared_project_page))
        .route("/users/{id}/projects", get(routes::seo::owner_project_page))
        .route(
            "/users/{id}/projects/sent",
            get(routes::seo::owner_project_page),
        )
        .route(
            "/api/pages/users/{id}/lists",
            get(routes::climb_lists::index),
        )
        .route(
            "/api/pages/users/{id}/lists/{list_id}",
            get(routes::climb_lists::detail),
        )
        .route("/api/pages/lists/{token}", get(routes::climb_lists::shared))
        .route("/users/{id}/lists", get(routes::seo::member_list_html))
        .route(
            "/users/{id}/lists/{list_id}",
            get(routes::seo::member_list_html),
        )
        .route("/lists/{token}", get(routes::seo::shared_list_html))
        .route("/users/{id}/trips", get(routes::trips::member_html))
        .route("/users/{id}/trips/{trip}", get(routes::trips::member_html))
        .route(
            "/users/{id}/trips/{trip}/analytics",
            get(routes::trips::member_html),
        )
        .route("/trips/{token}", get(routes::trips::shared_html))
        .route("/trips/{token}/analytics", get(routes::trips::shared_html))
        .route("/api/pages/users/{id}/trips", get(routes::trips::list))
        .route(
            "/api/pages/users/{id}/trips/{trip}",
            get(routes::trips::detail),
        )
        .route(
            "/api/pages/users/{id}/trips/{trip}/analytics",
            get(routes::trips::detail),
        )
        .route(
            "/api/pages/users/{id}/trips/{trip}/photos",
            get(routes::trips::photos),
        )
        .route(
            "/api/pages/trips/{token}/photos",
            get(routes::trips::shared_photos),
        )
        .route("/api/pages/trips/{token}", get(routes::trips::shared))
        .route(
            "/api/pages/trips/{token}/analytics",
            get(routes::trips::shared),
        )
        // Page loaders for member SPA views
        .route(
            "/api/pages/feed",
            get(routes::member_pages::feed_page_loader),
        )
        .route(
            "/api/pages/friends",
            get(routes::member_pages::friends_page_loader),
        )
        .route(
            "/api/pages/account",
            get(routes::member_pages::account_page_loader),
        )
        .route(
            "/api/pages/users/{id}",
            get(routes::member_pages::user_profile_page_loader),
        )
        .route(
            "/api/pages/users/{id}/sends",
            get(routes::member_pages::user_sends_page_loader),
        )
        .route(
            "/api/pages/users/{id}/journal",
            get(routes::member_pages::user_journal_page_loader),
        )
        .route(
            "/api/pages/areas/{id}",
            get(routes::member_pages::area_page_loader),
        )
        .route(
            "/api/pages/climbs/new",
            get(routes::member_pages::new_climb_page_loader),
        )
        .route(
            "/api/pages/climbs/{id}",
            get(routes::member_pages::climb_page_loader),
        )
        .route("/api/client-errors", post(routes::actions::client_errors))
        .route(
            "/api/actions/{name}",
            post(routes::actions::dispatch_action),
        )
        .route("/areas/new", get(routes::seo::spa_fallback))
        .route("/climbs/new", get(routes::seo::spa_fallback))
        .route("/areas/{id}", get(routes::seo::area_page))
        .route("/areas/{id}/{*slug}", get(routes::seo::area_page_with_slug))
        .route("/climbs/{id}", get(routes::seo::climb_page))
        .route(
            "/climbs/{id}/{*slug}",
            get(routes::seo::climb_page_with_slug),
        )
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
    let state = AppState::from_request(&req, env, ctx)?;
    let response = router(state).call(req).await?;
    Ok(apply_security_headers(&path, response))
}

#[event(scheduled)]
async fn scheduled(_event: ScheduledEvent, env: Env, _ctx: ScheduleContext) {
    if let Err(err) = routes::catalog_export::run_scheduled_catalog_export(&env).await {
        worker::console_error!("Scheduled catalog export failed: {err}");
    }
}
