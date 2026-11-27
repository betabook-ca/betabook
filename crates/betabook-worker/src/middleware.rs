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
