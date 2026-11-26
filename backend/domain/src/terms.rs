pub struct TermsVersionEntry {
    pub version: &'static str,
    pub label: &'static str,
}

pub const TERMS_VERSIONS: [TermsVersionEntry; 1] = [TermsVersionEntry {
    version: "2026-09-09",
    label: "September 9, 2026",
}];

pub const TERMS_VERSION: &str = TERMS_VERSIONS[0].version;
pub const TERMS_UPDATED_LABEL: &str = TERMS_VERSIONS[0].label;

pub const TERMS_REQUIRED_MESSAGE: &str =
    "Please agree to the current Terms of Service to create an account.";
pub const TERMS_ACCESS_MESSAGE: &str =
    "Please review and accept the current Terms of Service to continue.";

pub fn has_accepted_current_terms(
    terms_version: Option<&str>,
    terms_accepted_at: Option<i64>,
) -> bool {
    terms_version == Some(TERMS_VERSION) && terms_accepted_at.is_some()
}

pub fn terms_href(version: &str) -> String {
    format!("/terms/{version}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checks_terms_acceptance() {
        assert!(!has_accepted_current_terms(None, None));
        assert!(!has_accepted_current_terms(Some(TERMS_VERSION), None));
        assert!(!has_accepted_current_terms(Some("2025-01-01"), Some(1)));
        assert!(has_accepted_current_terms(Some(TERMS_VERSION), Some(1)));
        assert_eq!(terms_href(TERMS_VERSION), "/terms/2026-09-09");
    }
}
