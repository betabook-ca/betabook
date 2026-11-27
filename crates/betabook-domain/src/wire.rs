//! String-valued SQLite columns whose allowed values are part of the HTTP contract.
use schemars::JsonSchema;

#[derive(JsonSchema)]
#[schemars(rename_all = "lowercase")]
pub enum AscentStyle {
    Redpoint,
    Flash,
    Onsight,
}
#[derive(JsonSchema)]
#[schemars(rename_all = "lowercase")]
pub enum GradeFeel {
    Low,
    Solid,
    High,
}
#[derive(JsonSchema)]
#[schemars(rename_all = "lowercase")]
pub enum JournalKind {
    Session,
    Training,
}
#[derive(JsonSchema)]
#[schemars(rename_all = "lowercase")]
pub enum FriendshipStatus {
    None,
    Incoming,
    Outgoing,
    Friends,
}
#[derive(JsonSchema)]
#[schemars(rename_all = "lowercase")]
pub enum FeedKind {
    Send,
    Repeat,
    Session,
    Training,
    Goal,
}
#[derive(JsonSchema)]
#[schemars(rename_all = "lowercase")]
pub enum TourStatus {
    Completed,
    Dismissed,
}

#[derive(JsonSchema)]
pub struct AscentStyleCounts {
    pub flash: i64,
    pub redpoint: i64,
    pub onsight: i64,
}
