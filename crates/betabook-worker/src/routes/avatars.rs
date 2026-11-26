use axum::{
    body::Body,
    extract::{OriginalUri, Path, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::Response,
};
use betabook_domain::profile_photo::{
    PROFILE_PHOTO_CACHE_CONTROL, PROFILE_PHOTO_CACHE_NAME, PROFILE_PHOTO_CONTENT_TYPE,
    is_profile_photo_key, profile_photo_etag, profile_photo_unchanged,
};
use worker::{Cache, Headers as WorkerHeaders, Response as WorkerResponse};

use crate::state::{ApiError, AppState};

fn not_found() -> Response {
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header(header::CACHE_CONTROL, "private, no-store")
        .body(Body::from("Not found"))
        .unwrap()
}

fn not_modified(etag: &str) -> Response {
    Response::builder()
        .status(StatusCode::NOT_MODIFIED)
        .header(header::CACHE_CONTROL, PROFILE_PHOTO_CACHE_CONTROL)
        .header(header::ETAG, etag)
        .body(Body::empty())
        .unwrap()
}

#[worker::send]
pub async fn get_avatar(
    State(state): State<AppState>,
    Path(key): Path<String>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    if !is_profile_photo_key(&key) {
        return Ok(not_found());
    }
    let etag = profile_photo_etag(&key);
    let unchanged = profile_photo_unchanged(
        headers
            .get(header::IF_NONE_MATCH)
            .and_then(|v| v.to_str().ok()),
        &key,
    );

    let cache_url = format!(
        "{}{}",
        state.request_origin.trim_end_matches('/'),
        uri.path()
    );
    let cache = Cache::open(PROFILE_PHOTO_CACHE_NAME.to_string()).await;
    if let Ok(Some(mut cached)) = cache.get(&cache_url, true).await {
        if unchanged {
            return Ok(not_modified(&etag));
        }
        let bytes = cached.bytes().await?;
        return Ok(Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, PROFILE_PHOTO_CONTENT_TYPE)
            .header(header::CACHE_CONTROL, PROFILE_PHOTO_CACHE_CONTROL)
            .header(header::CONTENT_LENGTH, bytes.len().to_string())
            .header(header::ETAG, etag)
            .body(Body::from(bytes))
            .unwrap());
    }

    let Ok(bucket) = state.env().bucket("PROFILE_PHOTOS") else {
        return Ok(not_found());
    };
    let Some(object) = bucket.get(&key).execute().await? else {
        return Ok(not_found());
    };
    let Some(body) = object.body() else {
        return Ok(not_found());
    };
    let bytes = body.bytes().await?;
    let len = bytes.len();

    let cache_headers = WorkerHeaders::new();
    let _ = cache_headers.set("Content-Type", PROFILE_PHOTO_CONTENT_TYPE);
    let _ = cache_headers.set("Cache-Control", PROFILE_PHOTO_CACHE_CONTROL);
    let _ = cache_headers.set("Content-Length", &len.to_string());
    let _ = cache_headers.set("ETag", &etag);
    if let Ok(mut cache_resp) = WorkerResponse::from_bytes(bytes.clone()) {
        cache_resp = cache_resp.with_headers(cache_headers);
        let cache_url_owned = cache_url.clone();
        state.ctx().wait_until(async move {
            let _ = cache.put(&cache_url_owned, cache_resp).await;
        });
    }

    if unchanged {
        return Ok(not_modified(&etag));
    }

    let mut resp = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, PROFILE_PHOTO_CONTENT_TYPE)
        .header(header::CACHE_CONTROL, PROFILE_PHOTO_CACHE_CONTROL)
        .header(header::CONTENT_LENGTH, len.to_string())
        .body(Body::from(bytes))
        .unwrap();
    if let Ok(val) = HeaderValue::from_str(&etag) {
        resp.headers_mut().insert(header::ETAG, val);
    }
    Ok(resp)
}
