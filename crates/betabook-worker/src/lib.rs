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
