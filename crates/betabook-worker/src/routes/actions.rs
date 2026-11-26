use std::collections::HashSet;

use axum::{
    Json,
    body::Body,
    extract::{Path, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use betabook_db::auth::{
    get_user_by_id, get_user_id_by_name_nocase, insert_friend_request, record_terms_acceptance,
};
use betabook_db::journal::{
    create_journal_entry_with_sync, delete_journal_entry_with_sync, get_ascent_entry_id,
    get_journal_entry_for_edit, remove_my_journal_tag, update_journal_entry_with_sync,
};
use betabook_db::member_catalog::{
    create_area, create_climb, get_climb_by_id, update_area_description, update_climb_description,
};
use betabook_db::public_catalog::get_public_area;
use betabook_db::sends::{
    MutationError, create_undated_send, delete_user_send, get_send_by_id, get_user_send_for_climb,
    update_send_with_journal,
};
use betabook_db::social::{
    FriendshipEndOp, VisibilityColumn, accept_friend_request, dismiss_feature_announcement,
    end_friendship_relationship, get_account_user, get_friendship_status, get_user_profile,
    reset_profile_share_link, update_user_display_name, update_user_grade_preferences,
    update_user_image, update_user_private, update_user_visibility, upsert_product_tour_status,
};
use betabook_domain::display_name::{DISPLAY_NAME_TAKEN_MESSAGE, display_name_problem};
use betabook_domain::grades::{ClimbType, native_grade_array};
use betabook_domain::profile_photo::{
    ACCEPTED_PROFILE_PHOTO_TYPES, MAX_PROFILE_PHOTO_BYTES, PROFILE_PHOTO_CACHE_CONTROL,
    PROFILE_PHOTO_CONTENT_TYPE, PROFILE_PHOTO_PIXELS, PROFILE_PHOTO_QUALITY, profile_photo_key,
    profile_photo_key_owned_by, profile_photo_path, sniff_image_type,
};
use betabook_domain::sends::{
    MAX_JOURNAL_COMPANIONS, assert_loggable_on_climb, normalize_tags, parse_boulder_scale,
    parse_rope_scale, parse_send_comment_audience, parse_sharing_audience, validate_journal_input,
    validate_send_input,
};
use betabook_domain::terms::TERMS_VERSION;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use url::Url;
use worker::HttpMetadata;
use worker::js_sys::{self, Array, Function, Object, Promise, Reflect, Uint8Array};
use worker::wasm_bindgen::{JsCast, JsValue};
use worker::wasm_bindgen_futures::JsFuture;

use crate::auth::email::send_friend_request_email;
use crate::auth::session::{require_member_session, resolve_optional_session};
use crate::state::{ApiError, AppState, http_post_json, now_iso_from_ms};

const MAX_ERROR_BODY_BYTES: usize = 4096;
const MAX_JSON_ACTION_BYTES: usize = 512 * 1024;
const MAX_MULTIPART_ACTION_BYTES: usize = 4 * 1024 * 1024;
const CONTACT_TO_EMAIL: &str = "hello@betabook.ca";
const CONTACT_FROM_EMAIL: &str = "Betabook <noreply@betabook.ca>";
const MIN_CONTACT_FILL_MS: f64 = 2000.0;
const JOURNAL_RATE_LIMIT_MESSAGE: &str =
    "You're logging entries quickly — take a breather and try again in a minute.";

fn action_ok() -> Response {
    let mut resp = (StatusCode::OK, Json(json!({ "ok": true }))).into_response();
    resp.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store"),
    );
    resp
}

fn action_value<T: Serialize>(value: T) -> Response {
    let mut resp = (StatusCode::OK, Json(json!({ "ok": true, "value": value }))).into_response();
    resp.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store"),
    );
    resp
}

fn action_err(message: impl Into<String>) -> Response {
    let mut resp = (
        StatusCode::OK,
        Json(json!({ "ok": false, "error": message.into() })),
    )
        .into_response();
    resp.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store"),
    );
    resp
}

fn map_mutation_result<T, F>(res: Result<T, MutationError>, on_ok: F) -> Result<Response, ApiError>
where
    F: FnOnce(T) -> Response,
{
    match res {
        Ok(val) => Ok(on_ok(val)),
        Err(MutationError::Validation(msg)) => Ok(action_err(msg)),
        Err(MutationError::Db(err)) => Err(err.into()),
    }
}

async fn allow_rate_limit(state: &AppState, binding: &str, key: &str) -> bool {
    let Ok(limiter) = state.env().rate_limiter(binding) else {
        return true;
    };
    match limiter.limit(key.to_string()).await {
        Ok(outcome) => outcome.success,
        Err(_) => true,
    }
}

fn today_utc(state: &AppState) -> String {
    let iso = now_iso_from_ms(state.now_ms());
    iso.get(..10).unwrap_or("2026-01-01").to_string()
}

struct FormFields {
    entries: Vec<(String, String)>,
}

impl FormFields {
    fn from_arg(value: Option<&Value>) -> Result<Self, &'static str> {
        let Some(obj) = value.and_then(Value::as_object) else {
            return Err("Invalid form data");
        };
        let Some(pairs) = obj.get("__formData").and_then(Value::as_array) else {
            return Err("Invalid form data");
        };
        let mut entries = Vec::with_capacity(pairs.len());
        for item in pairs {
            let Some(pair) = item.as_array() else {
                continue;
            };
            if let (Some(k), Some(v)) = (
                pair.first().and_then(Value::as_str),
                pair.get(1).and_then(Value::as_str),
            ) {
                entries.push((k.to_string(), v.to_string()));
            }
        }
        Ok(Self { entries })
    }

    fn get(&self, key: &str) -> Option<&str> {
        self.entries
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.as_str())
    }

    fn has(&self, key: &str) -> bool {
        self.entries.iter().any(|(k, _)| k == key)
    }

    fn get_all(&self, key: &str) -> Vec<String> {
        self.entries
            .iter()
            .filter(|(k, _)| k == key)
            .map(|(_, v)| v.clone())
            .collect()
    }

    fn require_trimmed(&self, key: &str, label: &str) -> Result<String, String> {
        let trimmed = self.get(key).map(str::trim).unwrap_or("");
        if trimmed.is_empty() {
            return Err(format!("{label} is required"));
        }
        Ok(trimmed.to_string())
    }

    fn trim_or_none(&self, key: &str) -> Option<String> {
        self.get(key)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(ToString::to_string)
    }
}

