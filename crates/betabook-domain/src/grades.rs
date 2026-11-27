use serde::{Deserialize, Serialize};

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClimbType {
    Boulder,
    Sport,
    Trad,
}

impl ClimbType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Boulder => "boulder",
            Self::Sport => "sport",
            Self::Trad => "trad",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "boulder" => Some(Self::Boulder),
            "sport" => Some(Self::Sport),
            "trad" => Some(Self::Trad),
            _ => None,
        }
    }

    pub fn is_boulder(self) -> bool {
        matches!(self, Self::Boulder)
    }
}

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum BoulderScale {
    #[default]
    Hueco,
    Font,
}

impl BoulderScale {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Hueco => "hueco",
            Self::Font => "font",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "hueco" => Some(Self::Hueco),
            "font" => Some(Self::Font),
            _ => None,
        }
    }
}

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum RopeScale {
    #[default]
    Yds,
    French,
}

impl RopeScale {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Yds => "yds",
            Self::French => "french",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "yds" => Some(Self::Yds),
            "french" => Some(Self::French),
            _ => None,
        }
    }
}

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct GradePreferences {
    pub boulder: BoulderScale,
    pub rope: RopeScale,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ImportGradePreference {
    #[default]
    Native,
    Converted,
}

pub const BOULDER_HUECO: [&str; 19] = [
    "VB", "V0", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9", "V10", "V11", "V12", "V13",
    "V14", "V15", "V16", "V17",
];

pub const HUECO_TO_FONT: [&str; 19] = [
    "3", "4", "5", "5+", "6A", "6B", "6C", "7A", "7A+", "7B", "7C", "7C+", "8A", "8A+", "8B",
    "8B+", "8C", "8C+", "9A",
];

pub const ROPE_YDS: [&str; 34] = [
    "5.0", "5.1", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8", "5.9", "5.10a", "5.10b",
    "5.10c", "5.10d", "5.11a", "5.11b", "5.11c", "5.11d", "5.12a", "5.12b", "5.12c", "5.12d",
    "5.13a", "5.13b", "5.13c", "5.13d", "5.14a", "5.14b", "5.14c", "5.14d", "5.15a", "5.15b",
    "5.15c", "5.15d",
];

pub const YDS_TO_FRENCH: [&str; 34] = [
    "1", "2", "2", "3", "3", "4a", "4b", "4c", "5a", "5b", "5c", "6a", "6a+", "6b", "6b+", "6c",
    "6c+", "7a", "7a+", "7b", "7b+", "7c", "7c+", "8a", "8a+", "8b", "8b+", "8c", "8c+", "9a",
    "9a+", "9b", "9b+", "9c",
];

pub fn native_grade_array(climb_type: ClimbType) -> &'static [&'static str] {
    if climb_type.is_boulder() {
        &BOULDER_HUECO
    } else {
        &ROPE_YDS
    }
}

fn converted_grade_array(climb_type: ClimbType) -> &'static [&'static str] {
    if climb_type.is_boulder() {
        &HUECO_TO_FONT
    } else {
        &YDS_TO_FRENCH
    }
}

fn uses_native_scale(climb_type: ClimbType, prefs: GradePreferences) -> bool {
    if climb_type.is_boulder() {
        prefs.boulder == BoulderScale::Hueco
    } else {
        prefs.rope == RopeScale::Yds
    }
}

