//! Cloudflare structured events. Redact before truncating so a cut cannot leave
//! the beginning of a credential in an error, digest field or path.
use std::sync::LazyLock;

use percent_encoding::percent_decode_str;
use regex_lite::{Captures, Regex};
use serde_json::{Value, json};

#[derive(Clone, Debug)]
pub struct ErrorDetail(String);

#[expect(clippy::expect_used, reason = "compile-time constant pattern")]
static EMAIL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"[^\s@"'<>(),;:]+@[^\s@"'<>(),;:]+\.[A-Za-z]{2,}"#).expect("static email regex")
});
#[expect(clippy::expect_used, reason = "compile-time constant pattern")]
static RUN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[A-Za-z0-9_-]{16,}").expect("static token regex"));
#[expect(clippy::expect_used, reason = "compile-time constant pattern")]
static QUOTED_JSON: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?s)(?:\.\.\.)?".*"(?:\.\.\.)? is not valid JSON"#).expect("static JSON regex")
});
#[expect(clippy::expect_used, reason = "compile-time constant pattern")]
static DIGEST: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(?:[0-9]{1,10}|[A-Z][A-Z_]{0,47}(?:;[0-9]{3})?)$").expect("static digest regex")
});

fn credential(run: &str) -> bool {
    (matches!(run.len(), 32 | 64) && run.bytes().all(|b| b.is_ascii_hexdigit()))
        || run.bytes().any(|b| b.is_ascii_digit())
        || (run.bytes().filter(u8::is_ascii_uppercase).count() >= 4
            && run.bytes().filter(u8::is_ascii_lowercase).count() >= 4)
}

fn clean_path(raw: &str) -> String {
    let path = raw.split(['?', '#']).next().unwrap_or("");
    path.split('/')
        .map(|segment| {
            let decoded = percent_decode_str(segment).decode_utf8_lossy();
            if EMAIL.is_match(&decoded) {
                "[email]"
            } else if RUN.find_iter(&decoded).any(|m| credential(m.as_str())) {
                "[token]"
            } else {
                segment
            }
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn clean_text(raw: &str) -> String {
    let message = match raw.split_once("\nparams:") {
        Some((sql, _)) => format!("{sql}\nparams: [redacted]"),
        None => raw.to_owned(),
    };
    let message = QUOTED_JSON.replace_all(&message, r#""[redacted]" is not valid JSON"#);
    let message = EMAIL.replace_all(&message, "[email]");
    let message = RUN.replace_all(&message, |c: &Captures<'_>| {
        if credential(&c[0]) {
            "[token]".to_owned()
        } else {
            c[0].to_owned()
        }
    });
    let mut chars = message.chars();
    let mut result = chars.by_ref().take(1000).collect::<String>();
    if chars.next().is_some() {
        result.push('…');
    }
    result
}

impl ErrorDetail {
    pub fn new(raw: impl std::fmt::Display) -> Self {
        Self(clean_text(&raw.to_string()))
    }
}

pub fn emit(value: Value) {
    // Pass an object to console.error so Workers Observability indexes event fields.
    if let Ok(record) = worker::js_sys::JSON::parse(&value.to_string()) {
        worker::web_sys::console::error_1(&record);
    }
}

pub fn request_error(method: &str, path: &str, detail: Option<&ErrorDetail>) {
    let message = detail
        .map(|e| e.0.as_str())
        .unwrap_or("Internal server error");
    let digest = message
        .encode_utf16()
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .fold(5381u32, |h, c| h.wrapping_mul(33) ^ u32::from(c));
    let route_type = if path.starts_with("/api/actions/") {
        "action"
    } else if path.starts_with("/api/") {
        "route"
    } else {
        "render"
    };
    emit(
        json!({"event":"request_error","digest":digest.to_string(),"method":method,"path":clean_path(path),"routeType":route_type,
        "error":{"name":"WorkerError","message":message,"causes":[]}}),
    );
}

pub fn background_error(operation: &str, detail: impl std::fmt::Display) {
    emit(
        json!({"event":"request_error","routeType":"background","operation":operation,"error":{"name":"WorkerError","message":clean_text(&detail.to_string()),"causes":[]}}),
    );
}

pub fn client_report(body: &Value) -> Option<Value> {
    let path = body["path"].as_str()?;
    let message = body["message"].as_str()?;
    let boundary = body["boundary"].as_str()?;
    if !matches!(boundary, "page" | "global")
        || !path.starts_with('/')
        || path.encode_utf16().count() > 512
    {
        return None;
    }
    let mut value = json!({"event":"client_error","boundary":boundary,"path":clean_path(path),"message":clean_text(message)});
    if let Some(digest) = body.get("digest") {
        let text = digest.as_str()?;
        if DIGEST.is_match(text) {
            value["digest"] = Value::String(text.to_owned());
        }
    }
    Some(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn redacts_before_logging_report() {
        let report=client_report(&json!({"boundary":"page","path":"/users/owner%40example.test/0123456789abcdef0123456789abcdef?token=secret",
            "message":"query failed for owner@example.test\nparams: private note","digest":"NEXT_HTTP_ERROR_FALLBACK;404"})).expect("report");
        assert_eq!(report["path"], "/users/[email]/[token]");
        assert_eq!(
            report["message"],
            "query failed for [email]\nparams: [redacted]"
        );
        assert_eq!(report["digest"], "NEXT_HTTP_ERROR_FALLBACK;404");
        assert!(
            client_report(&json!({"boundary":"global","path":"/","message":"","digest":0}))
                .is_none()
        );
    }
}
