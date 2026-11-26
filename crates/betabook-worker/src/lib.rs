use axum::{Json, Router, routing::get};
use serde::Serialize;
use tower_service::Service;
use worker::{Context, Env, HttpRequest, Result, ScheduleContext, ScheduledEvent, event};

#[derive(Serialize)]
struct HealthResponse {
    ok: bool,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { ok: true })
}

fn router() -> Router {
    Router::new().route("/api/health", get(health))
}

#[event(fetch)]
async fn fetch(
    req: HttpRequest,
    _env: Env,
    _ctx: Context,
) -> Result<http::Response<axum::body::Body>> {
    Ok(router().call(req).await?)
}

#[event(scheduled)]
async fn scheduled(_event: ScheduledEvent, _env: Env, _ctx: ScheduleContext) {}
