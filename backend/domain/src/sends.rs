use serde::{Deserialize, Serialize};
use url::Url;

use crate::grades::{
    BoulderScale, ClimbType, GradePreferences, RopeScale, format_grade, native_grade_array,
};

pub const ASCENT_STYLES: [&str; 3] = ["redpoint", "flash", "onsight"];
pub const BOULDER_ASCENT_STYLES: [&str; 2] = ["redpoint", "flash"];
pub const GRADE_FEEL_VALUES: [&str; 3] = ["low", "solid", "high"];
pub const MAX_LOG_NOTE_LENGTH: usize = 5000;
pub const MAX_SEND_VIDEOS: usize = 5;
pub const MAX_JOURNAL_TAGS: usize = 8;
pub const MAX_JOURNAL_TAG_LENGTH: usize = 24;
pub const MAX_JOURNAL_COMPANIONS: usize = 10;
pub const MAX_SEND_VIDEO_INPUT_LENGTH: usize = 2000;
const MAX_START_SECONDS: u32 = 24 * 60 * 60;

pub const SEND_VIDEO_INVALID_MESSAGE: &str =
    "Paste a link to a YouTube video or an Instagram reel or post.";
pub const SEND_VIDEO_SHARE_LINK_MESSAGE: &str = "Instagram share links can't be played here. Open the reel and copy the link from your browser's address bar.";
pub const SEND_VIDEO_LIMIT_MESSAGE: &str = "Link up to 5 videos per send.";
pub const BOULDER_ONSIGHT_ERROR: &str = "Boulders can't be onsighted — log it as a flash";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedSendInput {
    pub ascent_style: String,
    pub date_sent: Option<String>,
    pub comment: Option<String>,
    pub rating: Option<i64>,
    pub suggested_grade: i64,
    pub grade_feel: String,
    /// None = field not sent (leave existing videos unchanged);
    /// Some(None) = explicitly cleared;
    /// Some(Some(list)) = replace with canonical list.
    pub videos: Option<Option<Vec<String>>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedJournalInput {
    pub kind: String,
    pub climb_id: Option<i64>,
    pub sent: bool,
    pub entry_date: String,
    pub body: Option<String>,
    pub tags: Option<Vec<String>>,
}

fn is_leap_year(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap_year(year) {
                29
            } else {
                28
            }
        }
        _ => 0,
    }
}

pub fn days_between(from: &str, to: &str) -> Option<i64> {
    let days = |value| {
        parse_iso_date_parts(value)
            .map(|(y, m, d)| days_from_civil(i64::from(y), i64::from(m), i64::from(d)))
    };
    Some(days(to)? - days(from)?)
}

/// Howard Hinnant's civil-to-days conversion (days since 1970-01-01).
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = year - if month <= 2 { 1 } else { 0 };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (month + if month > 2 { -3 } else { 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Howard Hinnant's days-to-civil conversion.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if m <= 2 { 1 } else { 0 };
    (year, m as u32, d as u32)
}

pub fn parse_iso_date_parts(value: &str) -> Option<(i32, u32, u32)> {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return None;
    }
    if !bytes[..4].iter().all(u8::is_ascii_digit)
        || !bytes[5..7].iter().all(u8::is_ascii_digit)
        || !bytes[8..10].iter().all(u8::is_ascii_digit)
    {
        return None;
    }
    let year: i32 = value[..4].parse().ok()?;
    let month: u32 = value[5..7].parse().ok()?;
    let day: u32 = value[8..10].parse().ok()?;
    if !(1..=12).contains(&month) {
        return None;
    }
    let max_day = days_in_month(year, month);
    if day == 0 || day > max_day {
        return None;
    }
    Some((year, month, day))
}

pub fn is_real_iso_date(value: &str) -> bool {
    parse_iso_date_parts(value).is_some()
}

