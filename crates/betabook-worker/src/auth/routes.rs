use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use betabook_db::auth::{
    CreateCredentialUser, CreateOAuthUser, SessionRecord, VerificationRow,
    create_oauth_user_and_account, create_session, create_user_with_credential,
    create_verification, delete_account_and_cleanup, delete_session_by_token, delete_verification,
    find_credential_password_by_user_id, find_oauth_account_user_id, find_user_by_email,
    find_valid_verification, get_share_link_owner, get_terms_acceptance, get_user_by_id,
    get_user_id_by_name_nocase, link_oauth_account, mark_email_verified, record_terms_acceptance,
    reset_credential_password_and_revoke_sessions, unique_display_name,
};
use betabook_domain::display_name::{DISPLAY_NAME_TAKEN_MESSAGE, display_name_problem};
use betabook_domain::password::{hash_password, random_bytes, random_hex, verify_password};
use betabook_domain::profile_share::profile_share_from_path;
use betabook_domain::terms::{
    TERMS_REQUIRED_MESSAGE, TERMS_UPDATED_LABEL, TERMS_VERSION, has_accepted_current_terms,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use url::form_urlencoded;

use crate::auth::cookies::{
    OAUTH_STATE_COOKIE, SESSION_EXPIRES_MS, build_oauth_state_cookie, build_session_cookie_header,
    clear_oauth_state_cookie, clear_session_cookie_header, read_session_token, read_signed_cookie,
};
use crate::auth::email::{
    send_reset_password_email, send_verification_email, welcome_new_account_once,
};
use crate::auth::session::resolve_optional_session;
use crate::state::{ApiError, AppState, http_get_bearer_json, http_post_form};

const MIN_PASSWORD_LEN: usize = 8;
const MAX_PASSWORD_LEN: usize = 128;
const VERIFICATION_TTL_MS: i64 = 1000 * 60 * 60 * 24;
const PASSWORD_RESET_TTL_MS: i64 = 1000 * 60 * 60;

fn safe_relative_path(raw: Option<&str>, fallback: &str) -> String {
    let Some(path) = raw else {
        return fallback.to_string();
    };
    if path.starts_with('/') && !path.starts_with("//") && !path.contains('\\') {
        path.to_string()
    } else {
        fallback.to_string()
    }
}

fn no_store_json(status: StatusCode, body: Value) -> Response {
    let mut resp = (status, Json(body)).into_response();
    resp.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store"),
    );
    resp
}

fn redirect_response(location: &str, cookies: &[String]) -> Response {
    let mut resp = (
        StatusCode::FOUND,
        [
            (header::LOCATION, location),
            (header::CACHE_CONTROL, "private, no-store"),
        ],
        axum::body::Body::empty(),
    )
        .into_response();
    for cookie in cookies {
        if let Ok(val) = HeaderValue::from_str(cookie) {
            resp.headers_mut().append(header::SET_COOKIE, val);
        }
    }
    resp
}

async fn verify_turnstile(
    state: &AppState,
    headers: &HeaderMap,
    body_token: Option<&str>,
) -> Result<(), ApiError> {
    let (Some(_site_key), Some(secret_key)) = (
        state.env_var("TURNSTILE_SITE_KEY"),
        state.env_var("TURNSTILE_SECRET_KEY"),
    ) else {
        return Ok(());
    };
    let token = headers
        .get("x-captcha-response")
        .and_then(|v| v.to_str().ok())
        .or(body_token)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            ApiError::with_code(
                StatusCode::FORBIDDEN,
                "CAPTCHA_REQUIRED",
                "Please complete the verification check.",
            )
        })?;

    let mut encoder = form_urlencoded::Serializer::new(String::new());
    encoder.append_pair("secret", &secret_key);
    encoder.append_pair("response", token);
    if let Some(ip) = headers
        .get("cf-connecting-ip")
        .and_then(|v| v.to_str().ok())
    {
        encoder.append_pair("remoteip", ip);
    }
    let form = encoder.finish();
    let (status, resp_text) = http_post_form(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        &form,
    )
    .await?;
    let parsed: Value = serde_json::from_str(&resp_text).unwrap_or(Value::Null);
    if !(200..300).contains(&status) || parsed.get("success").and_then(Value::as_bool) != Some(true)
    {
        return Err(ApiError::with_code(
            StatusCode::FORBIDDEN,
            "CAPTCHA_FAILED",
            "Verification failed — please try again.",
        ));
    }
    Ok(())
}

