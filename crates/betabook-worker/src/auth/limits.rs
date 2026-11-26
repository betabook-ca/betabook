//! Better Auth's production, per-isolate rolling windows. Only the address supplied
//! by the Cloudflare edge is used; unknown clients share a bucket for each route.
use axum::{
    Json,
    http::{HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use serde_json::json;
use std::{cell::RefCell, collections::HashMap, net::IpAddr};

#[derive(Default)]
struct Limits {
    buckets: HashMap<(String, String), (u16, i64)>,
    last_cleanup: i64,
}

impl Limits {
    fn consume(&mut self, address: &str, path: &str, now: i64) -> Option<i64> {
        let path = if path.starts_with("/reset-password/") {
            "/reset-password/:token"
        } else {
            path
        };
        let (max, window) = match path {
            "/sign-in/email" | "/sign-in/social" | "/sign-up/email" => (3, 10_000),
            "/request-password-reset" | "/send-verification-email" => (3, 60_000),
            "/get-session"
            | "/sign-out"
            | "/reset-password"
            | "/reset-password/:token"
            | "/verify-email"
            | "/callback/google"
            | "/delete-user" => (100, 10_000),
            _ => return None,
        };
        if now - self.last_cleanup >= 60_000 {
            self.buckets.retain(|_, (_, last)| now - *last < 60_000);
            self.last_cleanup = now;
        }
        let (count, last) = self
            .buckets
            .entry((address.to_owned(), path.to_owned()))
            .or_insert((0, now));
        if now - *last >= window {
            *count = 0;
        }
        if *count >= max {
            return Some((window - (now - *last) + 999) / 1000);
        }
        *count += 1;
        *last = now;
        None
    }
}

thread_local! {static LIMITS:RefCell<Limits>=RefCell::new(Limits::default());}

pub fn check(headers: &HeaderMap, path: &str, now: i64) -> Option<Response> {
    let ip = headers
        .get("cf-connecting-ip")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<IpAddr>().ok());
    let address = match ip {
        Some(IpAddr::V6(ip)) => {
            std::net::Ipv6Addr::from(u128::from(ip) & (u128::MAX << 64)).to_string()
        }
        Some(ip) => ip.to_string(),
        None => "unknown".into(),
    };
    let retry = LIMITS.with_borrow_mut(|limits| limits.consume(&address, path, now))?;
    let mut response = (
        StatusCode::TOO_MANY_REQUESTS,
        Json(json!({"message":"Too many requests. Please try again later."})),
    )
        .into_response();
    if let Ok(value) = HeaderValue::from_str(&retry.to_string()) {
        response
            .headers_mut()
            .insert("x-retry-after", value.clone());
        response.headers_mut().insert("retry-after", value);
    }
    Some(response)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sign_in_and_recovery_windows_slide_independently() {
        let mut limits = Limits::default();
        for t in [1, 100, 500] {
            assert!(limits.consume("addr", "/sign-in/email", t).is_none());
            assert!(
                limits
                    .consume("addr", "/request-password-reset", t)
                    .is_none()
            );
        }
        assert_eq!(limits.consume("addr", "/sign-in/email", 1000), Some(10));
        assert!(limits.consume("addr", "/sign-in/email", 10_500).is_none());
        assert_eq!(
            limits.consume("addr", "/request-password-reset", 10_500),
            Some(50)
        );
        assert!(
            limits
                .consume("other", "/request-password-reset", 10_500)
                .is_none()
        );
    }
}