pub fn latest_acceptable_send_date(today_iso: &str) -> String {
    let Some((year, month, day)) = parse_iso_date_parts(today_iso) else {
        return today_iso.to_string();
    };
    let next_days = days_from_civil(i64::from(year), i64::from(month), i64::from(day)) + 1;
    let (ny, nm, nd) = civil_from_days(next_days);
    format!("{ny:04}-{nm:02}-{nd:02}")
}

fn is_youtube_id(value: &str) -> bool {
    value.len() == 11
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

fn is_instagram_shortcode(value: &str) -> bool {
    (5..=64).contains(&value.len())
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

fn parse_youtube_start(raw: Option<&str>) -> Option<u32> {
    let s = raw?;
    if s.is_empty() {
        return None;
    }
    let bytes = s.as_bytes();
    let mut i = 0_usize;
    let mut hours = 0_u64;
    let mut minutes = 0_u64;
    let mut seconds = 0_u64;
    let mut saw_unit = false;

    while i < bytes.len() {
        let start = i;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
        }
        if i == start {
            return None;
        }
        let num: u64 = s[start..i].parse().ok()?;
        if i < bytes.len() {
            match bytes[i] {
                b'h' if !saw_unit => {
                    hours = num;
                    saw_unit = true;
                    i += 1;
                }
                b'm' => {
                    minutes = num;
                    saw_unit = true;
                    i += 1;
                }
                b's' => {
                    seconds = num;
                    i += 1;
                    if i != bytes.len() {
                        return None;
                    }
                }
                _ => return None,
            }
        } else {
            seconds = num;
            break;
        }
    }

    let total = hours
        .saturating_mul(3600)
        .saturating_add(minutes.saturating_mul(60))
        .saturating_add(seconds);
    if total > 0 && total <= u64::from(MAX_START_SECONDS) {
        Some(total as u32)
    } else {
        None
    }
}

fn has_scheme_prefix(value: &str) -> bool {
    let Some(colon) = value.find(':') else {
        return false;
    };
    let prefix = &value[..colon];
    let mut chars = prefix.bytes();
    let Some(first) = chars.next() else {
        return false;
    };
    first.is_ascii_alphabetic()
        && chars.all(|b| b.is_ascii_alphanumeric() || b == b'+' || b == b'.' || b == b'-')
}

pub fn parse_send_video_link(input: &str) -> Result<String, &'static str> {
    let trimmed = input.trim();
    if trimmed.is_empty() || trimmed.encode_utf16().count() > MAX_SEND_VIDEO_INPUT_LENGTH {
        return Err(SEND_VIDEO_INVALID_MESSAGE);
    }
    let with_scheme = if has_scheme_prefix(trimmed) {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    let parsed = Url::parse(&with_scheme).map_err(|_| SEND_VIDEO_INVALID_MESSAGE)?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(SEND_VIDEO_INVALID_MESSAGE);
    }
    if !parsed.username().is_empty() || parsed.password().is_some() || parsed.port().is_some() {
        return Err(SEND_VIDEO_INVALID_MESSAGE);
    }
    let host = parsed
        .host_str()
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    let segments: Vec<&str> = parsed.path().split('/').filter(|s| !s.is_empty()).collect();

    if host == "youtu.be"
        || matches!(
            host.as_str(),
            "youtube.com"
                | "www.youtube.com"
                | "m.youtube.com"
                | "youtube-nocookie.com"
                | "www.youtube-nocookie.com"
        )
    {
        let mut is_short = false;
        let extracted_id: String = if host != "youtu.be" && segments.first() == Some(&"watch") {
            let v = parsed
                .query_pairs()
                .find(|(k, _)| k == "v")
                .map(|(_, val)| val.into_owned())
                .ok_or(SEND_VIDEO_INVALID_MESSAGE)?;
            if !is_youtube_id(&v) {
                return Err(SEND_VIDEO_INVALID_MESSAGE);
            }
            v
        } else {
            let raw_id = if host == "youtu.be" {
                segments.first().copied()
            } else if segments.first() == Some(&"shorts") {
                is_short = true;
                segments.get(1).copied()
            } else if matches!(segments.first(), Some(&"live" | &"embed" | &"v")) {
                segments.get(1).copied()
            } else {
                None
            };
            let candidate = raw_id.ok_or(SEND_VIDEO_INVALID_MESSAGE)?;
            if !is_youtube_id(candidate) {
                return Err(SEND_VIDEO_INVALID_MESSAGE);
            }
            candidate.to_string()
        };

        if is_short {
            return Ok(format!("https://www.youtube.com/shorts/{extracted_id}"));
        }
        let t_param = parsed
            .query_pairs()
            .find(|(k, _)| k == "t")
            .map(|(_, v)| v.into_owned())
            .or_else(|| {
                parsed
                    .query_pairs()
                    .find(|(k, _)| k == "start")
                    .map(|(_, v)| v.into_owned())
            });
        let start = parse_youtube_start(t_param.as_deref());
        return Ok(match start {
            Some(sec) => format!("https://www.youtube.com/watch?v={extracted_id}&t={sec}s"),
            None => format!("https://www.youtube.com/watch?v={extracted_id}"),
        });
    }

    if matches!(
        host.as_str(),
        "instagram.com" | "www.instagram.com" | "m.instagram.com" | "instagr.am"
    ) {
        if segments.first() == Some(&"share") {
            return Err(SEND_VIDEO_SHARE_LINK_MESSAGE);
        }
        let kind_idx = if matches!(segments.first(), Some(&"p" | &"reel" | &"reels" | &"tv")) {
            0
        } else {
            1
        };
        let format = match segments.get(kind_idx).copied() {
            Some("p") => "p",
            Some("reel" | "reels" | "tv") => "reel",
            _ => return Err(SEND_VIDEO_INVALID_MESSAGE),
        };
        let shortcode = segments
            .get(kind_idx + 1)
            .copied()
            .ok_or(SEND_VIDEO_INVALID_MESSAGE)?;
        if !is_instagram_shortcode(shortcode) {
            return Err(SEND_VIDEO_INVALID_MESSAGE);
        }
        return Ok(format!("https://www.instagram.com/{format}/{shortcode}/"));
    }

    Err(SEND_VIDEO_INVALID_MESSAGE)
}

