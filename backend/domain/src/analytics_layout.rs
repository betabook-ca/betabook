use serde::{Deserialize, Serialize};
use std::collections::HashSet;

const CARDS: &[&str] = &[
    "sends",
    "hardest",
    "days",
    "flash",
    "bestYear",
    "streak",
    "busiestMonth",
    "areas",
    "favoriteDay",
    "layoff",
    "partner",
    "biggestProject",
    "persistence",
    "favoriteRepeat",
    "onsight",
];
const CHARTS: &[&str] = &[
    "progression",
    "pyramid",
    "breakthroughs",
    "calendar",
    "volume",
    "flashRate",
];

#[cfg(feature = "api-spec")]
fn card_schema(_: &mut schemars::SchemaGenerator) -> schemars::Schema {
    let ids: Vec<_> = CARDS.iter().copied().chain(["firstTry"]).collect();
    schemars::json_schema!({"type":"array","uniqueItems":true,"items":{"type":"string","enum":ids}})
}

#[cfg(feature = "api-spec")]
fn chart_schema(_: &mut schemars::SchemaGenerator) -> schemars::Schema {
    schemars::json_schema!({"type":"array","uniqueItems":true,"items":{"type":"string","enum":CHARTS}})
}

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "api-spec", schemars(rename = "StoredAnalyticsLayout"))]
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Layout {
    #[cfg_attr(feature = "api-spec", schemars(schema_with = "card_schema"))]
    cards: Vec<String>,
    #[cfg_attr(feature = "api-spec", schemars(schema_with = "chart_schema"))]
    charts: Vec<String>,
}

impl Layout {
    /// Accept cards saved before the flash/onsight split, including writes
    /// from a dashboard tab that was already open at deployment time.
    pub fn normalized(mut self) -> Option<Self> {
        let mut cards = Vec::new();
        let has_onsight = self.cards.iter().any(|s| s == "onsight");
        for id in self.cards {
            match id.as_str() {
                "firstTry" => {
                    cards.push("flash".to_owned());
                    if !has_onsight {
                        cards.push("onsight".to_owned());
                    }
                }
                card if CARDS.contains(&card) => cards.push(id),
                _ => return None,
            }
        }
        if self.charts.iter().any(|id| !CHARTS.contains(&id.as_str())) {
            return None;
        }
        if cards.iter().collect::<HashSet<_>>().len() != cards.len()
            || self.charts.iter().collect::<HashSet<_>>().len() != self.charts.len()
        {
            return None;
        }
        self.cards = cards;
        Some(self)
    }
}
