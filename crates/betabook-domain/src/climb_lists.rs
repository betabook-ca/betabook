use unicode_normalization::{UnicodeNormalization, char::is_combining_mark};

pub const LIST_LIMIT: usize = 100;
pub const ITEM_LIMIT: usize = 500;
pub const LIST_FULL: &str = "A list can hold 500 climbs.";
pub const TOO_MANY_LISTS: &str = "You can keep 100 lists. Delete one to add another.";
pub const LIST_MISSING: &str = "List not found";
pub const LIST_UNAVAILABLE: &str = "This list isn't available.";
pub const INVALID_EDIT: &str = "These list changes aren't valid. Reload the list and try again.";

#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
pub struct ListInput {
    pub title: String,
    pub description: Option<String>,
}

impl ListInput {
    pub fn parse(title: &str, description: Option<&str>) -> Result<Self, &'static str> {
        let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
        if title.is_empty() {
            return Err("Name your list.");
        }
        if title.chars().count() > 80 {
            return Err("That name is too long.");
        }
        let description = description.map(str::trim).filter(|s| !s.is_empty());
        if description.is_some_and(|s| s.chars().count() > 2000) {
            return Err("That description is too long.");
        }
        Ok(Self {
            title,
            description: description.map(str::to_owned),
        })
    }
}

pub fn fold_climb_name(name: &str) -> String {
    name.nfd()
        .filter(|ch| !is_combining_mark(*ch))
        .flat_map(char::to_lowercase)
        .collect()
}