/// Validates submitted video links:
/// - `values == None` -> form didn't carry `videosChanged`, preserve existing (`Ok(None)`)
/// - `values == Some(&[])` or all blank -> `Ok(Some(None))`
/// - non-empty -> `Ok(Some(Some(canonical_links)))`
pub fn validate_send_videos_input(
    values: Option<&[String]>,
) -> Result<Option<Option<Vec<String>>>, String> {
    let Some(values) = values else {
        return Ok(None);
    };
    let mut links: Vec<String> = Vec::new();
    for raw in values {
        if raw.trim().is_empty() {
            continue;
        }
        let canonical = parse_send_video_link(raw).map_err(ToString::to_string)?;
        if !links.contains(&canonical) {
            links.push(canonical);
        }
    }
    if links.len() > MAX_SEND_VIDEOS {
        return Err(SEND_VIDEO_LIMIT_MESSAGE.to_string());
    }
    if links.is_empty() {
        Ok(Some(None))
    } else {
        Ok(Some(Some(links)))
    }
}

pub fn parse_video_list_json(raw: Option<&str>) -> Option<Vec<String>> {
    raw.and_then(|s| serde_json::from_str::<Vec<String>>(s).ok())
}

pub fn assert_loggable_on_climb(broken_on: Option<&str>, date: Option<&str>) -> Result<(), String> {
    let Some(broken_on) = broken_on else {
        return Ok(());
    };
    if let Some(d) = date
        && d < broken_on
    {
        return Ok(());
    }
    Err(format!(
        "This climb broke on {broken_on}. Only ascents dated before that can be logged."
    ))
}

fn trim_or_none(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
}

