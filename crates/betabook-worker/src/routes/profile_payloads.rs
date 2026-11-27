use super::member_pages::ProfileHeaderData;
use betabook_db::{
    journal::JournalEntry,
    sends::{UserSendRow, UserSendsPage},
    social::{CompanionOption, HardestSend, ProductTourState},
};
use betabook_domain::public_catalog::AreaBreadcrumbItem;
use serde::Serialize;
use std::collections::BTreeMap;
type Breadcrumbs = BTreeMap<i64, Vec<AreaBreadcrumbItem>>;

#[derive(Serialize)]
#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase")]
pub(crate) struct JournalSlice {
    pub entries: Vec<JournalEntry>,
    pub has_more: bool,
}

#[derive(Serialize)]
#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase")]
pub(crate) struct JournalResponse {
    #[serde(flatten)]
    pub page: JournalSlice,
    pub area_breadcrumbs: Breadcrumbs,
}

#[derive(Serialize)]
#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase")]
pub(crate) struct SendsResponse {
    #[serde(flatten)]
    pub page: UserSendsPage,
    pub area_breadcrumbs: Breadcrumbs,
}

#[derive(Serialize)]
#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase")]
pub(crate) struct JournalView {
    pub has_entries: bool,
    pub first_page: JournalSlice,
    pub area_breadcrumbs: Breadcrumbs,
    pub tags: Vec<String>,
    pub friends: Vec<CompanionOption>,
    pub filtered_climb_name: Option<String>,
    pub tour_state: Option<ProductTourState>,
}

#[derive(Serialize)]
#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase")]
pub(crate) struct SendsView {
    pub has_sends: bool,
    pub first_page: UserSendsPage,
    pub area_breadcrumbs: Breadcrumbs,
    pub tags: Vec<String>,
}

#[derive(Serialize)]
#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase")]
pub(crate) struct JournalWorkspace {
    #[serde(flatten)]
    pub header: ProfileHeaderData,
    pub journal: JournalView,
}

#[derive(Serialize)]
#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase")]
pub(crate) struct SendsWorkspace {
    #[serde(flatten)]
    pub header: ProfileHeaderData,
    pub sends: SendsView,
}

#[derive(Serialize)]
#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase")]
pub(crate) struct SharedOwner {
    pub id: String,
    pub name: String,
    pub image: Option<String>,
}

#[derive(Serialize)]
#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase")]
pub(crate) struct SharedProfile {
    pub owner: SharedOwner,
    pub token: String,
    pub hardest: Vec<HardestSend>,
    pub send_count: i64,
    pub sends: Vec<UserSendRow>,
    pub area_breadcrumbs: Breadcrumbs,
}

#[derive(Serialize)]
#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[serde(tag = "defaultTab", rename_all = "camelCase")]
pub(crate) enum ProfileTab {
    Journal(JournalWorkspace),
    Sends(SendsWorkspace),
}

#[derive(Serialize)]
#[cfg_attr(feature = "api-spec", derive(schemars::JsonSchema))]
#[serde(tag = "mode", rename_all = "camelCase")]
pub(crate) enum ProfilePage {
    Shared(SharedProfile),
    Member(ProfileTab),
}