fn read_companion_selection(form: &FormFields) -> Result<Option<Vec<String>>, String> {
    let raw = form.get_all("companion");
    if !form.has("companionsChanged") && raw.is_empty() {
        return Ok(None);
    }
    if raw.len() > 100 {
        return Err("Choose at most 10 friends".to_string());
    }
    let mut ids = Vec::new();
    let mut seen = HashSet::new();
    for id in raw {
        if id.trim().is_empty() || id.len() > 128 {
            return Err("Invalid friend selection".to_string());
        }
        if seen.insert(id.clone()) {
            ids.push(id);
        }
    }
    if ids.len() > MAX_JOURNAL_COMPANIONS {
        return Err("Choose at most 10 friends".to_string());
    }
    Ok(Some(ids))
}

fn read_video_fields(form: &FormFields) -> Option<Vec<String>> {
    form.has("videosChanged").then(|| form.get_all("video"))
}

fn carries_send_fields(form: &FormFields) -> bool {
    [
        "ascentStyle",
        "rating",
        "suggestedGrade",
        "gradeFeel",
        "video",
    ]
    .iter()
    .any(|field| form.get_all(field).iter().any(|v| !v.is_empty()))
}

fn parse_pos_i64_arg(val: Option<&Value>, not_found: &str) -> Result<i64, String> {
    let Some(v) = val else {
        return Err(not_found.to_string());
    };
    if let Some(i) = v.as_i64() {
        return (i >= 1).then_some(i).ok_or_else(|| not_found.to_string());
    }
    if let Some(f) = v.as_f64()
        && f.is_finite()
        && f.fract() == 0.0
        && f >= 1.0
    {
        return Ok(f as i64);
    }
    Err(not_found.to_string())
}

fn parse_target_user_id(arg: Option<&Value>, viewer_id: &str) -> Result<String, String> {
    let Some(target) = arg.and_then(Value::as_str) else {
        return Err("Invalid climber".to_string());
    };
    if target.trim().is_empty() || target.len() > 128 {
        return Err("Invalid climber".to_string());
    }
    if target == viewer_id {
        return Err("You can't add yourself as a friend".to_string());
    }
    Ok(target.to_string())
}

#[worker::send]
pub async fn client_errors(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    let origin = headers.get(header::ORIGIN).and_then(|v| v.to_str().ok());
    if origin != Some(state.request_origin.as_str()) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let Ok(bytes) = axum::body::to_bytes(body, MAX_ERROR_BODY_BYTES).await else {
        return StatusCode::PAYLOAD_TOO_LARGE.into_response();
    };
    let Ok(report) = serde_json::from_slice::<Value>(&bytes) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    if !report.is_object() {
        return StatusCode::BAD_REQUEST.into_response();
    }
    worker::console_error!("client-error: {report}");
    StatusCode::NO_CONTENT.into_response()
}

#[derive(Deserialize)]
pub struct ActionCallBody {
    #[serde(default)]
    args: Vec<Value>,
}

#[derive(Deserialize)]
struct ContactPayload {
    name: Option<String>,
    email: Option<String>,
    message: Option<String>,
    website: Option<String>,
    elapsed: Option<f64>,
}

async fn handle_contact(state: &AppState, payload: Value) -> Result<Response, ApiError> {
    let parsed: ContactPayload = serde_json::from_value(payload).unwrap_or(ContactPayload {
        name: None,
        email: None,
        message: None,
        website: None,
        elapsed: None,
    });

    let honeypot = parsed.website.as_deref().map(str::trim).unwrap_or("");
    let elapsed = parsed.elapsed.unwrap_or(0.0);
    if !honeypot.is_empty() || !elapsed.is_finite() || elapsed < MIN_CONTACT_FILL_MS {
        return Ok(action_ok());
    }

    let name = parsed
        .name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if let Some(n) = name
        && n.chars().count() > 100
    {
        return Ok(action_err("Name must be 100 characters or fewer"));
    }

    let email = parsed.email.as_deref().map(str::trim).unwrap_or("");
    if email.is_empty() {
        return Ok(action_err("Email is required"));
    }
    if email.chars().count() > 254 {
        return Ok(action_err("Email must be 254 characters or fewer"));
    }
    let valid_email = !email
        .chars()
        .any(|c| c.is_whitespace() || "<>,".contains(c))
        && email
            .split_once('@')
            .is_some_and(|(local, domain)| !local.is_empty() && domain.contains('.'));
    if !valid_email {
        return Ok(action_err("Enter a valid email address"));
    }

    let message = parsed.message.as_deref().map(str::trim).unwrap_or("");
    if message.is_empty() {
        return Ok(action_err("Message is required"));
    }
    if message.chars().count() > 5000 {
        return Ok(action_err("Message must be 5000 characters or fewer"));
    }

    let from_label: String = name
        .unwrap_or(email)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(60)
        .collect();
    let subject = format!("Betabook contact: {from_label}");
    let text = format!(
        "From: {}\nEmail: {email}\n\n{message}",
        name.unwrap_or("(no name given)")
    );

    if let Some(api_key) = state.env_var("RESEND_API_KEY") {
        let body = json!({
            "from": CONTACT_FROM_EMAIL,
            "to": [CONTACT_TO_EMAIL],
            "reply_to": email,
            "subject": subject,
            "text": text,
        });
        let (status, resp_text) =
            http_post_json("https://api.resend.com/emails", Some(&api_key), &body).await?;
        if !(200..300).contains(&status) {
            return Err(ApiError::internal(format!(
                "Resend rejected contact email: {status} {resp_text}"
            )));
        }
    } else {
        let base_url = state.auth_url();
        let parsed_url = Url::parse(&base_url).map_err(ApiError::internal)?;
        let is_local = matches!(
            parsed_url.host_str(),
            Some("localhost" | "127.0.0.1" | "[::1]")
        );
        if !is_local {
            return Err(ApiError::internal("Email delivery is not configured"));
        }
        worker::console_log!("[dev] {subject} to {CONTACT_TO_EMAIL}, reply to {email}:\n{text}");
    }

    Ok(action_ok())
}

