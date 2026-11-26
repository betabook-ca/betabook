//! Public upstream imports. Every request opens a fixed origin with its own deadline.
use std::time::Duration;

use axum::{
    Extension,
    body::Body,
    extract::{OriginalUri, State},
    http::{HeaderMap, StatusCode, header},
    response::Response,
};
use futures_channel::mpsc::{UnboundedSender, unbounded};
use futures_util::{
    FutureExt, StreamExt,
    future::{Either, select},
    stream,
};
use percent_encoding::percent_decode_str;
use serde_json::{Value, json};
use url::Url;
use worker::{
    AbortSignal, Delay, Fetch, Headers, Method, Request, RequestInit, RequestRedirect, js_sys,
    web_sys,
};

use super::member_pages::{first_param, no_store_json, parse_query_map};
use crate::{
    auth::session::require_member_session,
    state::{ApiError, AppState},
};

const MAX_FILE: usize = 10 * 1024 * 1024;
const KAYA_CSV: &str = "Export your logbook from KAYA as a CSV and upload that file instead, or email support@betabook.ca.";
const MP_FORMAT: &str = "Mountain Project returned an unexpected response. Download your ticks as a CSV from Mountain Project and upload that file instead, or email support@betabook.ca.";
const MP_SIZE: &str = "This Mountain Project tick list is too large for a direct import. Email support@betabook.ca for help importing it.";
const MP_ORIGIN: &str = "https://www.mountainproject.com";
const PAGE_SIZE: usize = 100;

// GraphQL can return nullable or omitted selected fields. Validate object/field
// types before forwarding a page; the wizard separately checks whether a row
// has enough information for a CSV import.
#[derive(serde::Deserialize)]
#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[allow(
    dead_code,
    reason = "Validate selected upstream fields before forwarding the original JSON"
)]
struct KayaLabel {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    name: Option<String>,
}

#[derive(serde::Deserialize)]
#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[allow(
    dead_code,
    reason = "Validate selected upstream fields before forwarding the original JSON"
)]
struct KayaDiscipline {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    name: Option<String>,
}

#[derive(serde::Deserialize)]
#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[allow(
    dead_code,
    reason = "Validate selected upstream fields before forwarding the original JSON"
)]
struct KayaClimb {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    climb_type: Option<KayaDiscipline>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    grade: Option<KayaLabel>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    gym: Option<KayaLabel>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    board: Option<KayaLabel>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    destination: Option<KayaLabel>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    area: Option<KayaLabel>,
}

#[derive(serde::Deserialize)]
#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[allow(
    dead_code,
    reason = "Validate selected upstream fields before forwarding the original JSON"
)]
pub(crate) struct KayaAscent {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    date: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    comment: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    rating: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    stiffness: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    grade: Option<KayaLabel>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    climb: Option<KayaClimb>,
}

fn profile_url(raw: &str, host: &str) -> Result<Option<Url>, ()> {
    let lower = raw.to_ascii_lowercase();
    let url = if lower.starts_with("https://") || lower.starts_with("http://") {
        Url::parse(raw)
    } else if lower.starts_with(&format!("{host}/")) || lower.starts_with(&format!("www.{host}/")) {
        Url::parse(&format!("https://{raw}"))
    } else {
        return Ok(None);
    };
    let url = url.map_err(|_| ())?;
    if url.port().is_some() || !url.username().is_empty() || url.password().is_some() {
        return Err(());
    }
    Ok(Some(url))
}

fn kaya_username(input: &str) -> Option<String> {
    let raw = input.trim();
    let name = if let Some(url) = profile_url(raw, "kaya-app.kayaclimb.com").ok()? {
        if url.host_str() != Some("kaya-app.kayaclimb.com") {
            return None;
        }
        let path = url.path().strip_prefix("/user/")?;
        let path = path.strip_suffix('/').unwrap_or(path);
        percent_decode_str(path).decode_utf8().ok()?.into_owned()
    } else {
        raw.to_owned()
    };
    let name = name.strip_prefix('@').unwrap_or(&name);
    ((1..=255).contains(&name.len())
        && name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c)))
    .then(|| name.to_owned())
}

