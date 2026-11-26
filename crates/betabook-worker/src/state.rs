use std::fmt;
use std::sync::{Arc, Mutex};

use axum::{
    Json,
    http::{HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use betabook_db::d1::D1Db;
use serde::Serialize;
use serde_json::{Value, json};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use worker::{
    Context, Date, Env, Fetch, Headers as WorkerHeaders, HttpRequest, Method, Request, RequestInit,
    send::SendWrapper,
};

#[derive(Clone)]
pub struct AppState {
    env: Arc<SendWrapper<Env>>,
    ctx: Arc<SendWrapper<Context>>,
    db: Arc<D1Db>,
    renewed_cookie: Arc<Mutex<Option<String>>>,
    pub request_origin: String,
    pub cf_timezone: Option<String>,
}

impl AppState {
    pub fn from_request(req: &HttpRequest, env: Env, ctx: Context) -> worker::Result<Self> {
        let d1 = env.d1("DB")?;
        let cf_timezone = req
            .extensions()
            .get::<worker::Cf>()
            .and_then(|cf| cf.timezone_name());
        let host = req
            .headers()
            .get(http::header::HOST)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("localhost:8787");
        let scheme = req
            .uri()
            .scheme_str()
            .or_else(|| {
                req.headers()
                    .get("x-forwarded-proto")
                    .and_then(|v| v.to_str().ok())
            })
            .unwrap_or_else(|| {
                if host.starts_with("localhost") || host.starts_with("127.0.0.1") {
                    "http"
                } else {
                    "https"
                }
            });
        let request_origin = format!("{scheme}://{host}");

        Ok(Self {
            env: Arc::new(SendWrapper::new(env)),
            ctx: Arc::new(SendWrapper::new(ctx)),
            db: Arc::new(D1Db::new(d1)),
            renewed_cookie: Arc::default(),
            request_origin,
            cf_timezone,
        })
    }

    pub fn env(&self) -> &Env {
        &self.env
    }

    pub fn ctx(&self) -> &Context {
        &self.ctx
    }

    pub fn db(&self) -> &D1Db {
        &self.db
    }

    pub fn env_var(&self, name: &str) -> Option<String> {
        self.env
            .secret(name)
            .ok()
            .map(|s| s.to_string())
            .or_else(|| self.env.var(name).ok().map(|v| v.to_string()))
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
    }

    pub fn auth_url(&self) -> String {
        self.env_var("BETTER_AUTH_URL")
            .unwrap_or_else(|| self.request_origin.clone())
    }

    pub fn auth_secret(&self) -> Result<String, ApiError> {
        self.env_var("BETTER_AUTH_SECRET")
            .ok_or_else(|| ApiError::internal("BETTER_AUTH_SECRET is not configured"))
    }

    pub fn is_secure_cookies(&self) -> bool {
        self.auth_url().starts_with("https://")
    }

    pub fn renew_cookie(&self, cookie: String) {
        if let Ok(mut slot) = self.renewed_cookie.lock() {
            *slot = Some(cookie);
        }
    }

    pub fn apply_renewed_cookie(&self, response: &mut Response) {
        let Some(cookie) = self
            .renewed_cookie
            .lock()
            .ok()
            .and_then(|mut slot| slot.take())
        else {
            return;
        };
        // Sign-out, deletion, and sign-in manage the session cookie explicitly.
        let name = crate::auth::cookies::session_cookie_name(self.is_secure_cookies());
        if response
            .headers()
            .get_all(http::header::SET_COOKIE)
            .iter()
            .any(|value| {
                value
                    .to_str()
                    .ok()
                    .and_then(|s| s.split_once('='))
                    .is_some_and(|(k, _)| k == name)
            })
        {
            return;
        }
        if let Ok(value) = HeaderValue::from_str(&cookie) {
            response
                .headers_mut()
                .append(http::header::SET_COOKIE, value);
        }
    }

    pub fn now_ms(&self) -> i64 {
        Date::now().as_millis() as i64
    }
}

pub fn now_iso_from_ms(ms: i64) -> String {
    let nanos = i128::from(ms) * 1_000_000;
    OffsetDateTime::from_unix_timestamp_nanos(nanos)
        .unwrap_or(OffsetDateTime::UNIX_EPOCH)
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

#[derive(Debug)]
pub struct ApiError {
    pub status: StatusCode,
    pub code: Option<&'static str>,
    pub message: String,
    pub no_store: bool,
    detail: Option<crate::observability::ErrorDetail>,
}

#[derive(Serialize)]
struct ErrorBody<'a> {
    error: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    code: Option<&'a str>,
    message: &'a str,
}

impl ApiError {
    pub fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            code: None,
            message: message.into(),
            no_store: false,
            detail: None,
        }
    }

    pub fn with_code(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code: Some(code),
            message: message.into(),
            no_store: false,
            detail: None,
        }
    }

    pub fn no_store(mut self) -> Self {
        self.no_store = true;
        self
    }

    pub fn unauthorized() -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "Not signed in").no_store()
    }

    pub fn internal(context: impl std::fmt::Display) -> Self {
        let mut error =
            Self::new(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error").no_store();
        error.detail = Some(crate::observability::ErrorDetail::new(context));
        error
    }
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.message, self.status)
    }
}

