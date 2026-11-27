use base64::{Engine as _, engine::general_purpose::STANDARD};
use hmac::{Hmac, KeyInit, Mac};
use scrypt::{Params as ScryptParams, scrypt};
use sha2::Sha256;
use subtle::ConstantTimeEq;
use thiserror::Error;
use unicode_normalization::UnicodeNormalization;

type HmacSha256 = Hmac<Sha256>;

const SCRYPT_LOG_N: u8 = 14; // 16384
const SCRYPT_R: u32 = 16;
const SCRYPT_P: u32 = 1;
const SCRYPT_DK_LEN: usize = 64;

#[derive(Debug, Error)]
pub enum PasswordError {
    #[error("failed to generate random bytes")]
    RandomGeneration,
    #[error("invalid scrypt parameters")]
    InvalidParams,
}

pub fn random_bytes(len: usize) -> Result<Vec<u8>, PasswordError> {
    let mut buf = vec![0_u8; len];
    getrandom::fill(&mut buf).map_err(|_| PasswordError::RandomGeneration)?;
    Ok(buf)
}

pub fn random_hex(byte_len: usize) -> Result<String, PasswordError> {
    Ok(hex::encode(random_bytes(byte_len)?))
}

fn scrypt_derive(password: &str, salt_hex: &str) -> Result<[u8; SCRYPT_DK_LEN], PasswordError> {
    let normalized: String = password.nfkc().collect();
    let params = ScryptParams::new(SCRYPT_LOG_N, SCRYPT_R, SCRYPT_P)
        .map_err(|_| PasswordError::InvalidParams)?;
    let mut output = [0_u8; SCRYPT_DK_LEN];
    scrypt(
        normalized.as_bytes(),
        salt_hex.as_bytes(),
        &params,
        &mut output,
    )
    .map_err(|_| PasswordError::InvalidParams)?;
    Ok(output)
}

/// Generates a Better Auth-compatible `{salt_hex}:{key_hex}` scrypt password hash.
pub fn hash_password(password: &str) -> Result<String, PasswordError> {
    let salt_hex = random_hex(16)?;
    let key = scrypt_derive(password, &salt_hex)?;
    Ok(format!("{salt_hex}:{}", hex::encode(key)))
}

/// Verifies a password against a Better Auth-compatible `{salt_hex}:{key_hex}` hash.
pub fn verify_password(stored_hash: &str, password: &str) -> bool {
    let Some((salt_hex, expected_hex)) = stored_hash.split_once(':') else {
        return false;
    };
    if salt_hex.is_empty() || expected_hex.is_empty() {
        return false;
    }
    let Ok(expected_bytes) = hex::decode(expected_hex) else {
        return false;
    };
    if expected_bytes.len() != SCRYPT_DK_LEN {
        return false;
    }
    let Ok(actual) = scrypt_derive(password, salt_hex) else {
        return false;
    };
    actual.ct_eq(expected_bytes.as_slice()).into()
}

#[expect(clippy::expect_used, reason = "HMAC-SHA256 accepts any key length")]
fn signature_mac(secret: &str) -> HmacSha256 {
    HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepts keys of any length")
}

pub fn make_signature(value: &str, secret: &str) -> String {
    let mut mac = signature_mac(secret);
    mac.update(value.as_bytes());
    STANDARD.encode(mac.finalize().into_bytes())
}

/// Better Auth verification emails issued before cutover carry expiring HS256
/// tokens. Only accept the account-verification payload bound to its user/email.
pub fn legacy_email_verification(
    token: &str,
    secret: &str,
    now_ms: i64,
) -> Option<(String, String)> {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    let (signed, signature) = token.rsplit_once('.')?;
    let (header, payload) = signed.split_once('.')?;
    let mut mac = signature_mac(secret);
    mac.update(signed.as_bytes());
    mac.verify_slice(&URL_SAFE_NO_PAD.decode(signature).ok()?)
        .ok()?;
    let header: serde_json::Value =
        serde_json::from_slice(&URL_SAFE_NO_PAD.decode(header).ok()?).ok()?;
    let payload: serde_json::Value =
        serde_json::from_slice(&URL_SAFE_NO_PAD.decode(payload).ok()?).ok()?;
    if header["alg"] != "HS256"
        || payload["exp"].as_i64()? <= now_ms / 1000
        || !payload["updateTo"].is_null()
        || !payload["requestType"].is_null()
    {
        return None;
    }
    Some((
        payload["userId"].as_str()?.to_owned(),
        payload["email"].as_str()?.to_owned(),
    ))
}