pub fn grade_array(climb_type: ClimbType, prefs: GradePreferences) -> &'static [&'static str] {
    if uses_native_scale(climb_type, prefs) {
        native_grade_array(climb_type)
    } else {
        converted_grade_array(climb_type)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GradeLabelGroup {
    pub label: &'static str,
    pub min: usize,
    pub max: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GradeOption {
    pub value: String,
    pub label: &'static str,
}

pub fn grade_label_groups(climb_type: ClimbType, prefs: GradePreferences) -> Vec<GradeLabelGroup> {
    let table = grade_array(climb_type, prefs);
    let mut groups: Vec<GradeLabelGroup> = Vec::with_capacity(table.len());
    for (i, &label) in table.iter().enumerate() {
        if let Some(last) = groups.last_mut()
            && last.label == label
        {
            last.max = i;
        } else {
            groups.push(GradeLabelGroup {
                label,
                min: i,
                max: i,
            });
        }
    }
    groups
}

pub fn grade_options(climb_type: ClimbType, prefs: GradePreferences) -> Vec<GradeOption> {
    grade_label_groups(climb_type, prefs)
        .into_iter()
        .map(|g| GradeOption {
            value: g.max.to_string(),
            label: g.label,
        })
        .collect()
}

pub fn grade_option_value(climb_type: ClimbType, grade: i64, prefs: GradePreferences) -> String {
    if let Ok(idx) = usize::try_from(grade)
        && let Some(group) = grade_label_groups(climb_type, prefs)
            .into_iter()
            .find(|g| idx >= g.min && idx <= g.max)
    {
        return group.max.to_string();
    }
    grade.to_string()
}

pub fn parse_grade(
    climb_type: ClimbType,
    text: &str,
    preference: ImportGradePreference,
) -> Option<usize> {
    let trimmed = text.trim().to_ascii_lowercase();
    if trimmed.is_empty() {
        return None;
    }

    let table = match preference {
        ImportGradePreference::Native => native_grade_array(climb_type),
        ImportGradePreference::Converted => converted_grade_array(climb_type),
    };

    for (i, &entry) in table.iter().enumerate().rev() {
        if entry.eq_ignore_ascii_case(&trimmed) {
            return Some(i);
        }
    }

    if !climb_type.is_boulder() {
        return None;
    }

    match preference {
        ImportGradePreference::Native => match trimmed.as_str() {
            "v0-" => Some(1),
            "v0+" => Some(2),
            _ => None,
        },
        ImportGradePreference::Converted => match trimmed.as_str() {
            "4-" => Some(1),
            "4+" => Some(2),
            "6a+" => Some(5),
            "6b+" => Some(6),
            "6c+" => Some(7),
            "7b+" => Some(10),
            _ => None,
        },
    }
}

pub fn format_grade(
    climb_type: ClimbType,
    grade: Option<i64>,
    prefs: GradePreferences,
) -> &'static str {
    let Some(grade) = grade else {
        return "—";
    };
    let Ok(idx) = usize::try_from(grade) else {
        return "—";
    };
    grade_array(climb_type, prefs)
        .get(idx)
        .copied()
        .unwrap_or("—")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GradeTrendArrow {
    Up,
    Down,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GradeTrend {
    pub posted_label: &'static str,
    pub suggested_label: Option<&'static str>,
    pub arrow: Option<GradeTrendArrow>,
}

/// Matches JS `Math.round` (round half toward +infinity).
fn js_math_round(value: f64) -> i64 {
    (value + 0.5).floor() as i64
}

pub fn describe_grade_trend(
    climb_type: ClimbType,
    grade: Option<i64>,
    avg_suggested_grade: Option<f64>,
    prefs: GradePreferences,
) -> GradeTrend {
    let posted_label = format_grade(climb_type, grade, prefs);
    let (Some(grade), Some(avg)) = (grade, avg_suggested_grade) else {
        return GradeTrend {
            posted_label,
            suggested_label: None,
            arrow: None,
        };
    };

    let delta = avg - (grade as f64);
    let offset = js_math_round(delta);
    let remainder = delta - (offset as f64);
    let arrow = if remainder.abs() > 0.25 {
        Some(if remainder > 0.0 {
            GradeTrendArrow::Up
        } else {
            GradeTrendArrow::Down
        })
    } else {
        None
    };

    if offset == 0 {
        return GradeTrend {
            posted_label,
            suggested_label: None,
            arrow,
        };
    }

    let suggested_label = format_grade(climb_type, Some(grade + offset), prefs);
    if suggested_label == posted_label {
        return GradeTrend {
            posted_label,
            suggested_label: None,
            arrow: arrow.or(Some(if offset > 0 {
                GradeTrendArrow::Up
            } else {
                GradeTrendArrow::Down
            })),
        };
    }

    GradeTrend {
        posted_label,
        suggested_label: Some(suggested_label),
        arrow,
    }
}

pub fn activity_grade(
    climb_type: Option<ClimbType>,
    posted_grade: Option<i64>,
    completed: bool,
    reported_grade: Option<i64>,
) -> Option<(ClimbType, i64)> {
    let grade = reported_grade.or(posted_grade)?;
    let climb_type = climb_type?;
    completed.then_some((climb_type, grade))
}

pub fn format_activity_grade(
    climb_type: Option<ClimbType>,
    posted_grade: Option<i64>,
    completed: bool,
    reported_grade: Option<i64>,
    prefs: GradePreferences,
) -> Option<&'static str> {
    let (kind, grade) = activity_grade(climb_type, posted_grade, completed, reported_grade)?;
    Some(format_grade(kind, Some(grade), prefs))
}

#[cfg(test)]
mod tests {
    use super::*;

    const FONT: GradePreferences = GradePreferences {
        boulder: BoulderScale::Font,
        rope: RopeScale::Yds,
    };
    const FRENCH: GradePreferences = GradePreferences {
        boulder: BoulderScale::Hueco,
        rope: RopeScale::French,
    };
    const EURO: GradePreferences = GradePreferences {
        boulder: BoulderScale::Font,
        rope: RopeScale::French,
    };

    #[test]
    fn formats_grades_by_scale_and_handles_missing() {
        let native = GradePreferences::default();
        assert_eq!(format_grade(ClimbType::Boulder, None, native), "—");
        assert_eq!(format_grade(ClimbType::Boulder, Some(-1), native), "—");
        assert_eq!(format_grade(ClimbType::Boulder, Some(999), native), "—");
        assert_eq!(format_grade(ClimbType::Boulder, Some(0), native), "VB");
        assert_eq!(format_grade(ClimbType::Boulder, Some(5), native), "V4");
        assert_eq!(format_grade(ClimbType::Boulder, Some(5), FONT), "6B");
        assert_eq!(format_grade(ClimbType::Sport, Some(10), native), "5.10a");
        assert_eq!(format_grade(ClimbType::Trad, Some(11), FRENCH), "6a");
        assert_eq!(format_grade(ClimbType::Sport, Some(11), EURO), "6a");
    }

    #[test]
    fn parses_grades_and_aliases() {
        assert_eq!(
            parse_grade(ClimbType::Boulder, "  v4  ", ImportGradePreference::Native),
            Some(5)
        );
        assert_eq!(
            parse_grade(ClimbType::Boulder, "6b", ImportGradePreference::Converted),
            Some(5)
        );
        assert_eq!(
            parse_grade(ClimbType::Sport, "2", ImportGradePreference::Converted),
            Some(2)
        );
        assert_eq!(
            parse_grade(ClimbType::Sport, "3", ImportGradePreference::Converted),
            Some(4)
        );
        assert_eq!(
            parse_grade(ClimbType::Boulder, "6A+", ImportGradePreference::Converted),
            Some(5)
        );
        assert_eq!(
            parse_grade(ClimbType::Boulder, "V0-", ImportGradePreference::Native),
            Some(1)
        );
        assert_eq!(
            parse_grade(ClimbType::Boulder, "V0+", ImportGradePreference::Native),
            Some(2)
        );
        assert_eq!(
            parse_grade(ClimbType::Sport, "4-", ImportGradePreference::Converted),
            None
        );
        assert_eq!(
            parse_grade(ClimbType::Boulder, "6A+", ImportGradePreference::Native),
            None
        );
        assert_eq!(
            parse_grade(ClimbType::Boulder, "   ", ImportGradePreference::Native),
            None
        );
    }

    #[test]
    fn builds_grade_options_and_trends() {
        let french_opts = grade_options(ClimbType::Sport, FRENCH);
        assert_eq!(french_opts.len(), ROPE_YDS.len() - 2);
        assert_eq!(french_opts[1].value, "2");
        assert_eq!(french_opts[1].label, "2");
        assert_eq!(grade_option_value(ClimbType::Sport, 1, FRENCH), "2");
        assert_eq!(grade_option_value(ClimbType::Sport, 99, FRENCH), "99");

        let native = GradePreferences::default();
        assert_eq!(
            describe_grade_trend(ClimbType::Boulder, Some(5), Some(5.3), native),
            GradeTrend {
                posted_label: "V4",
                suggested_label: None,
                arrow: Some(GradeTrendArrow::Up),
            }
        );
        assert_eq!(
            describe_grade_trend(ClimbType::Boulder, Some(5), Some(6.3), native),
            GradeTrend {
                posted_label: "V4",
                suggested_label: Some("V5"),
                arrow: Some(GradeTrendArrow::Up),
            }
        );
        assert_eq!(
            describe_grade_trend(ClimbType::Sport, Some(1), Some(2.0), FRENCH),
            GradeTrend {
                posted_label: "2",
                suggested_label: None,
                arrow: Some(GradeTrendArrow::Up),
            }
        );
    }
}
