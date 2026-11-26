use betabook_db::auth::{
    AuthSession, get_session_by_token, get_terms_acceptance, touch_session_expiry,
};
use betabook_domain::terms::{TERMS_ACCESS_MESSAGE, has_accepted_current_terms};
use http::{HeaderMap, StatusCode};

use crate::auth::cookies::{SESSION_EXPIRES_MS, SESSION_UPDATE_AGE_MS, read_session_token};
use crate::state::{ApiError, AppState};

pub async fn resolve_optional_session(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<Option<AuthSession>, ApiError> {
    let secret = state.auth_secret()?;
    let Some(token) = read_session_token(headers, &secret, state.is_secure_cookies()) else {
        return Ok(None);
    };
    let Some(mut auth_session) = get_session_by_token(state.db(), &token).await? else {
        return Ok(None);
    };
    let now = state.now_ms();
    if auth_session.session.expires_at <= now {
        return Ok(None);
    }
    if auth_session.session.expires_at - now < SESSION_EXPIRES_MS - SESSION_UPDATE_AGE_MS {
        let next_expires = now + SESSION_EXPIRES_MS;
        touch_session_expiry(state.db(), &auth_session.session.id, next_expires, now).await?;
        state.renew_cookie(super::cookies::build_session_cookie_header(
            &token,
            &secret,
            state.is_secure_cookies(),
        ));
        auth_session.session.expires_at = next_expires;
        auth_session.session.updated_at = now;
    }
    Ok(Some(auth_session))
}

pub async fn require_member_session(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<AuthSession, ApiError> {
    let Some(auth_session) = resolve_optional_session(state, headers).await? else {
        return Err(ApiError::unauthorized());
    };
    let Some(acceptance) = get_terms_acceptance(state.db(), &auth_session.user.id).await? else {
        return Err(ApiError::unauthorized());
    };
    if !has_accepted_current_terms(
        acceptance.terms_version.as_deref(),
        acceptance.terms_accepted_at,
    ) {
        return Err(ApiError::with_code(
            StatusCode::PRECONDITION_REQUIRED,
            "TERMS_ACCEPTANCE_REQUIRED",
            TERMS_ACCESS_MESSAGE,
        )
        .no_store());
    }
    Ok(auth_session)
}

pub async fn require_admin_session(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<AuthSession, ApiError> {
    let session = require_member_session(state, headers).await?;
    if session.user.role.as_deref() != Some("admin") {
        return Err(ApiError::new(StatusCode::FORBIDDEN, "Admin access required").no_store());
    }
    Ok(session)
}