fn mp_id(input: &str) -> Result<String, &'static str> {
    const LINK: &str =
        "Use your Mountain Project profile link: mountainproject.com/user/123456789/your-name.";
    const ID: &str = "Enter your Mountain Project user ID or profile link.";
    let raw = input.trim();
    let (id, error) =
        if let Some(url) = profile_url(raw, "mountainproject.com").map_err(|_| LINK)? {
            if !matches!(
                url.host_str(),
                Some("www.mountainproject.com" | "mountainproject.com")
            ) {
                return Err(LINK);
            }
            let id = url
                .path()
                .strip_prefix("/user/")
                .and_then(|p| p.split('/').next())
                .ok_or(LINK)?;
            (
                percent_decode_str(id)
                    .decode_utf8()
                    .map_err(|_| LINK)?
                    .into_owned(),
                LINK,
            )
        } else {
            (raw.strip_prefix('#').unwrap_or(raw).to_owned(), ID)
        };
    if (1..=12).contains(&id.len())
        && !id.starts_with('0')
        && id.bytes().all(|c| c.is_ascii_digit())
    {
        Ok(id)
    } else {
        Err(error)
    }
}

fn deadline(parent: &AbortSignal, ms: u32) -> AbortSignal {
    let signals = js_sys::Array::new();
    signals.push(parent.as_ref());
    signals.push(&web_sys::AbortSignal::timeout_with_u32(ms));
    web_sys::AbortSignal::any(&signals).into()
}

enum ReadError {
    Large,
    Unavailable,
}

async fn read_limited(mut response: worker::Response, max: usize) -> Result<Vec<u8>, ReadError> {
    if response
        .headers()
        .get("content-length")
        .ok()
        .flatten()
        .and_then(|v| v.parse::<usize>().ok())
        .is_some_and(|n| n > max)
    {
        return Err(ReadError::Large);
    }
    let mut stream = response.stream().map_err(|_| ReadError::Unavailable)?;
    let mut bytes = Vec::new();
    while let Some(part) = stream.next().await {
        let part = part.map_err(|_| ReadError::Unavailable)?;
        if part.len() > max - bytes.len() {
            return Err(ReadError::Large);
        }
        bytes.extend(part);
    }
    Ok(bytes)
}

fn source_error(status: StatusCode, message: &str) -> Response {
    no_store_json(status, json!({"error":message}))
}

async fn mp_request(
    path: &str,
    signal: &AbortSignal,
) -> Result<worker::Response, (StatusCode, &'static str)> {
    let mut init = RequestInit::new();
    init.with_redirect(RequestRedirect::Manual);
    let failed = || {
        if signal.aborted() {
            (
                StatusCode::GATEWAY_TIMEOUT,
                "Mountain Project took too long to respond. Please try again.",
            )
        } else {
            (
                StatusCode::BAD_GATEWAY,
                "Couldn't connect to Mountain Project. Please try again, or email support@betabook.ca.",
            )
        }
    };
    let req = Request::new_with_init(&format!("{MP_ORIGIN}{path}"), &init).map_err(|_| failed())?;
    let response = Fetch::Request(req)
        .send_with_signal(signal)
        .await
        .map_err(|_| failed())?;
    let (status, msg) = match response.status_code() {
        404 => (
            StatusCode::NOT_FOUND,
            "That Mountain Project profile could not be found. Check the user ID or profile link.",
        ),
        429 => (
            StatusCode::TOO_MANY_REQUESTS,
            "Mountain Project is receiving too many requests. Wait a moment and try again.",
        ),
        403 => (
            StatusCode::FORBIDDEN,
            "Mountain Project would not share this tick list. Download it as a CSV and upload that file instead, or email support@betabook.ca.",
        ),
        500..=599 => (
            StatusCode::BAD_GATEWAY,
            "Mountain Project is temporarily unavailable. Please try again later.",
        ),
        _ => return Ok(response),
    };
    Err((status, msg))
}

