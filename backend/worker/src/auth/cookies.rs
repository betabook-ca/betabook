use std::collections::HashMap;

use betabook_domain::password::{sign_cookie_value, verify_signed_cookie_value};
use http::{HeaderMap, HeaderValue, header};

pub const SESSION_EXPIRES_SECS: i64 = 60 * 60 * 24 * 30;
pub const SESSION_EXPIRES_MS: i64 = SESSION_EXPIRES_SECS * 1000;
pub const SESSION_UPDATE_AGE_MS: i64 = 60 * 60 * 24 * 1000;

const BASE_SESSION_COOKIE: &str = "better-auth.session_token";
const SECURE_SESSION_COOKIE: &str = "__Secure-better-auth.session_token";
pub const OAUTH_STATE_COOKIE: &str = "betabook_oauth_state";

pub fn session_cookie_name(secure: bool) -> &'static str {
    if secure {
        SECURE_SESSION_COOKIE
    } else {
        BASE_SESSION_COOKIE
    }
}

pub fn parse_cookies(headers: &HeaderMap) -> HashMap<String, String> {
    let mut cookies = HashMap::new();
    for header_val in headers.get_all(header::COOKIE) {
        let Ok(raw) = header_val.to_str() else {
            continue;
        };
        for pair in raw.split(';') {
            let Some((k, v)) = pair.split_once('=') else {
                continue;
            };
            let key = k.trim();
            if key.is_empty() || cookies.contains_key(key) {
                continue;
            }
            let mut val = v.trim();
            if val.len() >= 2 && val.starts_with('"') && val.ends_with('"') {
                val = &val[1..val.len() - 1];
            }
            cookies.insert(key.to_string(), val.to_string());
        }
    }
    cookies
}

/// Presence only selects a non-personalized entry shell; never authorizes a read.
pub fn has_session_cookie(headers: &HeaderMap, secure: bool) -> bool {
    let expected = session_cookie_name(secure);
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .any(|line| {
            line.split(';')
                .filter_map(|p| p.trim().split_once('='))
                .any(|(name, _)| name == expected)
        })
}

pub fn read_session_token(headers: &HeaderMap, secret: &str, secure: bool) -> Option<String> {
    read_signed_cookie(headers, session_cookie_name(secure), secret)
}

pub fn build_session_cookie_header(token: &str, secret: &str, secure: bool) -> String {
    let name = session_cookie_name(secure);
    let signed = sign_cookie_value(token, secret);
    let secure_attr = if secure { "; Secure" } else { "" };
    format!(
        "{name}={signed}; Max-Age={SESSION_EXPIRES_SECS}; Path=/; HttpOnly{secure_attr}; SameSite=Lax"
    )
}

/// Expire both historical names at the path used for issuance. Browsers only
/// accept changes to a __Secure- cookie if its Set-Cookie also says Secure.
pub fn clear_session_cookies(headers: &mut HeaderMap) {
    headers.append(
        header::SET_COOKIE,
        HeaderValue::from_static(
            "better-auth.session_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
        ),
    );
    headers.append(header::SET_COOKIE, HeaderValue::from_static(
        "__Secure-better-auth.session_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
    ));
}

pub fn build_oauth_state_cookie(payload: &str, secret: &str, secure: bool) -> String {
    let signed = sign_cookie_value(payload, secret);
    let secure_attr = if secure { "; Secure" } else { "" };
    format!(
        "{OAUTH_STATE_COOKIE}={signed}; Max-Age=600; Path=/api/auth; HttpOnly{secure_attr}; SameSite=Lax"
    )
}

pub fn clear_oauth_state_cookie(secure: bool) -> String {
    let secure_attr = if secure { "; Secure" } else { "" };
    format!("{OAUTH_STATE_COOKIE}=; Max-Age=0; Path=/api/auth; HttpOnly{secure_attr}; SameSite=Lax")
}

pub fn read_signed_cookie(headers: &HeaderMap, name: &str, secret: &str) -> Option<String> {
    let cookies = parse_cookies(headers);
    let raw = cookies.get(name)?;
    verify_signed_cookie_value(raw, secret)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_cookie_uses_only_its_configured_name() -> Result<(), http::header::InvalidHeaderValue>
    {
        let secret = "local test secret";
        for secure in [false, true] {
            let mut headers = HeaderMap::new();
            let other = format!(
                "{}={}",
                session_cookie_name(!secure),
                sign_cookie_value("old", secret)
            );
            headers.append(header::COOKIE, HeaderValue::from_str(&other)?);
            assert!(!has_session_cookie(&headers, secure));
            assert_eq!(read_session_token(&headers, secret, secure), None);

            let issued = build_session_cookie_header("current", secret, secure);
            assert_eq!(
                issued
                    .split(';')
                    .any(|attribute| attribute.trim() == "Secure"),
                secure
            );
            headers.append(
                header::COOKIE,
                HeaderValue::from_str(issued.split(';').next().unwrap_or(""))?,
            );
            assert!(has_session_cookie(&headers, secure));
            assert_eq!(
                read_session_token(&headers, secret, secure).as_deref(),
                Some("current")
            );
        }
        Ok(())
    }
}
