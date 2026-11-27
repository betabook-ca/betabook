use std::cell::RefCell;
use std::collections::HashMap;
use std::pin::Pin;
use std::task::{Context, Poll};

use axum::{
    Json,
    body::Body,
    extract::State,
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use betabook_db::catalog_export::{
    CATALOG_EXPORT_KEY, CATALOG_EXPORT_PART_SIZE, CATALOG_EXPORT_SCHEMA_VERSION,
    CatalogExportSummary, DEFAULT_CATALOG_PAGE_SIZE, get_catalog_counts,
    stream_catalog_export_parts,
};
use betabook_db::d1::D1Db;
use bytes::Bytes;
use futures_util::Stream;
use serde_json::json;
use worker::{ByteStream, Date, Env, HttpMetadata};

use crate::auth::session::require_member_session;
use crate::state::{ApiError, AppState, now_iso_from_ms};

struct SendByteStream(Pin<Box<ByteStream>>);

// SAFETY: Workers execute in a single-threaded V8 isolate, so moving ByteStream within
// the isolate's Axum body trait bounds is sound.
unsafe impl Send for SendByteStream {}

impl Stream for SendByteStream {
    type Item = Result<Bytes, std::io::Error>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.0.as_mut().poll_next(cx).map(|opt| {
            opt.map(|res| {
                res.map(Bytes::from)
                    .map_err(|e| std::io::Error::other(e.to_string()))
            })
        })
    }
}

fn catalog_export_filename(generated_at: Option<&str>) -> String {
    match generated_at {
        Some(ts)
            if ts.is_char_boundary(10)
                && ts.len() >= 10
                && ts.as_bytes()[4] == b'-'
                && ts.as_bytes()[7] == b'-' =>
        {
            format!("betabook-catalog-{}.json", &ts[..10])
        }
        _ => "betabook-catalog.json".to_string(),
    }
}

#[worker::send]
pub async fn download_catalog_export(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let _session = require_member_session(&state, &headers).await?;
    let bucket = state.env().bucket("CATALOG_EXPORTS")?;
    let Some(object) = bucket.get(CATALOG_EXPORT_KEY).execute().await? else {
        return Ok((
            StatusCode::NOT_FOUND,
            [(header::CACHE_CONTROL, "private, no-store")],
            Json(json!({ "error": "No catalog export yet" })),
        )
            .into_response());
    };
    let meta = object.custom_metadata()?;
    let filename = catalog_export_filename(meta.get("generatedAt").map(String::as_str));
    let size = object.size();
    let etag = object.http_etag();
    let Some(body) = object.body() else {
        return Err(ApiError::internal("Missing catalog export body"));
    };
    let stream = SendByteStream(Box::pin(body.stream()?));

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{filename}\""),
        )
        .header(header::CONTENT_LENGTH, size.to_string())
        .header(header::ETAG, etag)
        .header(header::CACHE_CONTROL, "private, no-store")
        .body(Body::from_stream(stream))
        .map_err(ApiError::internal)
}

pub async fn run_scheduled_catalog_export(env: &Env) -> Result<CatalogExportSummary, String> {
    let d1 = env.d1("DB").map_err(|e| e.to_string())?;
    let db = D1Db::new(d1);
    let bucket = env.bucket("CATALOG_EXPORTS").map_err(|e| e.to_string())?;
    let generated_at = now_iso_from_ms(Date::now().as_millis() as i64);
    let counts = get_catalog_counts(&db).await.map_err(|e| e.to_string())?;

    let mut custom_metadata = HashMap::new();
    custom_metadata.insert("generatedAt".to_string(), generated_at.clone());
    custom_metadata.insert("areaCount".to_string(), counts.area_count.to_string());
    custom_metadata.insert("climbCount".to_string(), counts.climb_count.to_string());
    custom_metadata.insert(
        "schemaVersion".to_string(),
        CATALOG_EXPORT_SCHEMA_VERSION.to_string(),
    );

    let upload = bucket
        .create_multipart_upload(CATALOG_EXPORT_KEY)
        .http_metadata(HttpMetadata {
            content_type: Some("application/json; charset=utf-8".to_string()),
            content_language: None,
            content_disposition: None,
            content_encoding: None,
            cache_control: None,
            cache_expiry: None,
        })
        .custom_metadata(custom_metadata)
        .execute()
        .await
        .map_err(|e| e.to_string())?;

    let uploaded_parts = RefCell::new(Vec::new());
    let result = stream_catalog_export_parts(
        &db,
        counts,
        &generated_at,
        DEFAULT_CATALOG_PAGE_SIZE,
        CATALOG_EXPORT_PART_SIZE,
        |part_number, bytes| {
            let upload_ref = &upload;
            let parts_ref = &uploaded_parts;
            async move {
                let part = upload_ref
                    .upload_part(part_number as u16, bytes)
                    .await
                    .map_err(|e| betabook_db::DbError::Query(e.to_string()))?;
                parts_ref.borrow_mut().push(part);
                Ok(())
            }
        },
    )
    .await;

    match result {
        Ok(summary) => {
            // complete consumes the handle even on failure. Resume the same upload
            // by ID so finalization errors get the same cleanup as part-write errors.
            let upload_id = upload.upload_id().await;
            if let Err(err) = upload.complete(uploaded_parts.into_inner()).await {
                if let Ok(pending) = bucket.resume_multipart_upload(CATALOG_EXPORT_KEY, upload_id) {
                    let _ = pending.abort().await;
                }
                return Err(err.to_string());
            }
            worker::console_warn!(
                "Catalog export written: {} areas, {} climbs, {} bytes",
                summary.area_count,
                summary.climb_count,
                summary.size
            );
            Ok(summary)
        }
        Err(err) => {
            let _ = upload.abort().await;
            Err(err.to_string())
        }
    }
}