fn parse_grade_index(value: Option<&str>, bounds: usize, field_name: &str) -> Result<i64, String> {
    let Some(raw) = value.filter(|s| !s.is_empty()) else {
        return Err(format!("{field_name} is required"));
    };
    let parsed: f64 = raw
        .trim()
        .parse()
        .map_err(|_| format!("Invalid {}", field_name.to_lowercase()))?;
    if !parsed.is_finite() || parsed.fract() != 0.0 || parsed < 0.0 || (parsed as usize) >= bounds {
        return Err(format!("Invalid {}", field_name.to_lowercase()));
    }
    Ok(parsed as i64)
}

#[allow(clippy::too_many_arguments)]
pub fn validate_send_input(
    climb_type: ClimbType,
    ascent_style: Option<&str>,
    date_sent: Option<&str>,
    comment: Option<&str>,
    rating: Option<&str>,
    suggested_grade: Option<&str>,
    grade_feel: Option<&str>,
    videos: Option<&[String]>,
    today_iso: &str,
) -> Result<ValidatedSendInput, String> {
    let style = ascent_style
        .filter(|s| ASCENT_STYLES.contains(s))
        .ok_or_else(|| "Invalid ascent style".to_string())?;
    let allowed = if climb_type.is_boulder() {
        &BOULDER_ASCENT_STYLES[..]
    } else {
        &ASCENT_STYLES[..]
    };
    if !allowed.contains(&style) {
        return Err(BOULDER_ONSIGHT_ERROR.to_string());
    }

    let parsed_date = match trim_or_none(date_sent) {
        None => None,
        Some(d) => {
            if !is_real_iso_date(&d) {
                return Err("Invalid send date".to_string());
            }
            if d > latest_acceptable_send_date(today_iso) {
                return Err("Send date can't be in the future".to_string());
            }
            Some(d)
        }
    };

    let parsed_comment = trim_or_none(comment);
    if let Some(ref c) = parsed_comment
        && c.encode_utf16().count() > MAX_LOG_NOTE_LENGTH
    {
        return Err(format!(
            "Comment must be {MAX_LOG_NOTE_LENGTH} characters or fewer"
        ));
    }

    let parsed_rating = match rating.filter(|s| !s.is_empty()) {
        None => None,
        Some(raw) => {
            let num: f64 = raw
                .trim()
                .parse()
                .map_err(|_| "Rating must be between 1 and 5".to_string())?;
            if !num.is_finite() || num.fract() != 0.0 || !(1.0..=5.0).contains(&num) {
                return Err("Rating must be between 1 and 5".to_string());
            }
            Some(num as i64)
        }
    };

    let bounds = native_grade_array(climb_type).len();
    let parsed_grade = parse_grade_index(suggested_grade, bounds, "Suggested grade")?;

    let feel = grade_feel
        .filter(|s| GRADE_FEEL_VALUES.contains(s))
        .unwrap_or("solid")
        .to_string();

    let parsed_videos = validate_send_videos_input(videos)?;

    Ok(ValidatedSendInput {
        ascent_style: style.to_string(),
        date_sent: parsed_date,
        comment: parsed_comment,
        rating: parsed_rating,
        suggested_grade: parsed_grade,
        grade_feel: feel,
        videos: parsed_videos,
    })
}

pub fn normalize_tag(value: &str) -> String {
    value.trim().trim_start_matches('#').to_ascii_lowercase()
}

