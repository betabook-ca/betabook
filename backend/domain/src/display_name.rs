pub const MAX_DISPLAY_NAME_LENGTH: usize = 100;

pub const DISPLAY_NAME_TAKEN_MESSAGE: &str = "That display name is already taken — pick another.";

pub fn display_name_problem(name: &str) -> Option<String> {
    if name.is_empty() {
        return Some("Display name is required".to_string());
    }
    if name.encode_utf16().count() > MAX_DISPLAY_NAME_LENGTH {
        return Some(format!(
            "Display name must be {MAX_DISPLAY_NAME_LENGTH} characters or fewer"
        ));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_display_name() {
        assert_eq!(
            display_name_problem(""),
            Some("Display name is required".to_string())
        );
        assert_eq!(display_name_problem("Jasper"), None);
        assert_eq!(display_name_problem(&"a".repeat(100)), None);
        assert_eq!(
            display_name_problem(&"a".repeat(101)),
            Some("Display name must be 100 characters or fewer".to_string())
        );
    }
}