impl From<betabook_db::DbError> for ApiError {
    fn from(value: betabook_db::DbError) -> Self {
        Self::internal(value)
    }
}

impl From<worker::Error> for ApiError {
    fn from(value: worker::Error) -> Self {
        Self::internal(value)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let mut resp = (
            self.status,
            Json(ErrorBody {
                error: &self.message,
                code: self.code,
                message: &self.message,
            }),
        )
            .into_response();
        if let Some(detail) = self.detail {
            resp.extensions_mut().insert(detail);
        }
        if self.no_store {
            resp.headers_mut().insert(
                http::header::CACHE_CONTROL,
                HeaderValue::from_static("private, no-store"),
            );
        }
        resp
    }
}

pub async fn http_post_json(
    url: &str,
    bearer: Option<&str>,
    body: &Value,
) -> Result<(u16, String), ApiError> {
    let headers = WorkerHeaders::new();
    headers.set("Content-Type", "application/json")?;
    if let Some(token) = bearer {
        headers.set("Authorization", &format!("Bearer {token}"))?;
    }
    let payload = serde_json::to_string(body).map_err(ApiError::internal)?;
    let mut init = RequestInit::new();
    init.with_method(Method::Post)
        .with_headers(headers)
        .with_body(Some(worker::wasm_bindgen::JsValue::from_str(&payload)));
    let req = Request::new_with_init(url, &init)?;
    let mut resp = Fetch::Request(req).send().await?;
    let status = resp.status_code();
    let text = resp.text().await?;
    Ok((status, text))
}

pub async fn http_post_form(url: &str, form_body: &str) -> Result<(u16, String), ApiError> {
    let headers = WorkerHeaders::new();
    headers.set("Content-Type", "application/x-www-form-urlencoded")?;
    let mut init = RequestInit::new();
    init.with_method(Method::Post)
        .with_headers(headers)
        .with_body(Some(worker::wasm_bindgen::JsValue::from_str(form_body)));
    let req = Request::new_with_init(url, &init)?;
    let mut resp = Fetch::Request(req).send().await?;
    let status = resp.status_code();
    let text = resp.text().await?;
    Ok((status, text))
}

pub async fn http_get_bearer_json(url: &str, bearer: &str) -> Result<(u16, Value), ApiError> {
    let headers = WorkerHeaders::new();
    headers.set("Authorization", &format!("Bearer {bearer}"))?;
    let mut init = RequestInit::new();
    init.with_method(Method::Get).with_headers(headers);
    let req = Request::new_with_init(url, &init)?;
    let mut resp = Fetch::Request(req).send().await?;
    let status = resp.status_code();
    let text = resp.text().await?;
    let parsed = serde_json::from_str(&text).unwrap_or_else(|_| json!({}));
    Ok((status, parsed))
}
