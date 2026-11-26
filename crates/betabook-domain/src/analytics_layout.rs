use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "api-spec", schemars(rename = "StoredAnalyticsLayout"))]
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Layout {
    cards: Vec<String>,
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
                "sends" | "hardest" | "days" | "flash" | "bestYear" | "streak" | "busiestMonth"
                | "areas" | "favoriteDay" | "layoff" | "partner" | "biggestProject"
                | "persistence" | "favoriteRepeat" | "onsight" => cards.push(id),
                _ => return None,
            }
        }
        if self.charts.iter().any(|s| {
            !matches!(
                s.as_str(),
                "progression" | "pyramid" | "breakthroughs" | "calendar" | "volume" | "flashRate"
            )
        }) {
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
