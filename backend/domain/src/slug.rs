use unicode_normalization::UnicodeNormalization;

pub fn slugify(name: &str) -> String {
    let mut normalized = String::with_capacity(name.len());
    for ch in name.nfkd() {
        if ('\u{0300}'..='\u{036f}').contains(&ch) {
            continue;
        }
        for lower in ch.to_lowercase() {
            match lower {
                'æ' => normalized.push_str("ae"),
                'ø' => normalized.push('o'),
                'ß' => normalized.push_str("ss"),
                'ł' => normalized.push('l'),
                'œ' => normalized.push_str("oe"),
                'ð' => normalized.push('d'),
                'þ' => normalized.push_str("th"),
                'đ' => normalized.push('d'),
                '\'' | '’' => {}
                c if c.is_ascii_alphanumeric() => normalized.push(c),
                _ => {
                    if !normalized.is_empty() && !normalized.ends_with('-') {
                        normalized.push('-');
                    }
                }
            }
        }
    }
    if normalized.len() > 80 {
        normalized.truncate(80);
    }
    while normalized.ends_with('-') {
        normalized.pop();
    }
    normalized
}

pub fn climb_href(id: i64, name: &str) -> String {
    let slug = slugify(name);
    if slug.is_empty() {
        format!("/climbs/{id}")
    } else {
        format!("/climbs/{id}/{slug}")
    }
}

pub fn area_href(id: i64, name: &str) -> String {
    let slug = slugify(name);
    if slug.is_empty() {
        format!("/areas/{id}")
    } else {
        format!("/areas/{id}/{slug}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_ts_slugify_behavior() {
        assert_eq!(slugify("Midnight Lightning"), "midnight-lightning");
        assert_eq!(slugify("  The  Nose  "), "the-nose");
        assert_eq!(slugify("Don't Get Greedy"), "dont-get-greedy");
        assert_eq!(slugify("O’Kelley’s Arete"), "okelleys-arete");
        assert_eq!(slugify("Café Crème"), "cafe-creme");
        assert_eq!(slugify("Böhmischer Traum"), "bohmischer-traum");
        assert_eq!(slugify("Großglockner"), "grossglockner");
        assert_eq!(slugify("Blåbæret"), "blabaeret");
        assert_eq!(slugify("Sørlandet"), "sorlandet");
        assert_eq!(slugify("Łódź"), "lodz");
        assert_eq!(slugify("L’Œil"), "loeil");
        assert_eq!(slugify("5.12a / V8 — project!"), "5-12a-v8-project");
        assert_eq!(slugify("上高地"), "");
        assert_eq!(slugify("!!!"), "");

        let long = format!("{} tail", "a".repeat(79));
        assert_eq!(slugify(&long), "a".repeat(79));
    }

    #[test]
    fn builds_entity_hrefs() {
        assert_eq!(
            climb_href(141187, "Midnight Lightning"),
            "/climbs/141187/midnight-lightning"
        );
        assert_eq!(area_href(3611, "Squamish"), "/areas/3611/squamish");
        assert_eq!(climb_href(42, "上"), "/climbs/42");
        assert_eq!(area_href(7, "???"), "/areas/7");
    }
}
