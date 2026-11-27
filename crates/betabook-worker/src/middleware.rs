use axum::body::Body;
use betabook_domain::security_headers::SECURITY_HEADERS;
use http::{HeaderName, HeaderValue, Response};

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