struct UploadedPart {
    content_type: Option<String>,
    data: Vec<u8>,
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn extract_multipart_field(
    body: &[u8],
    content_type: &str,
    field_name: &str,
) -> Option<UploadedPart> {
    let boundary = content_type.split(';').find_map(|part| {
        let trimmed = part.trim();
        trimmed
            .strip_prefix("boundary=")
            .map(|b| b.trim_matches('"').to_string())
    })?;
    let delimiter = format!("--{boundary}");
    let delim_bytes = delimiter.as_bytes();
    let mut pos = find_bytes(body, delim_bytes)?;
    pos += delim_bytes.len();

    while pos < body.len() {
        if body[pos..].starts_with(b"--") {
            break;
        }
        if body[pos..].starts_with(b"\r\n") {
            pos += 2;
        } else if body[pos..].starts_with(b"\n") {
            pos += 1;
        }

        let next_delim_rel = find_bytes(&body[pos..], delim_bytes)?;
        let part = &body[pos..pos + next_delim_rel];
        let (header_end, sep_len) = if let Some(idx) = find_bytes(part, b"\r\n\r\n") {
            (idx, 4)
        } else if let Some(idx) = find_bytes(part, b"\n\n") {
            (idx, 2)
        } else {
            pos += next_delim_rel + delim_bytes.len();
            continue;
        };

        let header_str = String::from_utf8_lossy(&part[..header_end]);
        let mut matches_name = false;
        let mut part_content_type = None;
        for line in header_str.lines() {
            let lower = line.to_ascii_lowercase();
            if lower.starts_with("content-disposition:")
                && line.contains(&format!("name=\"{field_name}\""))
            {
                matches_name = true;
            }
            if lower.starts_with("content-type:") {
                let raw_ct = line.split_once(':').map(|(_, val)| val.trim().to_string());
                part_content_type = raw_ct;
            }
        }
        if matches_name {
            let mut data = &part[header_end + sep_len..];
            if data.ends_with(b"\r\n") {
                data = &data[..data.len() - 2];
            } else if data.ends_with(b"\n") {
                data = &data[..data.len() - 1];
            }
            return Some(UploadedPart {
                content_type: part_content_type,
                data: data.to_vec(),
            });
        }
        pos += next_delim_rel + delim_bytes.len();
    }
    None
}

async fn transform_photo_with_images_binding(
    state: &AppState,
    raw_bytes: &[u8],
) -> Result<Vec<u8>, String> {
    let images_val = Reflect::get(state.env(), &JsValue::from_str("IMAGES")).map_err(|_| {
        "Photo uploads are unavailable right now. Please try again later.".to_string()
    })?;
    if images_val.is_undefined() || images_val.is_null() {
        return Err("Photo uploads are unavailable right now. Please try again later.".to_string());
    }

    let u8_arr = Uint8Array::from(raw_bytes);
    let resp_ctor =
        Reflect::get(&js_sys::global(), &JsValue::from_str("Response")).map_err(|_| {
            "Couldn't prepare that photo. Try a different one, or a JPEG or PNG.".to_string()
        })?;
    let resp_fn: Function = resp_ctor.dyn_into().map_err(|_| {
        "Couldn't prepare that photo. Try a different one, or a JPEG or PNG.".to_string()
    })?;
    let source_resp = Reflect::construct(&resp_fn, &Array::of1(&u8_arr)).map_err(|_| {
        "Couldn't prepare that photo. Try a different one, or a JPEG or PNG.".to_string()
    })?;
    let stream = Reflect::get(&source_resp, &JsValue::from_str("body")).map_err(|_| {
        "Couldn't prepare that photo. Try a different one, or a JPEG or PNG.".to_string()
    })?;

    let input_fn: Function = Reflect::get(&images_val, &JsValue::from_str("input"))
        .and_then(|v| v.dyn_into())
        .map_err(|_| {
            "Photo uploads are unavailable right now. Please try again later.".to_string()
        })?;
    let mut pipeline = input_fn.call1(&images_val, &stream).map_err(|_| {
        "Couldn't prepare that photo. Try a different one, or a JPEG or PNG.".to_string()
    })?;

    let transform_opts = Object::new();
    let _ = Reflect::set(
        &transform_opts,
        &JsValue::from_str("width"),
        &JsValue::from_f64(f64::from(PROFILE_PHOTO_PIXELS)),
    );
    let _ = Reflect::set(
        &transform_opts,
        &JsValue::from_str("height"),
        &JsValue::from_f64(f64::from(PROFILE_PHOTO_PIXELS)),
    );
    let _ = Reflect::set(
        &transform_opts,
        &JsValue::from_str("fit"),
        &JsValue::from_str("cover"),
    );
    let transform_fn: Function = Reflect::get(&pipeline, &JsValue::from_str("transform"))
        .and_then(|v| v.dyn_into())
        .map_err(|_| {
            "Couldn't prepare that photo. Try a different one, or a JPEG or PNG.".to_string()
        })?;
    pipeline = transform_fn
        .call1(&pipeline, &transform_opts)
        .map_err(|_| {
            "Couldn't prepare that photo. Try a different one, or a JPEG or PNG.".to_string()
        })?;

    let output_opts = Object::new();
    let _ = Reflect::set(
        &output_opts,
        &JsValue::from_str("format"),
        &JsValue::from_str(PROFILE_PHOTO_CONTENT_TYPE),
    );
    let _ = Reflect::set(
        &output_opts,
        &JsValue::from_str("quality"),
        &JsValue::from_f64(f64::from(PROFILE_PHOTO_QUALITY)),
    );
    let output_fn: Function = Reflect::get(&pipeline, &JsValue::from_str("output"))
        .and_then(|v| v.dyn_into())
        .map_err(|_| {
            "Couldn't prepare that photo. Try a different one, or a JPEG or PNG.".to_string()
        })?;
    let out_promise_val = output_fn.call1(&pipeline, &output_opts).map_err(|_| {
        "Couldn't prepare that photo. Try a different one, or a JPEG or PNG.".to_string()
    })?;
    let out_promise: Promise = out_promise_val.dyn_into().map_err(|_| {
        "Couldn't prepare that photo. Try a different one, or a JPEG or PNG.".to_string()
    })?;
    let result_val = JsFuture::from(out_promise).await.map_err(|_| {
        "Couldn't prepare that photo. Try a different one, or a JPEG or PNG.".to_string()
    })?;

    let response_fn: Function = Reflect::get(&result_val, &JsValue::from_str("response"))
        .and_then(|v| v.dyn_into())
        .map_err(|_| {
            "Couldn't prepare that photo. Try a different one, or a JPEG or PNG.".to_string()
        })?;
    let out_resp = response_fn.call0(&result_val).map_err(|_| {
        "Couldn't prepare that photo. Try a different one, or a JPEG or PNG.".to_string()
    })?;
    let ab_fn: Function = Reflect::get(&out_resp, &JsValue::from_str("arrayBuffer"))
        .and_then(|v| v.dyn_into())
        .map_err(|_| {
            "Couldn't prepare that photo. Try a different one, or a JPEG or PNG.".to_string()
        })?;
    let ab_promise: Promise = ab_fn
        .call0(&out_resp)
        .and_then(|v| v.dyn_into())
        .map_err(|_| {
            "Couldn't prepare that photo. Try a different one, or a JPEG or PNG.".to_string()
        })?;
    let buf = JsFuture::from(ab_promise).await.map_err(|_| {
        "Couldn't prepare that photo. Try a different one, or a JPEG or PNG.".to_string()
    })?;
    Ok(Uint8Array::new(&buf).to_vec())
}

async fn handle_upload_profile_photo(
    state: &AppState,
    headers: &HeaderMap,
    content_type: &str,
    raw_body: &[u8],
) -> Result<Response, ApiError> {
    let session = match require_member_session(state, headers).await {
        Ok(s) => s,
        Err(err) => return Ok(action_err(err.message)),
    };
    let Some(part) = extract_multipart_field(raw_body, content_type, "photo") else {
        return Ok(action_err("Choose a photo to upload."));
    };
    if part.data.is_empty() {
        return Ok(action_err(
            "That file doesn't look like an image we can read. Try a JPEG, PNG or WebP.",
        ));
    }
    if part.data.len() > MAX_PROFILE_PHOTO_BYTES {
        return Ok(action_err("That photo is too large — pick one under 3 MB."));
    }
    if let Some(ref ct) = part.content_type
        && !ACCEPTED_PROFILE_PHOTO_TYPES.contains(&ct.as_str())
    {
        return Ok(action_err(
            "Profile photos must be a JPEG, PNG or WebP image.",
        ));
    }
    if sniff_image_type(&part.data).is_none() {
        return Ok(action_err(
            "That file doesn't look like an image we can read. Try a JPEG, PNG or WebP.",
        ));
    }

    let Ok(bucket) = state.env().bucket("PROFILE_PHOTOS") else {
        return Ok(action_err(
            "Photo uploads are unavailable right now. Please try again later.",
        ));
    };

    if !allow_rate_limit(state, "PROFILE_PHOTO_RATE_LIMITER", &session.user.id).await {
        return Ok(action_err(
            "That's a lot of photos at once — try again in a minute.",
        ));
    }

    let current = get_user_profile(state.db(), &session.user.id).await?;
    let current_key = current
        .as_ref()
        .and_then(|u| profile_photo_key_owned_by(u.image.as_deref(), &session.user.id))
        .map(ToString::to_string);

    let encoded = match transform_photo_with_images_binding(state, &part.data).await {
        Ok(bytes) => bytes,
        Err(msg) => return Ok(action_err(msg)),
    };

    let digest = Sha256::digest(&encoded);
    let key = profile_photo_key(&session.user.id, &digest);

    bucket
        .put(&key, encoded)
        .http_metadata(HttpMetadata {
            content_type: Some(PROFILE_PHOTO_CONTENT_TYPE.to_string()),
            cache_control: Some(PROFILE_PHOTO_CACHE_CONTROL.to_string()),
            content_language: None,
            content_disposition: None,
            content_encoding: None,
            cache_expiry: None,
        })
        .execute()
        .await?;

    let path = profile_photo_path(&key);
    if let Err(err) =
        update_user_image(state.db(), &session.user.id, Some(&path), state.now_ms()).await
    {
        if current_key.as_deref() != Some(key.as_str()) {
            let _ = bucket.delete(&key).await;
        }
        return Err(err.into());
    }

    if let Some(old_key) = current_key
        && old_key != key
    {
        let _ = bucket.delete(&old_key).await;
    }

    Ok(action_ok())
}

#[worker::send]
pub async fn dispatch_action(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
    body: Body,
) -> Result<Response, ApiError> {
    let content_type = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    if content_type
        .to_ascii_lowercase()
        .starts_with("multipart/form-data")
    {
        let Ok(bytes) = axum::body::to_bytes(body, MAX_MULTIPART_ACTION_BYTES).await else {
            return Ok(action_err("That photo is too large — pick one under 3 MB."));
        };
        if name == "uploadProfilePhoto" {
            return handle_upload_profile_photo(&state, &headers, &content_type, &bytes).await;
        }
        return Ok(action_err("Invalid request"));
    }

    let Ok(bytes) = axum::body::to_bytes(body, MAX_JSON_ACTION_BYTES).await else {
        return Ok(action_err("Request payload too large"));
    };
    let Ok(call) = serde_json::from_slice::<ActionCallBody>(&bytes) else {
        return Ok(action_err("Invalid action payload"));
    };

    match name.as_str() {
        "pinProject" | "unpinProject" | "shareProject" | "unshareProject" => {
            use betabook_db::projects::{
                pin_project, share_project, unpin_project, unshare_project,
            };
            use betabook_domain::profile_share::share_expiry_modifier;
            let session = match require_member_session(&state, &headers).await {
                Ok(session) => session,
                Err(err) => return Ok(action_err(err.message)),
            };
            let user = &session.user.id;
            let climb = match parse_pos_i64_arg(call.args.first(), "Climb not found") {
                Ok(climb) => climb,
                Err(message) => return Ok(action_err(message)),
            };
            let expiry = if name == "shareProject" {
                match share_expiry_modifier(call.args.get(1).and_then(Value::as_str).unwrap_or(""))
                {
                    Ok(expiry) => expiry,
                    Err(message) => return Ok(action_err(message)),
                }
            } else {
                None
            };
            if !allow_rate_limit(&state, "JOURNAL_RATE_LIMITER", user).await {
                return Ok(action_err("Too many changes — try again in a minute"));
            }
            match name.as_str() {
                "pinProject" => {
                    map_mutation_result(pin_project(state.db(), user, climb).await, |()| {
                        action_ok()
                    })
                }
                "shareProject" => map_mutation_result(
                    share_project(state.db(), user, climb, expiry).await,
                    action_value,
                ),
                "unpinProject" => {
                    unpin_project(state.db(), user, climb).await?;
                    Ok(action_ok())
                }
                _ => {
                    unshare_project(state.db(), user, climb).await?;
                    Ok(action_ok())
                }
            }
        }
        "acceptTerms" => {
            let Some(session) = resolve_optional_session(&state, &headers).await? else {
                return Ok(action_err("Not signed in"));
            };
            let version = call.args.first().and_then(Value::as_str);
            let agreed = call.args.get(1).and_then(Value::as_bool) == Some(true);
            if !agreed {
                return Ok(action_err("Select the agreement checkbox to continue."));
            }
            if version != Some(TERMS_VERSION) {
                return Ok(action_err(
                    "The terms have changed. Reload this page to review the current version.",
                ));
            }
            record_terms_acceptance(state.db(), &session.user.id, state.now_ms()).await?;
            Ok(action_ok())
        }
        "submitContactMessage" => {
            let payload = call.args.into_iter().next().unwrap_or(Value::Null);
            handle_contact(&state, payload).await
        }
        "dismissFeatureAnnouncement" => {
            let session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            let Some(feature_id) = call.args.first().and_then(Value::as_str) else {
                return Ok(action_err("Invalid feature announcement."));
            };
            if feature_id != "analytics-customize" {
                return Ok(action_err("Invalid feature announcement."));
            }
            dismiss_feature_announcement(state.db(), &session.user.id, feature_id).await?;
            Ok(action_ok())
        }
        "saveProductTourStatus" => {
            let session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            let id = call.args.first().and_then(Value::as_str).unwrap_or("");
            let version = call.args.get(1).and_then(Value::as_i64).unwrap_or(0);
            let status = call.args.get(2).and_then(Value::as_str).unwrap_or("");
            if id != "journal" || version != 7 {
                return Ok(action_err(
                    "This tour has changed. Reload the page and try again.",
                ));
            }
            if status != "dismissed" && status != "completed" {
                return Ok(action_err("Invalid product tour status"));
            }
            upsert_product_tour_status(state.db(), &session.user.id, id, version, status).await?;
            Ok(action_ok())
        }

        // Friendships
        "requestFriendship" => {
            let session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            let target_id = match parse_target_user_id(call.args.first(), &session.user.id) {
                Ok(id) => id,
                Err(msg) => return Ok(action_err(msg)),
            };
            if !allow_rate_limit(&state, "FRIENDSHIP_RATE_LIMITER", &session.user.id).await {
                return Ok(action_err(
                    "Too many friend requests — try again in a minute",
                ));
            }
            let inserted = insert_friend_request(state.db(), &session.user.id, &target_id).await?;
            let status = if inserted {
                if let (Ok(Some(req_user)), Ok(Some(rec_user))) = (
                    get_user_by_id(state.db(), &session.user.id).await,
                    get_user_by_id(state.db(), &target_id).await,
                ) && let Err(err) =
                    send_friend_request_email(&state, &rec_user.email, &req_user.name).await
                {
                    worker::console_error!("friend request email failed: {err}");
                }
                "outgoing".to_string()
            } else {
                let target = get_user_profile(state.db(), &target_id).await?;
                if target.is_none_or(|t| t.is_private) {
                    return Ok(action_err("Climber not found"));
                }
                let current =
                    get_friendship_status(state.db(), &session.user.id, &target_id).await?;
                if current == "none" {
                    return Ok(action_err("Climber not found"));
                }
                current
            };
            Ok(action_value(status))
        }
        "acceptFriendRequest" => {
            let session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            let target_id = match parse_target_user_id(call.args.first(), &session.user.id) {
                Ok(id) => id,
                Err(msg) => return Ok(action_err(msg)),
            };
            if !accept_friend_request(state.db(), &session.user.id, &target_id).await? {
                return Ok(action_err("This friend request is no longer available"));
            }
            Ok(action_value("friends"))
        }
        "cancelFriendRequest" | "declineFriendRequest" | "removeFriendship" => {
            let session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            let target_id = match parse_target_user_id(call.args.first(), &session.user.id) {
                Ok(id) => id,
                Err(msg) => return Ok(action_err(msg)),
            };
            let op = match name.as_str() {
                "cancelFriendRequest" => FriendshipEndOp::Cancel,
                "declineFriendRequest" => FriendshipEndOp::Decline,
                _ => FriendshipEndOp::Remove,
            };
            if !end_friendship_relationship(state.db(), &session.user.id, &target_id, op).await? {
                return Ok(action_err(
                    "Couldn't save that change. Refresh and try again.",
                ));
            }
            Ok(action_value("none"))
        }

        // Account settings
        "updateDisplayName" => {
            let session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            let form = match FormFields::from_arg(call.args.first()) {
                Ok(f) => f,
                Err(msg) => return Ok(action_err(msg)),
            };
            let trimmed = match form.require_trimmed("name", "Display name") {
                Ok(n) => n,
                Err(msg) => return Ok(action_err(msg)),
            };
            if let Some(problem) = display_name_problem(&trimmed) {
                return Ok(action_err(problem));
            }
            if let Some(holder) = get_user_id_by_name_nocase(state.db(), &trimmed).await?
                && holder != session.user.id
            {
                return Ok(action_err(DISPLAY_NAME_TAKEN_MESSAGE));
            }
            update_user_display_name(state.db(), &session.user.id, &trimmed, state.now_ms())
                .await?;
            Ok(action_ok())
        }
        "setUserPrivate" => {
            let session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            let is_private = call.args.first().and_then(Value::as_bool) == Some(true);
            update_user_private(state.db(), &session.user.id, is_private, state.now_ms()).await?;
            Ok(action_ok())
        }
        "setJournalVisibility"
        | "setTripVisibility"
        | "setClimbListVisibility"
        | "setSendCommentVisibility" => {
            let session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            let raw = call.args.first().and_then(Value::as_str).unwrap_or("");
            let parsed = if name == "setSendCommentVisibility" {
                parse_send_comment_audience(raw)
            } else {
                parse_sharing_audience(raw)
            };
            let value = match parsed {
                Ok(v) => v,
                Err(msg) => return Ok(action_err(msg)),
            };
            let col = match name.as_str() {
                "setJournalVisibility" => VisibilityColumn::Journal,
                "setSendCommentVisibility" => VisibilityColumn::SendComment,
                "setTripVisibility" => VisibilityColumn::Trip,
                _ => VisibilityColumn::ClimbList,
            };
            update_user_visibility(state.db(), &session.user.id, col, value, state.now_ms())
                .await?;
            Ok(action_ok())
        }
        "setGradePreferences" => {
            let session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            let obj = call.args.first().and_then(Value::as_object);
            let raw_b = obj
                .and_then(|o| o.get("boulder"))
                .and_then(Value::as_str)
                .unwrap_or("");
            let raw_r = obj
                .and_then(|o| o.get("rope"))
                .and_then(Value::as_str)
                .unwrap_or("");
            let boulder = match parse_boulder_scale(raw_b) {
                Ok(v) => v,
                Err(msg) => return Ok(action_err(msg)),
            };
            let rope = match parse_rope_scale(raw_r) {
                Ok(v) => v,
                Err(msg) => return Ok(action_err(msg)),
            };
            update_user_grade_preferences(
                state.db(),
                &session.user.id,
                boulder.as_str(),
                rope.as_str(),
                state.now_ms(),
            )
            .await?;
            Ok(action_ok())
        }
        "resetProfileShareLink" => {
            let session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            reset_profile_share_link(state.db(), &session.user.id).await?;
            Ok(action_ok())
        }
        "removeProfilePhoto" => {
            let session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            let current = get_account_user(state.db(), &session.user.id).await?;
            update_user_image(state.db(), &session.user.id, None, state.now_ms()).await?;
            if let Some(key) = current
                .as_ref()
                .and_then(|u| profile_photo_key_owned_by(u.image.as_deref(), &session.user.id))
                && let Ok(bucket) = state.env().bucket("PROFILE_PHOTOS")
            {
                let _ = bucket.delete(key).await;
            }
            Ok(action_ok())
        }

        // Sends
        "getSendEditorData" => {
            let session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            let target = call.args.first().and_then(Value::as_object);
            let requested_send_id = target.and_then(|o| o.get("sendId"));
            let requested_entry_id = target.and_then(|o| o.get("entryId"));

            let (requested_entry, send) = if requested_send_id.is_some() {
                let send_id = match parse_pos_i64_arg(requested_send_id, "Send not found") {
                    Ok(id) => id,
                    Err(msg) => return Ok(action_err(msg)),
                };
                (None, get_send_by_id(state.db(), send_id).await?)
            } else {
                let entry_id = match parse_pos_i64_arg(
                    requested_entry_id,
                    "This entry is no longer linked to a send — refresh and try again",
                ) {
                    Ok(id) => id,
                    Err(msg) => return Ok(action_err(msg)),
                };
                let entry =
                    get_journal_entry_for_edit(state.db(), entry_id, &session.user.id).await?;
                let Some(climb_id) = entry
                    .as_ref()
                    .filter(|e| e.is_ascent)
                    .and_then(|e| e.climb_id)
                else {
                    return Ok(action_err(
                        "This entry is no longer linked to a send — refresh and try again",
                    ));
                };
                let s = get_user_send_for_climb(state.db(), &session.user.id, climb_id).await?;
                (entry, s)
            };

            let Some(send_row) = send else {
                return Ok(action_err("Send not found"));
            };
            if send_row.user_id != session.user.id {
                return Ok(action_err("Send not found"));
            }
            let Some(climb) = get_climb_by_id(state.db(), send_row.climb_id).await? else {
                return Ok(action_err("Climb not found"));
            };
            let entry_id =
                get_ascent_entry_id(state.db(), &session.user.id, send_row.climb_id).await?;
            if let Some(ref req_entry) = requested_entry
                && entry_id != Some(req_entry.id)
            {
                return Ok(action_err("The journal changed — refresh and try again"));
            }
            let entry = match requested_entry {
                Some(e) => Some(e),
                None => match entry_id {
                    Some(eid) => {
                        get_journal_entry_for_edit(state.db(), eid, &session.user.id).await?
                    }
                    None => None,
                },
            };

            Ok(action_value(json!({
                "send": send_row.into_editable(),
                "entry": entry,
                "climb": {
                    "id": climb.id,
                    "areaId": climb.area_id,
                    "type": climb.climb_type,
                    "grade": climb.grade,
                    "brokenOn": climb.broken_on,
                },
            })))
        }
        "createUndatedSend" => {
            let session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            if !allow_rate_limit(&state, "JOURNAL_RATE_LIMITER", &session.user.id).await {
                return Ok(action_err(JOURNAL_RATE_LIMIT_MESSAGE));
            }
            let form = match FormFields::from_arg(call.args.first()) {
                Ok(f) => f,
                Err(msg) => return Ok(action_err(msg)),
            };
            if !form.get_all("companion").is_empty() {
                return Ok(action_err("Add a date to tag friends"));
            }
            let Some(climb_id) = form
                .get("climbId")
                .and_then(|s| s.trim().parse::<i64>().ok())
                .filter(|&id| id >= 1)
            else {
                return Ok(action_err("Invalid climb"));
            };
            let Some(climb) = get_climb_by_id(state.db(), climb_id).await? else {
                return Ok(action_err("Climb not found"));
            };
            if let Err(msg) = assert_loggable_on_climb(climb.broken_on.as_deref(), None) {
                return Ok(action_err(msg));
            }
            if get_user_send_for_climb(state.db(), &session.user.id, climb_id)
                .await?
                .is_some()
            {
                return Ok(action_err(
                    "You've already logged this climb — use Edit send to change it",
                ));
            }
            let videos = read_video_fields(&form);
            let input = match validate_send_input(
                climb.climb_type,
                form.get("ascentStyle"),
                form.get("dateSent"),
                form.get("comment"),
                form.get("rating"),
                form.get("suggestedGrade"),
                form.get("gradeFeel"),
                videos.as_deref(),
                &today_utc(&state),
            ) {
                Ok(v) => v,
                Err(msg) => return Ok(action_err(msg)),
            };
            if input.date_sent.is_some() {
                return Ok(action_err("Use the journal to log a dated send"));
            }
            let res = create_undated_send(
                state.db(),
                &session.user.id,
                climb_id,
                climb.climb_type,
                &input,
                state.now_ms(),
            )
            .await;
            map_mutation_result(res, |()| action_ok())
        }
        "updateSend" => {
            let session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            let send_id = match parse_pos_i64_arg(call.args.first(), "Send not found") {
                Ok(id) => id,
                Err(msg) => return Ok(action_err(msg)),
            };
            let form = match FormFields::from_arg(call.args.get(1)) {
                Ok(f) => f,
                Err(msg) => return Ok(action_err(msg)),
            };
            let existing = match get_send_by_id(state.db(), send_id).await? {
                Some(s) if s.user_id == session.user.id => s,
                _ => return Ok(action_err("Send not found")),
            };
            let Some(climb) = get_climb_by_id(state.db(), existing.climb_id).await? else {
                return Ok(action_err("Climb not found"));
            };
            let videos = read_video_fields(&form);
            let input = match validate_send_input(
                climb.climb_type,
                form.get("ascentStyle"),
                form.get("dateSent"),
                form.get("comment"),
                form.get("rating"),
                form.get("suggestedGrade"),
                form.get("gradeFeel"),
                videos.as_deref(),
                &today_utc(&state),
            ) {
                Ok(v) => v,
                Err(msg) => return Ok(action_err(msg)),
            };
            let companions = match read_companion_selection(&form) {
                Ok(c) => c,
                Err(msg) => return Ok(action_err(msg)),
            };
            let tags_changed = form.has("tagsChanged");
            let normalized_tags = if tags_changed {
                match normalize_tags(&form.get_all("tag")) {
                    Ok(t) => Some(t),
                    Err(msg) => return Ok(action_err(msg)),
                }
            } else {
                None
            };
            let expected_je_id = form
                .has("journalEntryId")
                .then(|| form.get("journalEntryId").unwrap_or(""));
            let res = update_send_with_journal(
                state.db(),
                &session.user.id,
                send_id,
                &input,
                companions.as_deref(),
                expected_je_id,
                tags_changed,
                normalized_tags.as_deref(),
                state.now_ms(),
            )
            .await;
            map_mutation_result(res, |()| action_ok())
        }
        "deleteSend" => {
            let session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            let send_id = match parse_pos_i64_arg(call.args.first(), "Send not found") {
                Ok(id) => id,
                Err(msg) => return Ok(action_err(msg)),
            };
            let res = delete_user_send(state.db(), &session.user.id, send_id).await;
            map_mutation_result(res, |_| action_ok())
        }

        // Journal
        "createJournalEntry" => {
            let session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            if !allow_rate_limit(&state, "JOURNAL_RATE_LIMITER", &session.user.id).await {
                return Ok(action_err(JOURNAL_RATE_LIMIT_MESSAGE));
            }
            let form = match FormFields::from_arg(call.args.first()) {
                Ok(f) => f,
                Err(msg) => return Ok(action_err(msg)),
            };
            let today = today_utc(&state);
            let input = match validate_journal_input(
                form.get("kind"),
                form.get("climbId"),
                form.get("sent"),
                form.get("entryDate"),
                form.get("body"),
                &form.get_all("tag"),
                &today,
            ) {
                Ok(v) => v,
                Err(msg) => return Ok(action_err(msg)),
            };
            let companions = match read_companion_selection(&form) {
                Ok(c) => c,
                Err(msg) => return Ok(action_err(msg)),
            };
            let has_send_fields = carries_send_fields(&form);
            let mut send_input_if_new = None;
            if input.sent
                && let Some(cid) = input.climb_id
                && let Some(climb) = get_climb_by_id(state.db(), cid).await?
                && get_user_send_for_climb(state.db(), &session.user.id, cid)
                    .await?
                    .is_none()
            {
                let videos = read_video_fields(&form);
                let parsed_send = match validate_send_input(
                    climb.climb_type,
                    form.get("ascentStyle"),
                    Some(&input.entry_date),
                    input.body.as_deref(),
                    form.get("rating"),
                    form.get("suggestedGrade"),
                    form.get("gradeFeel"),
                    videos.as_deref(),
                    &today,
                ) {
                    Ok(v) => v,
                    Err(msg) => return Ok(action_err(msg)),
                };
                send_input_if_new = Some(parsed_send);
            }

            let res = create_journal_entry_with_sync(
                state.db(),
                &session.user.id,
                &input,
                send_input_if_new.as_ref(),
                has_send_fields,
                companions.as_deref(),
                state.now_ms(),
            )
            .await;
            map_mutation_result(res, |()| action_ok())
        }
        "updateJournalEntry" => {
            let session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            if !allow_rate_limit(&state, "JOURNAL_RATE_LIMITER", &session.user.id).await {
                return Ok(action_err(JOURNAL_RATE_LIMIT_MESSAGE));
            }
            let entry_id = match parse_pos_i64_arg(call.args.first(), "Entry not found") {
                Ok(id) => id,
                Err(msg) => return Ok(action_err(msg)),
            };
            let form = match FormFields::from_arg(call.args.get(1)) {
                Ok(f) => f,
                Err(msg) => return Ok(action_err(msg)),
            };
            let input = match validate_journal_input(
                form.get("kind"),
                form.get("climbId"),
                form.get("sent"),
                form.get("entryDate"),
                form.get("body"),
                &form.get_all("tag"),
                &today_utc(&state),
            ) {
                Ok(v) => v,
                Err(msg) => return Ok(action_err(msg)),
            };
            let companions = match read_companion_selection(&form) {
                Ok(c) => c,
                Err(msg) => return Ok(action_err(msg)),
            };
            let res = update_journal_entry_with_sync(
                state.db(),
                &session.user.id,
                entry_id,
                &input,
                carries_send_fields(&form),
                companions.as_deref(),
                state.now_ms(),
            )
            .await;
            map_mutation_result(res, |()| action_ok())
        }
        "deleteJournalEntry" => {
            let session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            if !allow_rate_limit(&state, "JOURNAL_RATE_LIMITER", &session.user.id).await {
                return Ok(action_err(JOURNAL_RATE_LIMIT_MESSAGE));
            }
            let entry_id = match parse_pos_i64_arg(call.args.first(), "Entry not found") {
                Ok(id) => id,
                Err(msg) => return Ok(action_err(msg)),
            };
            let res = delete_journal_entry_with_sync(state.db(), &session.user.id, entry_id).await;
            map_mutation_result(res, |()| action_ok())
        }
        "removeMyJournalTag" => {
            let session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            if !allow_rate_limit(&state, "JOURNAL_RATE_LIMITER", &session.user.id).await {
                return Ok(action_err(JOURNAL_RATE_LIMIT_MESSAGE));
            }
            let entry_id = match parse_pos_i64_arg(call.args.first(), "Entry not found") {
                Ok(id) => id,
                Err(msg) => return Ok(action_err(msg)),
            };
            let res = remove_my_journal_tag(state.db(), &session.user.id, entry_id).await;
            map_mutation_result(res, |()| action_ok())
        }

        // Areas & Climbs
        "createArea" => {
            let _session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            let parent_id = match parse_pos_i64_arg(call.args.first(), "Parent area not found") {
                Ok(id) => id,
                Err(msg) => return Ok(action_err(msg)),
            };
            if get_public_area(state.db(), parent_id).await?.is_none() {
                return Ok(action_err("Parent area not found"));
            }
            let form = match FormFields::from_arg(call.args.get(1)) {
                Ok(f) => f,
                Err(msg) => return Ok(action_err(msg)),
            };
            let area_name = match form.require_trimmed("name", "Name") {
                Ok(n) => n,
                Err(msg) => return Ok(action_err(msg)),
            };
            let description = form.trim_or_none("description");
            let id = create_area(state.db(), parent_id, &area_name, description.as_deref()).await?;
            Ok(action_value(id))
        }
        "updateArea" => {
            let _session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            let area_id = match parse_pos_i64_arg(call.args.first(), "Area not found") {
                Ok(id) => id,
                Err(msg) => return Ok(action_err(msg)),
            };
            if get_public_area(state.db(), area_id).await?.is_none() {
                return Ok(action_err("Area not found"));
            }
            let form = match FormFields::from_arg(call.args.get(1)) {
                Ok(f) => f,
                Err(msg) => return Ok(action_err(msg)),
            };
            let description = form.trim_or_none("description");
            update_area_description(state.db(), area_id, description.as_deref()).await?;
            Ok(action_ok())
        }
        "createClimb" => {
            let _session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            let area_id = match parse_pos_i64_arg(call.args.first(), "Area not found") {
                Ok(id) => id,
                Err(msg) => return Ok(action_err(msg)),
            };
            if get_public_area(state.db(), area_id).await?.is_none() {
                return Ok(action_err("Area not found"));
            }
            let form = match FormFields::from_arg(call.args.get(1)) {
                Ok(f) => f,
                Err(msg) => return Ok(action_err(msg)),
            };
            let climb_name = match form.require_trimmed("name", "Name") {
                Ok(n) => n,
                Err(msg) => return Ok(action_err(msg)),
            };
            let Some(climb_type) = form.get("type").and_then(ClimbType::parse) else {
                return Ok(action_err("Invalid discipline"));
            };
            let Some(raw_grade) = form.get("grade").filter(|s| !s.is_empty()) else {
                return Ok(action_err("Grade is required"));
            };
            let bounds = native_grade_array(climb_type).len();
            let Ok(parsed_f) = raw_grade.trim().parse::<f64>() else {
                return Ok(action_err("Invalid grade"));
            };
            if !parsed_f.is_finite()
                || parsed_f.fract() != 0.0
                || parsed_f < 0.0
                || (parsed_f as usize) >= bounds
            {
                return Ok(action_err("Invalid grade"));
            }
            let grade = parsed_f as i64;
            let description = form.trim_or_none("description");
            let id = create_climb(
                state.db(),
                area_id,
                &climb_name,
                climb_type,
                grade,
                description.as_deref(),
            )
            .await?;
            Ok(action_value(id))
        }
        "updateClimb" => {
            let _session = match require_member_session(&state, &headers).await {
                Ok(s) => s,
                Err(err) => return Ok(action_err(err.message)),
            };
            let climb_id = match parse_pos_i64_arg(call.args.first(), "Climb not found") {
                Ok(id) => id,
                Err(msg) => return Ok(action_err(msg)),
            };
            if get_climb_by_id(state.db(), climb_id).await?.is_none() {
                return Ok(action_err("Climb not found"));
            }
            let form = match FormFields::from_arg(call.args.get(1)) {
                Ok(f) => f,
                Err(msg) => return Ok(action_err(msg)),
            };
            let description = form.trim_or_none("description");
            update_climb_description(state.db(), climb_id, description.as_deref()).await?;
            Ok(action_ok())
        }
        _ => Ok(action_err(
            "This action is being migrated onto the Rust Worker in the next stack layer.",
        )),
    }
}
