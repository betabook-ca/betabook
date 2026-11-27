pub const PROFILE_PHOTO_PIXELS: u32 = 256;
pub const PROFILE_PHOTO_QUALITY: u8 = 80;
pub const PROFILE_PHOTO_CONTENT_TYPE: &str = "image/webp";
pub const PROFILE_PHOTO_CACHE_CONTROL: &str = "public, max-age=604800, immutable";
pub const PROFILE_PHOTO_CACHE_NAME: &str = "profile-photos";

pub const MAX_PROFILE_PHOTO_BYTES: usize = 3 * 1024 * 1024;
pub const MAX_SOURCE_PHOTO_BYTES: usize = 16 * 1024 * 1024;
pub const ACCEPTED_PROFILE_PHOTO_TYPES: [&str; 3] = ["image/jpeg", "image/png", "image/webp"];

const PROFILE_PHOTO_PATH_PREFIX: &str = "/api/avatars/";

pub fn is_profile_photo_key(key: &str) -> bool {
    let Some((user_id, file)) = key.split_once('/') else {
        return false;
    };
    if user_id.is_empty() || user_id.len() > 64 {
        return false;
    }
    if !user_id
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return false;
    }
    let Some(digest) = file.strip_suffix(".webp") else {
        return false;
    };
    digest.len() == 32
        && digest
            .bytes()
            .all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

pub fn profile_photo_etag(key: &str) -> String {
    let start = key.find('/').map(|idx| idx + 1).unwrap_or(0);
    let digest = key[start..].strip_suffix(".webp").unwrap_or(&key[start..]);
    format!("\"{digest}\"")
}

pub fn profile_photo_unchanged(if_none_match: Option<&str>, key: &str) -> bool {
    let Some(header) = if_none_match else {
        return false;
    };
    let etag = profile_photo_etag(key);
    let weak_etag = format!("W/{etag}");
    header.split(',').any(|part| {
        let candidate = part.trim();
        candidate == "*" || candidate == etag || candidate == weak_etag
    })
}

pub fn profile_photo_path(key: &str) -> String {
    format!("{PROFILE_PHOTO_PATH_PREFIX}{key}")
}

pub fn profile_photo_key_from_image(image: Option<&str>) -> Option<&str> {
    let image = image?;
    let key = image.strip_prefix(PROFILE_PHOTO_PATH_PREFIX)?;
    is_profile_photo_key(key).then_some(key)
}

pub fn profile_photo_key_owned_by<'a>(image: Option<&'a str>, owner_id: &str) -> Option<&'a str> {
    let key = profile_photo_key_from_image(image)?;
    let prefix = format!("{owner_id}/");
    key.starts_with(&prefix).then_some(key)
}

pub fn profile_photo_key(user_id: &str, version_bytes: &[u8]) -> String {
    let prefix = &version_bytes[..version_bytes.len().min(16)];
    let encoded = hex::encode(prefix);
    format!("{user_id}/{encoded}.webp")
}

pub fn sniff_image_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some("image/jpeg");
    }
    if bytes.starts_with(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) {
        return Some("image/png");
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_keys_and_etags() {
        let digest = [0xab_u8; 32];
        let key = profile_photo_key("climber1", &digest);
        assert_eq!(key, "climber1/abababababababababababababababab.webp");
        assert!(is_profile_photo_key(&key));

        let path = profile_photo_path(&key);
        assert_eq!(
            path,
            "/api/avatars/climber1/abababababababababababababababab.webp"
        );
        assert_eq!(
            profile_photo_key_from_image(Some(&path)),
            Some(key.as_str())
        );
        assert_eq!(
            profile_photo_key_owned_by(Some(&path), "climber1"),
            Some(key.as_str())
        );
        assert_eq!(profile_photo_key_owned_by(Some(&path), "climber2"), None);

        let rejected = [
            "../catalog/latest.json",
            "climber1/../../secret.webp",
            "climber1/abababababababababababababababab.json",
            "climber1/abab.webp",
            "climber1/ABABABABABABABABABABABABABABABAB.webp",
            "climber1/abababababababababababababababab.webp/extra",
            "abababababababababababababababab.webp",
        ];
        for bad in rejected {
            assert!(!is_profile_photo_key(bad), "expected rejection for {bad}");
        }

        let etag_key = "climber1/0123456789abcdef0123456789abcdef.webp";
        let etag = profile_photo_etag(etag_key);
        assert_eq!(etag, "\"0123456789abcdef0123456789abcdef\"");
        assert!(profile_photo_unchanged(Some(&etag), etag_key));
        assert!(profile_photo_unchanged(
            Some(&format!("W/{etag}")),
            etag_key
        ));
        assert!(profile_photo_unchanged(
            Some(&format!("\"stale\", {etag}")),
            etag_key
        ));
        assert!(profile_photo_unchanged(Some("*"), etag_key));
        assert!(!profile_photo_unchanged(
            Some("0123456789abcdef0123456789abcdef"),
            etag_key
        ));
        assert!(!profile_photo_unchanged(None, etag_key));
    }

    #[test]
    fn sniffs_supported_image_types() {
        assert_eq!(
            sniff_image_type(&[0xff, 0xd8, 0xff, 0xe0]),
            Some("image/jpeg")
        );
        assert_eq!(
            sniff_image_type(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            Some("image/png")
        );
        let mut webp = [0_u8; 16];
        webp[0..4].copy_from_slice(b"RIFF");
        webp[8..12].copy_from_slice(b"WEBP");
        assert_eq!(sniff_image_type(&webp), Some("image/webp"));
        assert_eq!(sniff_image_type(b"<svg xmlns="), None);
        assert_eq!(sniff_image_type(&[]), None);
    }
}
