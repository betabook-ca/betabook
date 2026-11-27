use axum::body::Body;
use betabook_domain::security_headers::SECURITY_HEADERS;
use http::{HeaderName, HeaderValue, Response};

/// Strip the trailing slash before matching routes. A relative Location must
/// start with exactly one slash so even malformed paths stay on this origin.
pub fn trailing_slash_redirect(uri: &http::Uri) -> Option<Response<Body>> {
    use axum::response::IntoResponse;

    let path = uri.path();
    if path == "/" || !path.ends_with('/') {
        return None;
    }
    let path = path.trim_end_matches('/').trim_start_matches(['/', '\\']);
    let mut location = format!("/{path}");
    if let Some(query) = uri.query() {
        location.push('?');
        location.push_str(query);
    }
    Some(
        (
            http::StatusCode::PERMANENT_REDIRECT,
            [(http::header::LOCATION, location)],
        )
            .into_response(),
    )
}

pub fn apply_security_headers(path: &str, mut response: Response<Body>) -> Response<Body> {
    let headers = response.headers_mut();
    for (key, value) in SECURITY_HEADERS {
        if let Ok(name) = HeaderName::from_bytes(key.as_bytes())
            && !headers.contains_key(&name)
        {
            headers.insert(name, HeaderValue::from_static(value));
        }
    }
    if path.starts_with("/api/") && !headers.contains_key("x-robots-tag") {
        headers.insert("x-robots-tag", HeaderValue::from_static("noindex"));
    }
    response
}

/// Browsers supply Origin on cross-origin writes and Fetch Metadata on modern clients.
/// Same-origin clients and server-to-server calls can omit both headers.
pub fn trusted_write(headers: &http::HeaderMap, origin: &str) -> bool {
    if headers
        .get("sec-fetch-site")
        .is_some_and(|v| v == "cross-site")
    {
        return false;
    }
    headers
        .get(http::header::ORIGIN)
        .is_none_or(|value| value.to_str().is_ok_and(|v| v == origin))
}

pub fn local_auth_base(base: &str) -> bool {
    url::Url::parse(base)
        .ok()
        .is_some_and(|u| matches!(u.host_str(), Some("localhost" | "127.0.0.1" | "[::1]")))
}

/// Credentialed auth requests must carry a trusted Origin or Referer. First-login
/// requests from a non-browser client may omit both, as Better Auth permits.
pub fn trusted_auth_write(headers: &http::HeaderMap, request_origin: &str, base: &str) -> bool {
    if headers
        .get("sec-fetch-site")
        .is_some_and(|s| s == "cross-site")
        && headers
            .get("sec-fetch-mode")
            .is_some_and(|s| s == "navigate")
    {
        return false;
    }
    let candidate = headers
        .get(http::header::ORIGIN)
        .or_else(|| headers.get(http::header::REFERER));
    let Some(raw) = candidate.and_then(|v| v.to_str().ok()) else {
        return !headers.contains_key(http::header::COOKIE)
            && !headers.contains_key("sec-fetch-site")
            && !headers.contains_key("sec-fetch-mode")
            && !headers.contains_key("sec-fetch-dest");
    };
    let raw = if raw == "null"
        && headers
            .get("sec-fetch-site")
            .is_some_and(|s| s == "same-origin")
    {
        request_origin
    } else {
        raw
    };
    let Ok(url) = url::Url::parse(raw) else {
        return false;
    };
    let origin = url.origin().ascii_serialization();
    origin
        == url::Url::parse(base)
            .map(|u| u.origin().ascii_serialization())
            .unwrap_or_default()
        || (local_auth_base(base)
            && (origin == request_origin
                || matches!(
                    origin.as_str(),
                    "http://localhost:3000"
                        | "http://localhost:3001"
                        | "http://localhost:3002"
                        | "http://localhost:3003"
                )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slash_redirects_remain_local_and_preserve_encoded_queries() {
        for (path, expected) in [
            (
                "/search/?q=a%20b&tag=1&tag=2",
                "/search?q=a%20b&tag=1&tag=2",
            ),
            ("//example.test/path/", "/example.test/path"),
            ("////", "/"),
        ] {
            let uri: http::Uri = path.parse().unwrap();
            let response = trailing_slash_redirect(&uri).unwrap();
            assert_eq!(response.status(), http::StatusCode::PERMANENT_REDIRECT);
            assert_eq!(response.headers()[http::header::LOCATION], expected);
        }
        assert!(trailing_slash_redirect(&http::Uri::from_static("/")).is_none());
        assert!(trailing_slash_redirect(&http::Uri::from_static("/about")).is_none());
    }
}