async fn resolve_referred_by(
    state: &AppState,
    share_path: Option<&str>,
) -> Result<Option<String>, ApiError> {
    let Some((user_id, token)) = profile_share_from_path(share_path) else {
        return Ok(None);
    };
    let Some(owner) = get_share_link_owner(state.db(), &token).await? else {
        return Ok(None);
    };
    if owner.id == user_id {
        Ok(Some(user_id))
    } else {
        Ok(None)
    }
}

fn validate_password_len(password: &str) -> Result<(), ApiError> {
    if password.len() < MIN_PASSWORD_LEN {
        return Err(ApiError::with_code(
            StatusCode::BAD_REQUEST,
            "PASSWORD_TOO_SHORT",
            format!("Password must be at least {MIN_PASSWORD_LEN} characters."),
        ));
    }
    if password.len() > MAX_PASSWORD_LEN {
        return Err(ApiError::with_code(
            StatusCode::BAD_REQUEST,
            "PASSWORD_TOO_LONG",
            format!("Password must be at most {MAX_PASSWORD_LEN} characters."),
        ));
    }
    Ok(())
}

#[worker::send]
pub async fn get_session(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let session = resolve_optional_session(&state, &headers).await?;
    let body = match session {
        Some(data) => serde_json::to_value(data).map_err(ApiError::internal)?,
        None => Value::Null,
    };
    Ok(no_store_json(StatusCode::OK, body))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignUpEmailBody {
    pub name: String,
    pub email: String,
    pub password: String,
    #[serde(rename = "callbackURL")]
    pub callback_url: Option<String>,
    pub accepted_terms_version: Option<String>,
    pub share_path: Option<String>,
    pub captcha_token: Option<String>,
}

#[worker::send]
pub async fn sign_up_email(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SignUpEmailBody>,
) -> Result<Response, ApiError> {
    verify_turnstile(&state, &headers, body.captcha_token.as_deref()).await?;

    if body.accepted_terms_version.as_deref() != Some(TERMS_VERSION) {
        return Err(ApiError::with_code(
            StatusCode::BAD_REQUEST,
            "TERMS_ACCEPTANCE_REQUIRED",
            TERMS_REQUIRED_MESSAGE,
        ));
    }

    let name = body.name.trim();
    if let Some(problem) = display_name_problem(name) {
        return Err(ApiError::new(StatusCode::UNPROCESSABLE_ENTITY, problem));
    }
    let email = body.email.trim().to_ascii_lowercase();
    if email.is_empty() || !email.contains('@') {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "Enter a valid email address.",
        ));
    }
    validate_password_len(&body.password)?;

    if find_user_by_email(state.db(), &email).await?.is_some() {
        return Err(ApiError::with_code(
            StatusCode::UNPROCESSABLE_ENTITY,
            "USER_ALREADY_EXISTS",
            "User already exists",
        ));
    }
    if get_user_id_by_name_nocase(state.db(), name)
        .await?
        .is_some()
    {
        return Err(ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            DISPLAY_NAME_TAKEN_MESSAGE,
        ));
    }

    let referred_by = resolve_referred_by(&state, body.share_path.as_deref()).await?;
    let password_hash = hash_password(&body.password).map_err(ApiError::internal)?;
    let user_id = random_hex(16).map_err(ApiError::internal)?;
    let account_id = random_hex(16).map_err(ApiError::internal)?;
    let ver_id = random_hex(16).map_err(ApiError::internal)?;
    let ver_token = random_hex(24).map_err(ApiError::internal)?;
    let now = state.now_ms();

    create_user_with_credential(
        state.db(),
        &CreateCredentialUser {
            user_id: &user_id,
            account_id: &account_id,
            name,
            email: &email,
            password_hash: &password_hash,
            terms_version: TERMS_VERSION,
            referred_by: referred_by.as_deref(),
            now_ms: now,
        },
    )
    .await?;

    create_verification(
        state.db(),
        &VerificationRow {
            id: ver_id,
            identifier: format!("email-verification:{ver_token}"),
            value: user_id.clone(),
            expires_at: now + VERIFICATION_TTL_MS,
        },
        now,
    )
    .await?;

    let callback = safe_relative_path(body.callback_url.as_deref(), "/sign-in");
    let mut qs = form_urlencoded::Serializer::new(String::new());
    qs.append_pair("token", &ver_token);
    qs.append_pair("callbackURL", &callback);
    let verify_url = format!(
        "{}/api/auth/verify-email?{}",
        state.auth_url().trim_end_matches('/'),
        qs.finish()
    );
    if let Err(err) = send_verification_email(&state, &email, &verify_url).await {
        worker::console_error!("verification email failed: {err:?}");
    }

    Ok(no_store_json(
        StatusCode::OK,
        json!({
            "token": Value::Null,
            "user": {
                "id": user_id,
                "name": name,
                "email": email,
                "emailVerified": false,
            }
        }),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendVerificationBody {
    pub email: String,
    #[serde(rename = "callbackURL")]
    pub callback_url: Option<String>,
}

#[worker::send]
pub async fn send_verification_email_route(
    State(state): State<AppState>,
    Json(body): Json<SendVerificationBody>,
) -> Result<Response, ApiError> {
    let email = body.email.trim().to_ascii_lowercase();
    if let Some(user) = find_user_by_email(state.db(), &email).await?
        && !user.email_verified
    {
        let ver_id = random_hex(16).map_err(ApiError::internal)?;
        let ver_token = random_hex(24).map_err(ApiError::internal)?;
        let now = state.now_ms();
        create_verification(
            state.db(),
            &VerificationRow {
                id: ver_id,
                identifier: format!("email-verification:{ver_token}"),
                value: user.id,
                expires_at: now + VERIFICATION_TTL_MS,
            },
            now,
        )
        .await?;
        let callback = safe_relative_path(body.callback_url.as_deref(), "/sign-in");
        let mut qs = form_urlencoded::Serializer::new(String::new());
        qs.append_pair("token", &ver_token);
        qs.append_pair("callbackURL", &callback);
        let verify_url = format!(
            "{}/api/auth/verify-email?{}",
            state.auth_url().trim_end_matches('/'),
            qs.finish()
        );
        if let Err(err) = send_verification_email(&state, &user.email, &verify_url).await {
            worker::console_error!("resend verification failed: {err:?}");
        }
    }
    Ok(no_store_json(StatusCode::OK, json!({ "status": true })))
}

#[derive(Deserialize)]
pub struct VerifyEmailQuery {
    pub token: Option<String>,
    #[serde(rename = "callbackURL")]
    pub callback_url: Option<String>,
}

#[worker::send]
pub async fn verify_email(
    State(state): State<AppState>,
    Query(query): Query<VerifyEmailQuery>,
) -> Result<Response, ApiError> {
    let fallback = safe_relative_path(query.callback_url.as_deref(), "/sign-in");
    let Some(token) = query.token.as_deref().filter(|s| !s.is_empty()) else {
        return Ok(redirect_response("/sign-in?error=invalid_token", &[]));
    };
    let identifier = format!("email-verification:{token}");
    let now = state.now_ms();
    let Some(ver) = find_valid_verification(state.db(), &identifier, now).await? else {
        return Ok(redirect_response("/sign-in?error=invalid_token", &[]));
    };
    delete_verification(state.db(), &ver.id).await?;
    if let Some(user) = get_user_by_id(state.db(), &ver.value).await? {
        if !user.email_verified {
            mark_email_verified(state.db(), &user.id, now).await?;
        }
        welcome_new_account_once(&state, &user.id, &user.email, &user.name).await;
    }
    Ok(redirect_response(&fallback, &[]))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInEmailBody {
    pub email: String,
    pub password: String,
    pub captcha_token: Option<String>,
}

#[worker::send]
pub async fn sign_in_email(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SignInEmailBody>,
) -> Result<Response, ApiError> {
    verify_turnstile(&state, &headers, body.captcha_token.as_deref()).await?;

    let email = body.email.trim().to_ascii_lowercase();
    let Some(user) = find_user_by_email(state.db(), &email).await? else {
        return Err(ApiError::with_code(
            StatusCode::UNAUTHORIZED,
            "INVALID_EMAIL_OR_PASSWORD",
            "Invalid email or password",
        ));
    };
    let Some(stored_hash) = find_credential_password_by_user_id(state.db(), &user.id).await? else {
        return Err(ApiError::with_code(
            StatusCode::UNAUTHORIZED,
            "INVALID_EMAIL_OR_PASSWORD",
            "Invalid email or password",
        ));
    };
    if !verify_password(&stored_hash, &body.password) {
        return Err(ApiError::with_code(
            StatusCode::UNAUTHORIZED,
            "INVALID_EMAIL_OR_PASSWORD",
            "Invalid email or password",
        ));
    }
    if !user.email_verified {
        return Err(ApiError::with_code(
            StatusCode::FORBIDDEN,
            "EMAIL_NOT_VERIFIED",
            "Email not verified",
        ));
    }

    let now = state.now_ms();
    let session_id = random_hex(16).map_err(ApiError::internal)?;
    let session_token = random_hex(24).map_err(ApiError::internal)?;
    let ip_address = headers
        .get("cf-connecting-ip")
        .and_then(|v| v.to_str().ok())
        .map(ToString::to_string);
    let user_agent = headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(ToString::to_string);

    create_session(
        state.db(),
        &SessionRecord {
            id: session_id,
            expires_at: now + SESSION_EXPIRES_MS,
            token: session_token.clone(),
            created_at: now,
            updated_at: now,
            ip_address,
            user_agent,
            user_id: user.id.clone(),
        },
    )
    .await?;

    let secret = state.auth_secret()?;
    let cookie = build_session_cookie_header(&session_token, &secret, state.is_secure_cookies());
    let mut resp = no_store_json(
        StatusCode::OK,
        json!({
            "redirect": false,
            "token": session_token,
            "user": {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "emailVerified": user.email_verified,
                "image": user.image,
                "role": user.role,
            }
        }),
    );
    if let Ok(val) = HeaderValue::from_str(&cookie) {
        resp.headers_mut().append(header::SET_COOKIE, val);
    }
    Ok(resp)
}

#[worker::send]
pub async fn sign_out(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let secret = state.auth_secret()?;
    let secure = state.is_secure_cookies();
    if let Some(token) = read_session_token(&headers, &secret, secure) {
        delete_session_by_token(state.db(), &token).await?;
    }
    let mut resp = no_store_json(StatusCode::OK, json!({ "success": true }));
    if let Ok(val) = HeaderValue::from_str(&clear_session_cookie_header(secure)) {
        resp.headers_mut().append(header::SET_COOKIE, val);
    }
    Ok(resp)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestPasswordResetBody {
    pub email: String,
    pub redirect_to: Option<String>,
    pub captcha_token: Option<String>,
}

#[worker::send]
pub async fn request_password_reset(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<RequestPasswordResetBody>,
) -> Result<Response, ApiError> {
    verify_turnstile(&state, &headers, body.captcha_token.as_deref()).await?;
    let email = body.email.trim().to_ascii_lowercase();
    if let Some(user) = find_user_by_email(state.db(), &email).await? {
        let ver_id = random_hex(16).map_err(ApiError::internal)?;
        let reset_token = random_hex(24).map_err(ApiError::internal)?;
        let now = state.now_ms();
        create_verification(
            state.db(),
            &VerificationRow {
                id: ver_id,
                identifier: format!("reset-password:{reset_token}"),
                value: user.id,
                expires_at: now + PASSWORD_RESET_TTL_MS,
            },
            now,
        )
        .await?;
        let redirect_path = safe_relative_path(body.redirect_to.as_deref(), "/reset-password");
        let sep = if redirect_path.contains('?') {
            '&'
        } else {
            '?'
        };
        let reset_url = format!(
            "{}{redirect_path}{sep}token={reset_token}",
            state.auth_url().trim_end_matches('/')
        );
        if let Err(err) = send_reset_password_email(&state, &user.email, &reset_url).await {
            worker::console_error!("reset password email failed: {err:?}");
        }
    }
    Ok(no_store_json(StatusCode::OK, json!({ "status": true })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetPasswordBody {
    pub new_password: String,
    pub token: String,
}

#[worker::send]
pub async fn reset_password(
    State(state): State<AppState>,
    Json(body): Json<ResetPasswordBody>,
) -> Result<Response, ApiError> {
    validate_password_len(&body.new_password)?;
    let identifier = format!("reset-password:{}", body.token);
    let now = state.now_ms();
    let Some(ver) = find_valid_verification(state.db(), &identifier, now).await? else {
        return Err(ApiError::with_code(
            StatusCode::BAD_REQUEST,
            "INVALID_TOKEN",
            "Invalid or expired token",
        ));
    };
    let hash = hash_password(&body.new_password).map_err(ApiError::internal)?;
    let new_account_id = random_hex(16).map_err(ApiError::internal)?;
    reset_credential_password_and_revoke_sessions(
        state.db(),
        &ver.value,
        &new_account_id,
        &hash,
        &ver.id,
        now,
    )
    .await?;
    Ok(no_store_json(StatusCode::OK, json!({ "status": true })))
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct OAuthStatePayload {
    state: String,
    code_verifier: String,
    callback_url: String,
    error_callback_url: String,
    accepted_terms_version: Option<String>,
    share_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SocialAdditionalData {
    pub accepted_terms_version: Option<String>,
    pub share_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SocialSignInBody {
    pub provider: String,
    #[serde(rename = "callbackURL")]
    pub callback_url: Option<String>,
    #[serde(rename = "errorCallbackURL")]
    pub error_callback_url: Option<String>,
    pub additional_data: Option<SocialAdditionalData>,
}

#[worker::send]
pub async fn sign_in_social(
    State(state): State<AppState>,
    Json(body): Json<SocialSignInBody>,
) -> Result<Response, ApiError> {
    if body.provider != "google" {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "Unsupported OAuth provider",
        ));
    }
    let (Some(client_id), Some(_client_secret)) = (
        state.env_var("GOOGLE_CLIENT_ID"),
        state.env_var("GOOGLE_CLIENT_SECRET"),
    ) else {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "Google sign-in is not configured.",
        ));
    };
    let oauth_state = random_hex(16).map_err(ApiError::internal)?;
    let verifier_bytes = random_bytes(32).map_err(ApiError::internal)?;
    let code_verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);
    let challenge_digest = Sha256::digest(code_verifier.as_bytes());
    let code_challenge = URL_SAFE_NO_PAD.encode(challenge_digest);

    let payload = OAuthStatePayload {
        state: oauth_state.clone(),
        code_verifier,
        callback_url: safe_relative_path(body.callback_url.as_deref(), "/"),
        error_callback_url: safe_relative_path(body.error_callback_url.as_deref(), "/sign-in"),
        accepted_terms_version: body
            .additional_data
            .as_ref()
            .and_then(|d| d.accepted_terms_version.clone()),
        share_path: body
            .additional_data
            .as_ref()
            .and_then(|d| d.share_path.clone()),
    };
    let payload_json = serde_json::to_string(&payload).map_err(ApiError::internal)?;
    let secret = state.auth_secret()?;
    let state_cookie = build_oauth_state_cookie(&payload_json, &secret, state.is_secure_cookies());

    let redirect_uri = format!(
        "{}/api/auth/callback/google",
        state.auth_url().trim_end_matches('/')
    );
    let mut qs = form_urlencoded::Serializer::new(String::new());
    qs.append_pair("client_id", &client_id);
    qs.append_pair("redirect_uri", &redirect_uri);
    qs.append_pair("response_type", "code");
    qs.append_pair("scope", "openid email profile");
    qs.append_pair("state", &oauth_state);
    qs.append_pair("code_challenge", &code_challenge);
    qs.append_pair("code_challenge_method", "S256");
    qs.append_pair("access_type", "offline");
    qs.append_pair("prompt", "select_account");
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?{}",
        qs.finish()
    );

    let mut resp = no_store_json(StatusCode::OK, json!({ "url": auth_url, "redirect": true }));
    if let Ok(val) = HeaderValue::from_str(&state_cookie) {
        resp.headers_mut().append(header::SET_COOKIE, val);
    }
    Ok(resp)
}

#[derive(Deserialize)]
pub struct GoogleCallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

#[worker::send]
pub async fn google_callback(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<GoogleCallbackQuery>,
) -> Result<Response, ApiError> {
    let secret = state.auth_secret()?;
    let secure = state.is_secure_cookies();
    let clear_state = clear_oauth_state_cookie(secure);

    let Some(raw_payload) = read_signed_cookie(&headers, OAUTH_STATE_COOKIE, &secret) else {
        return Ok(redirect_response(
            "/sign-in?error=oauth_state_missing",
            &[clear_state],
        ));
    };
    let Ok(oauth_data) = serde_json::from_str::<OAuthStatePayload>(&raw_payload) else {
        return Ok(redirect_response(
            "/sign-in?error=oauth_state_invalid",
            &[clear_state],
        ));
    };
    if query.error.is_some() || query.state.as_deref() != Some(oauth_data.state.as_str()) {
        return Ok(redirect_response(
            &format!("{}?error=oauth_cancelled", oauth_data.error_callback_url),
            &[clear_state],
        ));
    }
    let Some(code) = query.code.as_deref() else {
        return Ok(redirect_response(
            &format!("{}?error=oauth_missing_code", oauth_data.error_callback_url),
            &[clear_state],
        ));
    };
    let (Some(client_id), Some(client_secret)) = (
        state.env_var("GOOGLE_CLIENT_ID"),
        state.env_var("GOOGLE_CLIENT_SECRET"),
    ) else {
        return Err(ApiError::internal("Google OAuth credentials missing"));
    };

    let redirect_uri = format!(
        "{}/api/auth/callback/google",
        state.auth_url().trim_end_matches('/')
    );
    let mut form = form_urlencoded::Serializer::new(String::new());
    form.append_pair("code", code);
    form.append_pair("client_id", &client_id);
    form.append_pair("client_secret", &client_secret);
    form.append_pair("redirect_uri", &redirect_uri);
    form.append_pair("code_verifier", &oauth_data.code_verifier);
    form.append_pair("grant_type", "authorization_code");

    let (token_status, token_text) =
        http_post_form("https://oauth2.googleapis.com/token", &form.finish()).await?;
    let token_json: Value = serde_json::from_str(&token_text).unwrap_or(Value::Null);
    let Some(access_token) = token_json.get("access_token").and_then(Value::as_str) else {
        worker::console_error!("Google token exchange failed ({token_status}): {token_text}");
        return Ok(redirect_response(
            &format!("{}?error=oauth_token_failed", oauth_data.error_callback_url),
            &[clear_state],
        ));
    };
    let id_token = token_json.get("id_token").and_then(Value::as_str);

    let (info_status, info_json) = http_get_bearer_json(
        "https://openidconnect.googleapis.com/v1/userinfo",
        access_token,
    )
    .await?;
    if !(200..300).contains(&info_status) {
        return Ok(redirect_response(
            &format!(
                "{}?error=oauth_userinfo_failed",
                oauth_data.error_callback_url
            ),
            &[clear_state],
        ));
    }

    let Some(sub) = info_json.get("sub").and_then(Value::as_str) else {
        return Ok(redirect_response(
            &format!("{}?error=oauth_missing_sub", oauth_data.error_callback_url),
            &[clear_state],
        ));
    };
    let email = info_json
        .get("email")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    let email_verified = info_json
        .get("email_verified")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if email.is_empty() || !email_verified {
        return Ok(redirect_response(
            &format!(
                "{}?error=oauth_email_unverified",
                oauth_data.error_callback_url
            ),
            &[clear_state],
        ));
    }
    let google_name = info_json
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("Climber");
    let picture = info_json.get("picture").and_then(Value::as_str);
    let now = state.now_ms();

    let user_id = if let Some(existing_user_id) =
        find_oauth_account_user_id(state.db(), "google", sub).await?
    {
        existing_user_id
    } else if let Some(existing_user) = find_user_by_email(state.db(), &email).await? {
        let acct_id = random_hex(16).map_err(ApiError::internal)?;
        link_oauth_account(
            state.db(),
            &betabook_db::auth::LinkOAuthAccount {
                oauth_record_id: &acct_id,
                provider_id: "google",
                provider_account_id: sub,
                user_id: &existing_user.id,
                access_token: Some(access_token),
                id_token,
                now_ms: now,
            },
        )
        .await?;
        existing_user.id
    } else {
        if oauth_data.accepted_terms_version.as_deref() != Some(TERMS_VERSION) {
            return Ok(redirect_response(
                &format!("{}?error=terms_required", oauth_data.error_callback_url),
                &[clear_state],
            ));
        }
        let new_user_id = random_hex(16).map_err(ApiError::internal)?;
        let acct_id = random_hex(16).map_err(ApiError::internal)?;
        let display_name = unique_display_name(state.db(), google_name).await?;
        let referred_by = resolve_referred_by(&state, oauth_data.share_path.as_deref()).await?;
        create_oauth_user_and_account(
            state.db(),
            &CreateOAuthUser {
                user_id: &new_user_id,
                oauth_record_id: &acct_id,
                provider_id: "google",
                provider_account_id: sub,
                name: &display_name,
                email: &email,
                image: picture,
                access_token: Some(access_token),
                id_token,
                terms_version: TERMS_VERSION,
                referred_by: referred_by.as_deref(),
                now_ms: now,
            },
        )
        .await?;
        welcome_new_account_once(&state, &new_user_id, &email, &display_name).await;
        new_user_id
    };

    let session_id = random_hex(16).map_err(ApiError::internal)?;
    let session_token = random_hex(24).map_err(ApiError::internal)?;
    let ip_address = headers
        .get("cf-connecting-ip")
        .and_then(|v| v.to_str().ok())
        .map(ToString::to_string);
    let user_agent = headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(ToString::to_string);
    create_session(
        state.db(),
        &SessionRecord {
            id: session_id,
            expires_at: now + SESSION_EXPIRES_MS,
            token: session_token.clone(),
            created_at: now,
            updated_at: now,
            ip_address,
            user_agent,
            user_id,
        },
    )
    .await?;

    let session_cookie = build_session_cookie_header(&session_token, &secret, secure);
    Ok(redirect_response(
        &oauth_data.callback_url,
        &[clear_state, session_cookie],
    ))
}

#[worker::send]
pub async fn delete_user(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let Some(auth_session) = resolve_optional_session(&state, &headers).await? else {
        return Err(ApiError::unauthorized());
    };
    let user_id = &auth_session.user.id;
    if let Ok(bucket) = state.env().bucket("PROFILE_PHOTOS") {
        let prefix = format!("{user_id}/");
        let mut cursor: Option<String> = None;
        loop {
            let mut list = bucket.list().prefix(&prefix);
            if let Some(c) = cursor.take() {
                list = list.cursor(c);
            }
            let page = list.execute().await?;
            let keys: Vec<String> = page.objects().into_iter().map(|obj| obj.key()).collect();
            if !keys.is_empty() {
                bucket.delete_multiple(keys).await?;
            }
            if !page.truncated() {
                break;
            }
            cursor = page.cursor();
        }
    }
    delete_account_and_cleanup(state.db(), user_id).await?;
    let mut resp = no_store_json(StatusCode::OK, json!({ "success": true }));
    if let Ok(val) = HeaderValue::from_str(&clear_session_cookie_header(state.is_secure_cookies()))
    {
        resp.headers_mut().append(header::SET_COOKIE, val);
    }
    Ok(resp)
}

#[worker::send]
pub async fn terms_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let session = resolve_optional_session(&state, &headers).await?;
    let acceptance = match &session {
        Some(s) => get_terms_acceptance(state.db(), &s.user.id).await?,
        None => None,
    };
    let required = session.is_some()
        && !acceptance.as_ref().is_some_and(|a| {
            has_accepted_current_terms(a.terms_version.as_deref(), a.terms_accepted_at)
        });
    Ok(no_store_json(
        StatusCode::OK,
        json!({
            "userId": session.as_ref().map(|s| s.user.id.as_str()),
            "required": required,
            "version": TERMS_VERSION,
            "versionLabel": TERMS_UPDATED_LABEL,
            "previousVersion": acceptance.and_then(|a| a.terms_version),
        }),
    ))
}

#[derive(Deserialize)]
pub struct AcceptTermsBody {
    pub version: Option<String>,
    pub agreed: Option<bool>,
}

#[worker::send]
pub async fn accept_terms(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<AcceptTermsBody>,
) -> Result<Response, ApiError> {
    let Some(session) = resolve_optional_session(&state, &headers).await? else {
        return Err(ApiError::unauthorized());
    };
    if body.agreed != Some(true) {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "Select the agreement checkbox to continue.",
        ));
    }
    if body.version.as_deref() != Some(TERMS_VERSION) {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "The terms have changed. Reload this page to review the current version.",
        ));
    }
    let acceptance = record_terms_acceptance(state.db(), &session.user.id, state.now_ms()).await?;
    if !acceptance.is_some_and(|a| {
        has_accepted_current_terms(a.terms_version.as_deref(), a.terms_accepted_at)
    }) {
        return Err(ApiError::unauthorized());
    }
    Ok(no_store_json(StatusCode::OK, json!({ "ok": true })))
}