fn mp_slug(response: &worker::Response, id: &str) -> Option<String> {
    if !matches!(response.status_code(), 301 | 302 | 303 | 307 | 308) {
        return None;
    }
    let loc = response.headers().get("Location").ok()??;
    let path = loc.strip_prefix(MP_ORIGIN).unwrap_or(&loc);
    let slug = path
        .split(['?', '#'])
        .next()?
        .strip_prefix(&format!("/user/{id}/"))?
        .trim_end_matches('/');
    ((1..=120).contains(&slug.len())
        && slug
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._~-".contains(&c)))
    .then(|| slug.to_owned())
}

#[worker::send]
pub async fn mountain_project(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    Extension(parent): Extension<AbortSignal>,
) -> Result<Response, ApiError> {
    require_member_session(&state, &headers).await?;
    let params = parse_query_map(uri.query().unwrap_or(""));
    let id = match mp_id(first_param(&params, "userId").unwrap_or("")) {
        Ok(id) => id,
        Err(msg) => return Ok(source_error(StatusCode::BAD_REQUEST, msg)),
    };
    let profile = match mp_request(&format!("/user/{id}"), &deadline(&parent, 15_000)).await {
        Ok(r) => r,
        Err((status, msg)) => return Ok(source_error(status, msg)),
    };
    let user = mp_slug(&profile, &id);
    let signal = deadline(&parent, 45_000);
    let export = match mp_request(
        &format!(
            "/user/{id}/{}/tick-export",
            user.as_deref().unwrap_or("ticks")
        ),
        &signal,
    )
    .await
    {
        Ok(r) => r,
        Err((status, msg)) => return Ok(source_error(status, msg)),
    };
    if !(200..300).contains(&export.status_code())
        || !export
            .headers()
            .get("content-type")?
            .unwrap_or_default()
            .to_ascii_lowercase()
            .starts_with("text/csv")
    {
        return Ok(source_error(StatusCode::BAD_GATEWAY, MP_FORMAT));
    }
    let csv = match read_limited(export, MAX_FILE).await {
        Ok(bytes) if !signal.aborted() && !String::from_utf8_lossy(&bytes).trim().is_empty() => {
            bytes
        }
        Err(ReadError::Large) => return Ok(source_error(StatusCode::PAYLOAD_TOO_LARGE, MP_SIZE)),
        _ if signal.aborted() => {
            return Ok(source_error(
                StatusCode::GATEWAY_TIMEOUT,
                "Mountain Project took too long to respond. Please try again.",
            ));
        }
        _ => return Ok(source_error(StatusCode::BAD_GATEWAY, MP_FORMAT)),
    };
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/csv; charset=utf-8")
        .header("x-mountain-project-user", user.unwrap_or_default())
        .header(header::CACHE_CONTROL, "private, no-store")
        .body(Body::from(csv))
        .map_err(ApiError::internal)
}

enum KayaError {
    Message(String),
    Retry { limited: bool, delay_ms: f64 },
}
impl KayaError {
    fn format() -> Self {
        Self::Message(format!("KAYA returned an unexpected format. {KAYA_CSV}"))
    }
    fn temporary() -> Self {
        Self::Retry {
            limited: false,
            delay_ms: 0.0,
        }
    }
    fn message(self) -> String {
        match self {
            Self::Message(s) => s,
            Self::Retry { limited: true, .. } => {
                "KAYA is receiving too many requests. Please try again later.".into()
            }
            Self::Retry { .. } => "KAYA is temporarily unavailable. Please try again later.".into(),
        }
    }
}
fn kaya_size() -> KayaError {
    KayaError::Message(format!(
        "This KAYA history is too large for a direct import. {KAYA_CSV}"
    ))
}

async fn kaya_request(
    query: &str,
    variables: &Value,
    parent: &AbortSignal,
) -> Result<Value, KayaError> {
    let mut init = RequestInit::new();
    let headers = Headers::new();
    for (k, v) in [
        ("Content-Type", "application/json"),
        ("Origin", "https://kaya-app.kayaclimb.com"),
        ("Referer", "https://kaya-app.kayaclimb.com/"),
    ] {
        headers.set(k, v).map_err(|_| KayaError::format())?;
    }
    init.with_method(Method::Post)
        .with_redirect(RequestRedirect::Manual)
        .with_headers(headers)
        .with_body(Some(
            json!({"query":query,"variables":variables})
                .to_string()
                .into(),
        ));
    let req = Request::new_with_init("https://kaya-beta.kayaclimb.com/graphql", &init)
        .map_err(|_| KayaError::format())?;
    let resp = Fetch::Request(req)
        .send_with_signal(&deadline(parent, 15_000))
        .await
        .map_err(|_| KayaError::temporary())?;
    let retry_after = resp
        .headers()
        .get("retry-after")
        .ok()
        .flatten()
        .map_or(0.0, |v| {
            let raw = v.trim();
            if !raw.is_empty() && raw.bytes().all(|b| b.is_ascii_digit()) {
                return raw.parse::<f64>().unwrap_or(f64::INFINITY) * 1000.0;
            }
            (js_sys::Date::parse(raw) - js_sys::Date::now()).max(0.0)
        });
    let status = resp.status_code();
    if matches!(status, 408 | 429 | 500 | 502 | 503 | 504) {
        return Err(KayaError::Retry {
            limited: status == 429,
            delay_ms: retry_after,
        });
    }
    if !(200..300).contains(&status) {
        return Err(KayaError::Message(format!(
            "KAYA could not share this public profile. {KAYA_CSV}"
        )));
    }
    let bytes = read_limited(resp, 1024 * 1024).await.map_err(|e| match e {
        ReadError::Large => KayaError::format(),
        ReadError::Unavailable => KayaError::temporary(),
    })?;
    let data: Value = serde_json::from_slice(&bytes).map_err(|_| KayaError::format())?;
    if !data["errors"].is_null() {
        let errors = data["errors"].as_array().ok_or_else(KayaError::format)?;
        if !errors.is_empty() {
            let mut limited = false;
            for err in errors {
                match err["extensions"]["code"].as_str() {
                    Some("RATE_LIMITED" | "TOO_MANY_REQUESTS") => limited = true,
                    Some("INTERNAL_SERVER_ERROR") => {}
                    _ => return Err(KayaError::format()),
                }
            }
            return Err(KayaError::Retry {
                limited,
                delay_ms: retry_after,
            });
        }
    }
    let mut data = data;
    if !data["data"].is_object() {
        return Err(KayaError::format());
    }
    Ok(data["data"].take())
}

fn emit(tx: &UnboundedSender<Value>, v: Value) -> Result<(), KayaError> {
    tx.unbounded_send(v)
        .map_err(|_| KayaError::Message("Download cancelled".into()))
}
async fn kaya_query(
    query: &str,
    variables: Value,
    parent: &AbortSignal,
    tx: &UnboundedSender<Value>,
) -> Result<Value, KayaError> {
    for attempt in 0..=3 {
        match kaya_request(query, &variables, parent).await {
            Err(KayaError::Retry { limited, delay_ms }) if attempt < 3 && !parent.aborted() => {
                let delay = delay_ms.max(
                    f64::from(5000 * (1 << attempt)) + (js_sys::Math::random() * 1000.).floor(),
                );
                if delay > 120_000. {
                    return Err(KayaError::Message(
                        "KAYA asked us to wait longer before retrying. Please try again later."
                            .into(),
                    ));
                }
                emit(
                    tx,
                    json!({"type":"retry","attempt":attempt+1,"delayMs":delay as u64,"reason":if limited{"rate-limit"}else{"unavailable"}}),
                )?;
                Delay::from(Duration::from_millis(delay as u64)).await;
            }
            result => return result,
        }
    }
    Err(KayaError::temporary())
}

async fn download(
    username: String,
    discipline: String,
    parent: AbortSignal,
    tx: &UnboundedSender<Value>,
) -> Result<u64, KayaError> {
    let profile = kaya_query(
        include_str!("kaya_profile.graphql"),
        json!({"username":username}),
        &parent,
        tx,
    )
    .await?;
    let p = &profile["webUser"];
    if p.is_null() {
        return Err(KayaError::Message(
            "That KAYA profile could not be found. Check the username or profile link.".into(),
        ));
    }
    if !p.is_object() {
        return Err(KayaError::format());
    }
    if p["is_private"] != false {
        return Err(KayaError::Message("KAYA imports need a public profile. Make your profile public, upload KAYA’s CSV export instead, or email support@betabook.ca.".into()));
    }
    let id = p["id"]
        .as_str()
        .filter(|id| !id.is_empty() && id.bytes().all(|b| b.is_ascii_digit()))
        .ok_or_else(KayaError::format)?;
    let name = p["username"]
        .as_str()
        .filter(|v| v.eq_ignore_ascii_case(&username))
        .ok_or_else(KayaError::format)?;
    emit(tx, json!({"type":"profile","username":name}))?;
    let mut offset = 0;
    let mut total = 0u64;
    let mut size = 0;
    loop {
        let mut page = kaya_query(
            include_str!("kaya_ascents.graphql"),
            json!({"userId":id,"climbTypeId":discipline,"offset":offset,"includeTotal":offset==0}),
            &parent,
            tx,
        )
        .await?;
        if offset == 0 {
            let distribution = page["webFilterDistributionForAscents"]["data"]
                .as_array()
                .ok_or_else(KayaError::format)?;
            for row in distribution {
                total = total
                    .checked_add(row["ascent_count"].as_u64().ok_or_else(KayaError::format)?)
                    .ok_or_else(kaya_size)?;
                if total > 50_000 {
                    return Err(kaya_size());
                }
            }
        }
        let batch = page["webAscentsForUser"].take();
        let page_items = batch
            .as_array()
            .filter(|a| a.len() <= PAGE_SIZE)
            .ok_or_else(KayaError::format)?;
        for item in page_items {
            <KayaAscent as serde::Deserialize>::deserialize(item)
                .map_err(|_| KayaError::format())?;
        }
        let len = page_items.len();
        size += batch.to_string().len();
        if size > MAX_FILE {
            return Err(kaya_size());
        }
        offset += len;
        if offset as u64 > total || (len < PAGE_SIZE && offset as u64 != total) {
            return Err(KayaError::Message(format!(
                "Couldn't load your complete KAYA history, or it changed during download. Please try again. {KAYA_CSV}"
            )));
        }
        emit(tx, json!({"type":"page","items":batch,"total":total}))?;
        if len < PAGE_SIZE {
            return Ok(total);
        }
        Delay::from(Duration::from_secs(2)).await;
    }
}

#[worker::send]
pub async fn kaya(
    State(state): State<AppState>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    Extension(parent): Extension<AbortSignal>,
) -> Result<Response, ApiError> {
    require_member_session(&state, &headers).await?;
    let params = parse_query_map(uri.query().unwrap_or(""));
    let input = kaya_username(first_param(&params, "username").unwrap_or(""))
        .zip(first_param(&params, "climbTypeId").filter(|v| matches!(*v, "1" | "2")));
    let Some((name, discipline)) = input else {
        let mut resp = source_error(
            StatusCode::BAD_REQUEST,
            "Enter a valid KAYA profile and outdoor discipline.",
        );
        super::imports::no_transform(&mut resp);
        return Ok(resp);
    };
    let (tx, rx) = unbounded();
    let discipline = discipline.to_owned();
    let run = async move {
        let job = download(name, discipline, parent, &tx).boxed_local();
        let timeout = Delay::from(Duration::from_secs(600)).boxed_local();
        let final_event = match select(job, timeout).await {
            Either::Left((Ok(total), _)) => json!({"type":"complete","total":total}),
            Either::Left((Err(e), _)) => json!({"type":"error","error":e.message()}),
            Either::Right(_) => {
                json!({"type":"error","error":format!("This KAYA import is taking too long. Try again later. {KAYA_CSV}")})
            }
        };
        let _ = tx.unbounded_send(final_event);
    };
    // Poll the producer from the response body. Cancelling the reader drops both
    // its outstanding work and its retry/heartbeat timers.
    let data = stream::select(
        rx,
        stream::once(run).filter_map(|()| std::future::ready(None)),
    )
    .boxed_local();
    let events = stream::once(std::future::ready(json!({"type":"heartbeat"}))).chain(
        stream::unfold(data, |mut data| async move {
            let event = match select(
                data.next(),
                Delay::from(Duration::from_secs(15)).boxed_local(),
            )
            .await
            {
                Either::Left((event, _)) => event?,
                Either::Right(_) => json!({"type":"heartbeat"}),
            };
            Some((event, data))
        }),
    );
    let body = worker::Body::from_stream(
        events.map(|v| Ok::<_, std::convert::Infallible>(format!("{v}\n").into_bytes())),
    )?;
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/x-ndjson")
        .header(header::CACHE_CONTROL, "private, no-store, no-transform")
        .body(Body::new(body))
        .map_err(ApiError::internal)
}