pub fn sign_value(value: &str, secret: &str) -> String {
    format!("{value}.{}", make_signature(value, secret))
}

fn encode_uri_component(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.as_bytes() {
        if matches!(
            byte,
            b'A'..=b'Z'
                | b'a'..=b'z'
                | b'0'..=b'9'
                | b'-'
                | b'_'
                | b'.'
                | b'!'
                | b'~'
                | b'*'
                | b'\''
                | b'('
                | b')'
        ) {
            out.push(*byte as char);
        } else {
            out.push('%');
            let hex = format!("{byte:02X}");
            out.push_str(&hex);
        }
    }
    out
}

fn decode_uri_component(input: &str) -> Option<String> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 2 >= bytes.len() {
                return None;
            }
            let hi = (bytes[i + 1] as char).to_digit(16)?;
            let lo = (bytes[i + 2] as char).to_digit(16)?;
            out.push(((hi << 4) | lo) as u8);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

pub fn sign_cookie_value(value: &str, secret: &str) -> String {
    encode_uri_component(&sign_value(value, secret))
}

pub fn verify_signed_cookie_value(raw_cookie_value: &str, secret: &str) -> Option<String> {
    let decoded =
        decode_uri_component(raw_cookie_value).unwrap_or_else(|| raw_cookie_value.to_string());
    let dot = decoded.rfind('.')?;
    if dot == 0 {
        return None;
    }
    let value = &decoded[..dot];
    let signature_b64 = &decoded[dot + 1..];
    if signature_b64.len() != 44 || !signature_b64.ends_with('=') {
        return None;
    }
    let provided = STANDARD.decode(signature_b64).ok()?;
    let mut mac = signature_mac(secret);
    mac.update(value.as_bytes());
    let expected = mac.finalize().into_bytes();
    if bool::from(expected.as_slice().ct_eq(provided.as_slice())) {
        Some(value.to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifies_live_better_auth_scrypt_vector() {
        let better_auth_hash = "c8ab186de2b8ba2dbb43343ea18c295c:3bc0596d2cbfc0f9db9e61044dc2d844b14da803c9b99c718d5a596cc7c58e7d05962b3b10089ebc0f9c75fb7b098107c4603e2eae1609ed78e36ef9a091ca5e";
        assert!(verify_password(better_auth_hash, "password"));
        assert!(!verify_password(better_auth_hash, "wrong-password"));

        let generated = hash_password("hunter2!").expect("hash generation");
        assert!(verify_password(&generated, "hunter2!"));
        assert!(!verify_password(&generated, "hunter2?"));
    }

    #[test]
    fn matches_live_better_auth_cookie_signature() {
        let sig = make_signature("tok123", "secret123");
        assert_eq!(sig, "R3m5UItzIL0xhz3A6OokgJJFzLgiluadQpnR1IYDlNM=");

        let encoded = sign_cookie_value("tok123", "secret123");
        assert_eq!(
            encoded,
            "tok123.R3m5UItzIL0xhz3A6OokgJJFzLgiluadQpnR1IYDlNM%3D"
        );
        assert_eq!(
            verify_signed_cookie_value(&encoded, "secret123"),
            Some("tok123".to_string())
        );
        assert_eq!(verify_signed_cookie_value(&encoded, "wrong"), None);
        assert_eq!(
            verify_signed_cookie_value(
                "tok123.R3m5UItzIL0xhz3A6OokgJJFzLgiluadQpnR1IYDlNM=",
                "secret123"
            ),
            Some("tok123".to_string())
        );
    }
}
