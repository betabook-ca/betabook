//! Web Push message encryption (RFC 8291, `aes128gcm` from RFC 8188) and
//! VAPID authorization (RFC 8292), in pure Rust so it runs on wasm32.
use aes_gcm::{
    Aes128Gcm, Nonce,
    aead::{Aead, KeyInit},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use hkdf::Hkdf;
use p256::{
    PublicKey, SecretKey,
    ecdsa::{Signature, SigningKey, signature::Signer},
};
use sha2::Sha256;

/// One record holds the whole message; push services accept 4096 bytes.
const RECORD_SIZE: u32 = 4096;
/// Plaintext room left in one record after the header and AEAD tag.
pub const MAX_PAYLOAD: usize = 3_000;
/// VAPID tokens may live at most a day; twelve hours leaves room for clock skew.
const VAPID_LIFETIME_SECS: i64 = 12 * 60 * 60;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum WebPushError {
    #[error("invalid subscription key")]
    InvalidSubscription,
    #[error("invalid VAPID key")]
    InvalidVapidKey,
    #[error("payload too large")]
    PayloadTooLarge,
    #[error("random generation failed")]
    Random,
    #[error("encryption failed")]
    Encrypt,
}

fn decode(value: &str) -> Option<Vec<u8>> {
    URL_SAFE_NO_PAD.decode(value.trim_end_matches('=')).ok()
}

/// Push services of the browsers Betabook supports. The Worker POSTs to a
/// subscription endpoint, so anything else is refused rather than fetched.
const PUSH_SERVICE_HOSTS: &[&str] = &[
    "fcm.googleapis.com",
    "updates.push.services.mozilla.com",
    "web.push.apple.com",
];
const PUSH_SERVICE_SUFFIXES: &[&str] = &[".push.apple.com", ".notify.windows.com"];

/// The VAPID audience (`https://host`) of a known push service endpoint.
pub fn push_service_audience(endpoint: &str) -> Option<String> {
    let url = url::Url::parse(endpoint).ok()?;
    let host = url.host_str()?;
    let known = PUSH_SERVICE_HOSTS.contains(&host)
        || PUSH_SERVICE_SUFFIXES.iter().any(|s| host.ends_with(s));
    (url.scheme() == "https"
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && endpoint.len() <= 1024
        && known)
        .then(|| format!("https://{host}"))
}

/// A browser's `PushSubscription` keys, base64url as `getKey()` exports them.
pub struct Subscription {
    public_key: PublicKey,
    sec1: Vec<u8>,
    auth: [u8; 16],
}

impl Subscription {
    pub fn parse(p256dh: &str, auth: &str) -> Result<Self, WebPushError> {
        let sec1 = decode(p256dh).ok_or(WebPushError::InvalidSubscription)?;
        if sec1.len() != 65 || sec1.first() != Some(&0x04) {
            return Err(WebPushError::InvalidSubscription);
        }
        let public_key =
            PublicKey::from_sec1_bytes(&sec1).map_err(|_| WebPushError::InvalidSubscription)?;
        let auth = decode(auth)
            .and_then(|bytes| <[u8; 16]>::try_from(bytes).ok())
            .ok_or(WebPushError::InvalidSubscription)?;
        Ok(Self {
            public_key,
            sec1,
            auth,
        })
    }
}

fn random_secret() -> Result<SecretKey, WebPushError> {
    loop {
        let mut bytes = [0u8; 32];
        getrandom::fill(&mut bytes).map_err(|_| WebPushError::Random)?;
        // Out-of-range scalars are vanishingly rare; draw again.
        if let Ok(key) = SecretKey::from_slice(&bytes) {
            return Ok(key);
        }
    }
}

/// Encrypts `plaintext` for one subscription with a fresh key and salt.
pub fn encrypt(subscription: &Subscription, plaintext: &[u8]) -> Result<Vec<u8>, WebPushError> {
    let mut salt = [0u8; 16];
    getrandom::fill(&mut salt).map_err(|_| WebPushError::Random)?;
    encrypt_with(subscription, plaintext, &random_secret()?, salt)
}

fn encrypt_with(
    subscription: &Subscription,
    plaintext: &[u8],
    sender: &SecretKey,
    salt: [u8; 16],
) -> Result<Vec<u8>, WebPushError> {
    if plaintext.len() > MAX_PAYLOAD {
        return Err(WebPushError::PayloadTooLarge);
    }
    let sender_public = sender.public_key().to_sec1_bytes();
    let shared = sender.diffie_hellman(&subscription.public_key);

    // RFC 8291 §3.3: mix the subscription's auth secret into the ECDH secret.
    let mut key_info = b"WebPush: info\0".to_vec();
    key_info.extend_from_slice(&subscription.sec1);
    key_info.extend_from_slice(&sender_public);
    let mut ikm = [0u8; 32];
    Hkdf::<Sha256>::new(Some(&subscription.auth), shared.raw_secret_bytes())
        .expand(&key_info, &mut ikm)
        .map_err(|_| WebPushError::Encrypt)?;

    // RFC 8188 §2.2–2.3: content-encryption key and nonce for the one record.
    let prk = Hkdf::<Sha256>::new(Some(&salt), &ikm);
    let mut cek = [0u8; 16];
    let mut nonce = [0u8; 12];
    prk.expand(b"Content-Encoding: aes128gcm\0", &mut cek)
        .and_then(|()| prk.expand(b"Content-Encoding: nonce\0", &mut nonce))
        .map_err(|_| WebPushError::Encrypt)?;

    let mut record = plaintext.to_vec();
    record.push(0x02); // padding delimiter of the last record
    let cipher = Aes128Gcm::new_from_slice(&cek).map_err(|_| WebPushError::Encrypt)?;
    let ciphertext = cipher
        .encrypt(&Nonce::from(nonce), record.as_slice())
        .map_err(|_| WebPushError::Encrypt)?;

    let mut body = Vec::with_capacity(16 + 4 + 1 + sender_public.len() + ciphertext.len());
    body.extend_from_slice(&salt);
    body.extend_from_slice(&RECORD_SIZE.to_be_bytes());
    body.push(u8::try_from(sender_public.len()).map_err(|_| WebPushError::Encrypt)?);
    body.extend_from_slice(&sender_public);
    body.extend_from_slice(&ciphertext);
    Ok(body)
}

/// The application server's VAPID identity.
pub struct Vapid {
    signing_key: SigningKey,
    subject: String,
}

impl Vapid {
    /// `private_key` is the raw 32-byte P-256 scalar, base64url.
    /// `subject` is a `mailto:` or `https:` contact for push services.
    pub fn new(private_key: &str, subject: &str) -> Result<Self, WebPushError> {
        let bytes = decode(private_key).ok_or(WebPushError::InvalidVapidKey)?;
        let signing_key =
            SigningKey::from_slice(&bytes).map_err(|_| WebPushError::InvalidVapidKey)?;
        if !(subject.starts_with("mailto:") || subject.starts_with("https://")) {
            return Err(WebPushError::InvalidVapidKey);
        }
        Ok(Self {
            signing_key,
            subject: subject.to_owned(),
        })
    }

    /// The `applicationServerKey` browsers subscribe with, base64url.
    pub fn public_key(&self) -> String {
        let key = PublicKey::from(self.signing_key.verifying_key());
        URL_SAFE_NO_PAD.encode(key.to_sec1_bytes())
    }

    /// The `Authorization` header value for a push service origin.
    pub fn authorization(&self, audience: &str, now_secs: i64) -> String {
        let header = URL_SAFE_NO_PAD.encode(br#"{"typ":"JWT","alg":"ES256"}"#);
        let claims = serde_json::json!({
            "aud": audience,
            "exp": now_secs + VAPID_LIFETIME_SECS,
            "sub": self.subject,
        });
        let claims = URL_SAFE_NO_PAD.encode(claims.to_string());
        let signing_input = format!("{header}.{claims}");
        let signature: Signature = self.signing_key.sign(signing_input.as_bytes());
        let signature = URL_SAFE_NO_PAD.encode(signature.to_bytes());
        format!(
            "vapid t={signing_input}.{signature}, k={}",
            self.public_key()
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use p256::ecdsa::{VerifyingKey, signature::Verifier};

    // RFC 8291 Appendix A.
    const PLAINTEXT: &[u8] = b"When I grow up, I want to be a watermelon";
    const AS_PRIVATE: &str = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw";
    const UA_PRIVATE: &str = "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94";
    const UA_PUBLIC: &str =
        "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
    const SALT: &str = "DGv6ra1nlYgDCS1FRnbzlw";
    const AUTH: &str = "BTBZMqHH6r4Tts7J_aSIgg";
    const BODY: &str = "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";

    #[test]
    fn matches_the_rfc_8291_example() {
        let subscription = Subscription::parse(UA_PUBLIC, AUTH).unwrap();
        let sender = SecretKey::from_slice(&decode(AS_PRIVATE).unwrap()).unwrap();
        let salt: [u8; 16] = decode(SALT).unwrap().try_into().unwrap();
        let body = encrypt_with(&subscription, PLAINTEXT, &sender, salt).unwrap();
        assert_eq!(URL_SAFE_NO_PAD.encode(body), BODY);
    }

    #[test]
    fn fresh_messages_differ_and_reject_bad_input() {
        let subscription = Subscription::parse(UA_PUBLIC, AUTH).unwrap();
        let first = encrypt(&subscription, PLAINTEXT).unwrap();
        let second = encrypt(&subscription, PLAINTEXT).unwrap();
        assert_ne!(first, second);
        assert_eq!(first.len(), 16 + 4 + 1 + 65 + PLAINTEXT.len() + 1 + 16);
        assert_eq!(
            encrypt(&subscription, &[0; MAX_PAYLOAD + 1]).err(),
            Some(WebPushError::PayloadTooLarge)
        );
        assert!(Subscription::parse(UA_PRIVATE, AUTH).is_err());
        assert!(Subscription::parse(UA_PUBLIC, SALT.get(..10).unwrap()).is_err());
    }

    #[test]
    fn accepts_only_known_push_services() {
        for (endpoint, audience) in [
            (
                "https://fcm.googleapis.com/fcm/send/abc",
                "https://fcm.googleapis.com",
            ),
            (
                "https://web.push.apple.com/QGx",
                "https://web.push.apple.com",
            ),
            (
                "https://wns2-by3p.notify.windows.com/w/?token=x",
                "https://wns2-by3p.notify.windows.com",
            ),
            (
                "https://updates.push.services.mozilla.com/wpush/v2/x",
                "https://updates.push.services.mozilla.com",
            ),
        ] {
            assert_eq!(push_service_audience(endpoint).as_deref(), Some(audience));
        }
        for endpoint in [
            "http://fcm.googleapis.com/fcm/send/abc",
            "https://fcm.googleapis.com:8443/fcm/send/abc",
            "https://user@fcm.googleapis.com/fcm/send/abc",
            "https://evil.example/fcm.googleapis.com",
            "https://push.apple.com.evil.example/x",
            "https://169.254.169.254/latest",
        ] {
            assert_eq!(push_service_audience(endpoint), None, "{endpoint}");
        }
    }

    #[test]
    fn signs_a_verifiable_vapid_token() {
        let vapid = Vapid::new(AS_PRIVATE, "mailto:push@example.test").unwrap();
        let header = vapid.authorization("https://fcm.googleapis.com", 1_000);
        let (token, key) = header
            .strip_prefix("vapid t=")
            .and_then(|rest| rest.split_once(", k="))
            .unwrap();
        assert_eq!(key, vapid.public_key());
        let (signing_input, signature) = token.rsplit_once('.').unwrap();
        let (_, claims) = signing_input.split_once('.').unwrap();
        let claims: serde_json::Value =
            serde_json::from_slice(&URL_SAFE_NO_PAD.decode(claims).unwrap()).unwrap();
        assert_eq!(
            claims,
            serde_json::json!({"aud":"https://fcm.googleapis.com","exp":1_000 + VAPID_LIFETIME_SECS,"sub":"mailto:push@example.test"})
        );
        let verifying = VerifyingKey::from_sec1_bytes(&decode(key).unwrap()).unwrap();
        let signature = Signature::from_slice(&URL_SAFE_NO_PAD.decode(signature).unwrap()).unwrap();
        assert!(
            verifying
                .verify(signing_input.as_bytes(), &signature)
                .is_ok()
        );
        assert!(Vapid::new(AS_PRIVATE, "push@example.test").is_err());
        assert!(Vapid::new("short", "mailto:push@example.test").is_err());
    }
}