pub fn is_valid_journal_tag(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

pub fn normalize_tags(raw: &[String]) -> Result<Vec<String>, String> {
    let mut seen: Vec<String> = Vec::new();
    for item in raw {
        let tag = normalize_tag(item);
        if tag.is_empty() {
            continue;
        }
        let len = tag.encode_utf16().count();
        if len > MAX_JOURNAL_TAG_LENGTH {
            return Err(format!(
                "Tag \"{tag}\" is {len} characters — the limit is {MAX_JOURNAL_TAG_LENGTH}"
            ));
        }
        if !is_valid_journal_tag(&tag) {
            return Err(format!(
                "Tag \"{tag}\" can only contain letters, numbers and hyphens"
            ));
        }
        if !seen.contains(&tag) {
            seen.push(tag);
        }
    }
    if seen.len() > MAX_JOURNAL_TAGS {
        return Err(format!(
            "{} tags — the limit is {MAX_JOURNAL_TAGS}",
            seen.len()
        ));
    }
    Ok(seen)
}

fn format_thousands(n: usize) -> String {
    let s = n.to_string();
    let mut out = String::with_capacity(s.len() + s.len() / 3);
    for (idx, ch) in s.chars().enumerate() {
        if idx > 0 && (s.len() - idx).is_multiple_of(3) {
            out.push(',');
        }
        out.push(ch);
    }
    out
}

pub fn validate_journal_input(
    kind: Option<&str>,
    climb_id_raw: Option<&str>,
    sent_raw: Option<&str>,
    entry_date_raw: Option<&str>,
    body_raw: Option<&str>,
    tags_raw: &[String],
    today_iso: &str,
) -> Result<ValidatedJournalInput, String> {
    let parsed_kind = match kind {
        Some(kind @ ("session" | "training")) => kind.to_string(),
        _ => return Err("Invalid entry kind".to_string()),
    };

    let climb_id = match climb_id_raw.map(str::trim).filter(|s| !s.is_empty()) {
        None => None,
        Some(raw) => {
            let num: f64 = raw.parse().map_err(|_| "Invalid climb".to_string())?;
            if !num.is_finite() || num.fract() != 0.0 || num < 1.0 {
                return Err("Invalid climb".to_string());
            }
            Some(num as i64)
        }
    };

    let sent = matches!(sent_raw, Some("true" | "on" | "1"));

    let entry_date = entry_date_raw
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Entry date is required".to_string())?;
    if !is_real_iso_date(entry_date) {
        return Err("Invalid entry date".to_string());
    }
    if entry_date > latest_acceptable_send_date(today_iso).as_str() {
        return Err("Entry date can't be in the future".to_string());
    }

    let body = trim_or_none(body_raw);
    let tags = normalize_tags(tags_raw)?;

    if parsed_kind == "training" {
        if climb_id.is_some() {
            return Err("Climb-specific entries are sessions, not training".to_string());
        }
        if sent {
            return Err("Training entries can't be marked as sends".to_string());
        }
        if body.is_none() && tags.is_empty() {
            return Err("Add a note or a tag so this records something".to_string());
        }
    } else if climb_id.is_none() {
        return Err("Pick a climb for an outdoor session".to_string());
    }

    if let Some(ref b) = body {
        let len = b.encode_utf16().count();
        if len > MAX_LOG_NOTE_LENGTH {
            return Err(format!(
                "Note is {len} characters — the limit is {}",
                format_thousands(MAX_LOG_NOTE_LENGTH)
            ));
        }
    }

    Ok(ValidatedJournalInput {
        kind: parsed_kind,
        climb_id,
        sent,
        entry_date: entry_date.to_string(),
        body,
        tags: if tags.is_empty() { None } else { Some(tags) },
    })
}

pub fn parse_sharing_audience(value: &str) -> Result<&'static str, &'static str> {
    match value {
        "private" => Ok("private"),
        "friends" => Ok("friends"),
        "public" => Ok("public"),
        _ => Err("Invalid sharing audience"),
    }
}

pub fn parse_send_comment_audience(value: &str) -> Result<&'static str, &'static str> {
    match value {
        "everyone" => Ok("everyone"),
        _ => parse_sharing_audience(value),
    }
}

pub fn parse_boulder_scale(value: &str) -> Result<BoulderScale, &'static str> {
    BoulderScale::parse(value).ok_or("Invalid grading system")
}

pub fn parse_rope_scale(value: &str) -> Result<RopeScale, &'static str> {
    RopeScale::parse(value).ok_or("Invalid grading system")
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoalTitleInput {
    kind: String,
    target: i64,
    discipline: Option<String>,
    grade: Option<i64>,
    #[serde(default)]
    grade_match: Option<String>,
    repeat: String,
    #[serde(default)]
    tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AscentStyle {
    Redpoint,
    Flash,
    Onsight,
}

impl AscentStyle {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Redpoint => "redpoint",
            Self::Flash => "flash",
            Self::Onsight => "onsight",
        }
    }
}

