use std::collections::HashMap;

use betabook_domain::password::{sign_cookie_value, verify_signed_cookie_value};
use http::{HeaderMap, header};

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

pub fn read_session_token(headers: &HeaderMap, secret: &str, secure: bool) -> Option<String> {
    let cookies = parse_cookies(headers);
    let preferred = session_cookie_name(secure);
    let raw = cookies
        .get(preferred)
        .or_else(|| cookies.get(BASE_SESSION_COOKIE))
        .or_else(|| cookies.get(SECURE_SESSION_COOKIE))?;
    verify_signed_cookie_value(raw, secret)
}

pub fn build_session_cookie_header(token: &str, secret: &str, secure: bool) -> String {
    let name = session_cookie_name(secure);
    let signed = sign_cookie_value(token, secret);
    let secure_attr = if secure { "; Secure" } else { "" };
    format!(
        "{name}={signed}; Max-Age={SESSION_EXPIRES_SECS}; Path=/; HttpOnly{secure_attr}; SameSite=Lax"
    )
}

pub fn clear_session_cookie_header(secure: bool) -> String {
    let name = session_cookie_name(secure);
    let secure_attr = if secure { "; Secure" } else { "" };
    format!("{name}=; Max-Age=0; Path=/; HttpOnly{secure_attr}; SameSite=Lax")
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
