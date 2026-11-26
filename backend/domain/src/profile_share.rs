use url::form_urlencoded;

pub fn parse_share_token(value: &str) -> Option<&str> {
    if value.len() == 32
        && value
            .bytes()
            .all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
    {
        Some(value)
    } else {
        None
    }
}

/// A profile preview is unlocked by exactly one well-formed share parameter.
pub fn profile_token_from_query(query: &str) -> Option<String> {
    let mut values = form_urlencoded::parse(query.as_bytes()).filter(|(k, _)| k == "share");
    let (_, value) = values.next()?;
    if values.next().is_some() {
        return None;
    }
    parse_share_token(&value).map(str::to_owned)
}

pub fn share_expiry_modifier(raw: &str) -> Result<Option<&'static str>, &'static str> {
    match raw {
        "7d" => Ok(Some("+7 days")),
        "30d" => Ok(Some("+30 days")),
        "6mo" => Ok(Some("+6 months")),
        "never" => Ok(None),
        _ => Err("Invalid link expiry"),
    }
}

pub fn profile_share_from_path(path: Option<&str>) -> Option<(String, String)> {
    let raw = path?;
    let without_hash = raw.split('#').next().unwrap_or("");
    let (pathname, query) = without_hash.split_once('?').unwrap_or((without_hash, ""));
    let user_id = pathname.strip_prefix("/users/")?;
    if user_id.is_empty() || user_id.contains('/') {
        return None;
    }
    let token = form_urlencoded::parse(query.as_bytes())
        .find(|(k, _)| k == "share")
        .and_then(|(_, v)| parse_share_token(&v).map(ToString::to_string))?;
    Some((user_id.to_string(), token))
}

pub fn friendship_pair<'a>(a: &'a str, b: &'a str) -> (&'a str, &'a str) {
    if a < b { (a, b) } else { (b, a) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_profile_share_path() {
        let token = "0123456789abcdef0123456789abcdef";
        assert_eq!(
            profile_share_from_path(Some(&format!("/users/u1?share={token}#top"))),
            Some(("u1".to_string(), token.to_string()))
        );
        assert_eq!(
            profile_share_from_path(Some("/users/u1/trips?share=abc")),
            None
        );
        assert_eq!(
            profile_share_from_path(Some("/users/u1?share=invalid")),
            None
        );
    }
}