pub fn format_goal_title(definition_json: &str, prefs: GradePreferences) -> Option<String> {
    let goal: GoalTitleInput = serde_json::from_str(definition_json).ok()?;
    let climb_type = goal.discipline.as_deref().and_then(ClimbType::parse);
    let grade = match (climb_type, goal.grade) {
        (Some(ct), Some(g)) => Some(format_grade(ct, Some(g), prefs)),
        _ => None,
    };
    let suffix = if goal.repeat == "none" {
        String::new()
    } else {
        format!(" every {}", goal.repeat)
    };
    let base = match goal.kind.as_str() {
        "grade" => format!("Send my first {}", grade.unwrap_or("—")),
        "volume" => {
            let noun = if goal.target == 1 { "climb" } else { "climbs" };
            let grade_part = match grade {
                Some(g) => {
                    let or_harder = if goal.grade_match.as_deref() == Some("at-least") {
                        " or harder"
                    } else {
                        ""
                    };
                    format!(" at {g}{or_harder}")
                }
                None => String::new(),
            };
            format!("Send {} {noun}{grade_part}{suffix}", goal.target)
        }
        "days" => {
            let noun = if goal.target == 1 { "day" } else { "days" };
            format!("Climb on {} {noun}{suffix}", goal.target)
        }
        "new-areas" => {
            let noun = if goal.target == 1 { "area" } else { "areas" };
            format!("Visit {} new {noun}{suffix}", goal.target)
        }
        _ => {
            let noun = if goal.target == 1 { "time" } else { "times" };
            format!("Train {} {noun}{suffix}", goal.target)
        }
    };
    let tags_suffix = match goal.tags {
        Some(tags) if !tags.is_empty() => format!(
            " · {}",
            tags.iter()
                .map(|t| format!("#{t}"))
                .collect::<Vec<_>>()
                .join(" ")
        ),
        _ => String::new(),
    };
    Some(format!("{base}{tags_suffix}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_iso_dates_and_tomorrow() {
        assert!(is_real_iso_date("2026-02-28"));
        assert!(!is_real_iso_date("2026-02-29"));
        assert!(is_real_iso_date("2024-02-29"));
        assert!(!is_real_iso_date("2026-02-30"));
        assert_eq!(latest_acceptable_send_date("2026-12-31"), "2027-01-01");
        assert_eq!(latest_acceptable_send_date("2024-02-28"), "2024-02-29");
    }

    #[test]
    fn parses_canonical_video_links() {
        assert_eq!(
            parse_send_video_link("https://youtu.be/dQw4w9WgXcQ?t=1m30s"),
            Ok("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s".to_string())
        );
        assert_eq!(
            parse_send_video_link("youtube.com/shorts/dQw4w9WgXcQ"),
            Ok("https://www.youtube.com/shorts/dQw4w9WgXcQ".to_string())
        );
        assert_eq!(
            parse_send_video_link("https://www.instagram.com/climber/reel/AbCdEf12/"),
            Ok("https://www.instagram.com/reel/AbCdEf12/".to_string())
        );
        assert_eq!(
            parse_send_video_link("https://www.instagram.com/share/reel/abc"),
            Err(SEND_VIDEO_SHARE_LINK_MESSAGE)
        );
    }

    #[test]
    fn validates_sends_and_journal_inputs() {
        assert!(
            validate_send_input(
                ClimbType::Boulder,
                Some("onsight"),
                None,
                None,
                None,
                Some("4"),
                None,
                None,
                "2026-11-26"
            )
            .is_err()
        );
        let ok_send = validate_send_input(
            ClimbType::Boulder,
            Some("flash"),
            Some("2026-11-25"),
            Some("  Nice  "),
            Some("5"),
            Some("4"),
            Some("high"),
            Some(&["https://youtu.be/dQw4w9WgXcQ".to_string()]),
            "2026-11-26",
        )
        .expect("valid send");
        assert_eq!(ok_send.date_sent.as_deref(), Some("2026-11-25"));
        assert_eq!(
            ok_send.videos,
            Some(Some(vec![
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ".to_string()
            ]))
        );

        let j = validate_journal_input(
            Some("training"),
            None,
            Some("false"),
            Some("2026-11-26"),
            Some("Hangboard session"),
            &["#HangBoard".to_string(), "crimp".to_string()],
            "2026-11-26",
        )
        .expect("valid training");
        assert_eq!(
            j.tags,
            Some(vec!["hangboard".to_string(), "crimp".to_string()])
        );
    }

    #[test]
    fn validates_broken_climb_and_goal_title() {
        assert!(assert_loggable_on_climb(Some("2026-06-01"), Some("2026-05-31")).is_ok());
        assert!(assert_loggable_on_climb(Some("2026-06-01"), Some("2026-06-01")).is_err());
        assert!(assert_loggable_on_climb(Some("2026-06-01"), None).is_err());

        let json = r#"{"kind":"volume","target":5,"discipline":"boulder","grade":5,"gradeMatch":"at-least","repeat":"month","tags":["power"]}"#;
        assert_eq!(
            format_goal_title(json, GradePreferences::default()).as_deref(),
            Some("Send 5 climbs at V4 or harder every month · #power")
        );
    }

    #[test]
    fn omitted_cleared_and_replaced_videos_remain_distinct() {
        assert_eq!(validate_send_videos_input(None), Ok(None));
        assert_eq!(
            validate_send_videos_input(Some(&[" ".into()])),
            Ok(Some(None))
        );
        let mut inputs: Vec<_> = (1..=5)
            .map(|n| format!("https://youtu.be/{n:011}"))
            .collect();
        let canonical: Vec<_> = (1..=5)
            .map(|n| format!("https://www.youtube.com/watch?v={n:011}"))
            .collect();
        inputs.push(canonical[0].clone());
        assert_eq!(
            validate_send_videos_input(Some(&inputs)),
            Ok(Some(Some(canonical)))
        );
        inputs.push("https://youtu.be/00000000006".into());
        assert_eq!(
            validate_send_videos_input(Some(&inputs)),
            Err(SEND_VIDEO_LIMIT_MESSAGE.into())
        );
    }

    #[test]
    fn journal_tags_and_training_notes_are_checked_after_normalization() {
        let mut tags: Vec<_> = (1..=8).map(|n| format!("tag-{n}")).collect();
        let expected = tags.clone();
        tags.extend([" ##TAG-1 ".into(), "  ".into()]);
        assert_eq!(normalize_tags(&tags), Ok(expected));
        tags.push("tag-9".into());
        assert!(normalize_tags(&tags).is_err());
        assert!(normalize_tags(&["indoor training".into()]).is_err());
        assert!(normalize_tags(&["x".repeat(25)]).is_err());

        let entry = |kind, climb, sent, date, body| {
            validate_journal_input(
                Some(kind),
                climb,
                Some(sent),
                Some(date),
                body,
                &[],
                "2026-04-30",
            )
        };
        for (kind, climb, sent, date, body) in [
            ("training", None, "false", "2026-04-30", Some(" ")),
            ("training", Some("42"), "false", "2026-04-30", Some("note")),
            ("training", None, "true", "2026-04-30", Some("note")),
            ("session", None, "false", "2026-04-30", Some("note")),
            ("session", Some("42"), "false", "2026-04-31", None),
            ("session", Some("42"), "false", "2026-05-02", None),
        ] {
            assert!(entry(kind, climb, sent, date, body).is_err());
        }
        // The UI counts UTF-16 code units and permits one calendar day of time zone difference.
        let max_body = "🧗".repeat(2500);
        let too_long = format!("{max_body}x");
        assert!(entry("training", None, "false", "2026-05-01", Some(&max_body)).is_ok());
        assert!(entry("training", None, "false", "2026-05-01", Some(&too_long)).is_err());
    }
}
