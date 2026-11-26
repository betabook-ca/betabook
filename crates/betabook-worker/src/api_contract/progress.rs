//! Goals, projects, lists, trips and the profile analytics page.
//! The named schemas below describe the JSON projections of live D1 queries.
#![allow(
    dead_code,
    reason = "these native-only types name fields in the generated API document"
)]

use super::ApiSpec;
use betabook_db::{
    climb_lists, feed::JournalCompanion, member_catalog::ClimbListChoice, projects, trips,
};
use betabook_domain::{
    analytics_layout::Layout, grades::ClimbType, public_catalog::AreaBreadcrumbItem,
    trips::AlbumPhoto, wire::AscentStyle,
};
use schemars::JsonSchema;
use serde_json::{Value, json};
use std::collections::BTreeMap;

#[derive(JsonSchema)]
#[schemars(rename_all = "kebab-case")]
enum GoalKind {
    Volume,
    Grade,
    Training,
    Days,
    NewAreas,
}
#[derive(JsonSchema)]
#[schemars(rename_all = "lowercase")]
enum GoalCadence {
    None,
    Week,
    Month,
    Year,
}
#[derive(JsonSchema)]
#[schemars(rename_all = "lowercase")]
enum GoalTimeframe {
    Week,
    Month,
    Year,
    Custom,
}
#[derive(JsonSchema)]
#[schemars(rename_all = "kebab-case")]
enum GoalGradeMatch {
    Exact,
    AtLeast,
}

#[derive(JsonSchema)]
#[schemars(rename_all = "camelCase")]
struct GoalRecord {
    id: i64,
    user_id: String,
    kind: GoalKind,
    target: i64,
    discipline: Option<ClimbType>,
    grade: Option<i64>,
    timeframe: GoalTimeframe,
    repeat: GoalCadence,
    start_date: String,
    end_date: String,
    timezone: String,
    grade_match: GoalGradeMatch,
    tags: Vec<String>,
    archived: bool,
    recurring_end_date: Option<String>,
    today: String,
    period_start: String,
    period_end: String,
    progress: i64,
    completed_date: Option<String>,
}

#[derive(JsonSchema)]
#[schemars(rename_all = "camelCase")]
struct RecurringGoalSummary {
    met: u32,
    total: u32,
    recent: Vec<GoalRecord>,
    has_more: bool,
    next_offset: usize,
    anchor_month: String,
}

#[derive(JsonSchema)]
#[schemars(rename_all = "camelCase")]
struct SummarizedGoal {
    #[schemars(flatten)]
    record: GoalRecord,
    missed: bool,
    needs_action: bool,
    #[schemars(skip_serializing_if = "Option::is_none", with = "RecurringGoalSummary")]
    recurring: Option<RecurringGoalSummary>,
}
#[derive(JsonSchema)]
struct GoalYearSummary {
    year: i64,
    achieved: usize,
}
#[derive(JsonSchema)]
#[schemars(rename_all = "camelCase")]
struct GoalPage {
    goals: Vec<SummarizedGoal>,
    has_more: bool,
    #[schemars(skip_serializing_if = "Option::is_none", with = "usize")]
    total: Option<usize>,
    #[schemars(skip_serializing_if = "Option::is_none", with = "Vec<i64>")]
    years: Option<Vec<i64>>,
    #[schemars(skip_serializing_if = "Option::is_none", with = "GoalYearSummary")]
    summary: Option<GoalYearSummary>,
    #[schemars(skip_serializing_if = "Option::is_none", with = "Vec<GoalRecord>")]
    celebrations: Option<Vec<GoalRecord>>,
}
#[derive(JsonSchema)]
#[schemars(rename_all = "camelCase")]
struct GoalOverview {
    initial_active: GoalPage,
    initial_completed: GoalPage,
    timezone: String,
    today: String,
    next_grades: BTreeMap<String, i64>,
    available_tags: Vec<String>,
}
#[derive(JsonSchema)]
#[schemars(rename_all = "lowercase")]
enum ContributionKind {
    Climb,
    Area,
}
#[derive(JsonSchema)]
struct GoalItem {
    id: i64,
    name: String,
    #[schemars(rename = "type")]
    kind: ContributionKind,
}
#[derive(JsonSchema)]
#[schemars(rename_all = "camelCase")]
struct GoalHistoryPage {
    periods: Vec<GoalRecord>,
    has_more: bool,
    #[schemars(skip_serializing_if = "Option::is_none", with = "usize")]
    next_offset: Option<usize>,
    #[schemars(skip_serializing_if = "Option::is_none", with = "String")]
    anchor_month: Option<String>,
}
#[derive(JsonSchema)]
#[schemars(rename_all = "camelCase")]
struct AnalyticsSend {
    climb_id: i64,
    climb_name: String,
    climb_type: ClimbType,
    suggested_grade: Option<i64>,
    area_id: i64,
    area_name: String,
    ascent_style: AscentStyle,
    date_sent: Option<String>,
}
#[derive(JsonSchema)]
#[schemars(rename_all = "camelCase")]
struct AnalyticsSession {
    entry_date: String,
    climb_type: ClimbType,
    count: i64,
}
#[derive(JsonSchema)]
#[schemars(rename_all = "camelCase")]
struct HighlightSession {
    id: i64,
    entry_date: String,
    climb_id: i64,
    climb_name: String,
    climb_type: ClimbType,
    sent: bool,
    is_ascent: bool,
    companions: Vec<JournalCompanion>,
}
#[derive(JsonSchema)]
#[schemars(rename_all = "camelCase")]
struct ClimberOverview {
    send_count: i64,
    area_count: i64,
    first_year: Option<i32>,
    days_out: Option<i64>,
    last_out: Option<String>,
    days_this_month: i64,
    month: String,
}

fn object(properties: Value) -> Value {
    let required: Vec<_> = properties
        .as_object()
        .expect("object properties")
        .keys()
        .cloned()
        .collect();
    json!({"type":"object","properties":properties,"required":required})
}
fn goals(api: &mut ApiSpec) {
    let overview = api.schema::<GoalOverview>();
    api.get("/api/pages/users/{id}/goals", "getGoalOverview", overview);
    let path = "/api/users/{id}/goals";
    let page = api.schema::<GoalPage>();
    let history = api.schema::<GoalHistoryPage>();
    let items = object(json!({"items":api.schema::<Vec<GoalItem>>() }));
    api.get(path,"getGoals",json!({"oneOf":[page,history,items],"description":"historyId selects calendar-period history. goalId and periodStart select contributions. Otherwise returns a goals page."}));
    for (key, schema) in [
        (
            "view",
            json!({"enum":["active","completed"],"default":"active"}),
        ),
        ("offset", json!({"type":"integer","minimum":0})),
        ("year", json!({"type":"integer","minimum":1,"maximum":9999})),
        ("historyId", json!({"type":"integer","minimum":1})),
        ("goalId", json!({"type":"integer","minimum":1})),
        (
            "anchor",
            json!({"type":"string","pattern":r"^\d{4}-\d{2}$"}),
        ),
        ("periodStart", json!({"type":"string","format":"date"})),
        ("periodEnd", json!({"type":"string","format":"date"})),
    ] {
        api.query(path, "get", key, schema, false);
    }
}

fn lists(api: &mut ApiSpec, header: &Value, owner: &Value) {
    let choices = object(json!({"lists":api.schema::<Vec<ClimbListChoice>>() }));
    api.get("/api/climbs/{id}/lists", "getClimbListChoices", choices);
    let index = object(
        json!({"mode":{"const":"index"},"header":header,"lists":api.schema::<Vec<climb_lists::ListSummary>>(),"audience":{"enum":["private","friends","public",null]}}),
    );
    api.get("/api/pages/users/{id}/lists", "getClimbLists", index);
    let items = object(
        json!({"items":api.schema::<Vec<climb_lists::ListItem>>(),"areaBreadcrumbs":api.schema::<BTreeMap<String,Vec<AreaBreadcrumbItem>>>()}),
    );
    let detail = object(
        json!({"mode":{"const":"detail"},"header":header,"list":api.schema::<climb_lists::ListSummary>(),"share":api.schema::<Option<climb_lists::ShareLink>>(),"shareOrigin":{"type":"string"},"page":items}),
    );
    let member = "/api/pages/users/{id}/lists/{list_id}";
    api.get(member, "getClimbList", detail);
    let link = "/api/pages/lists/{token}";
    let shared = object(
        json!({"mode":{"const":"shared"},"viewerId":{"type":["string","null"]},"owner":owner,"list":object(json!({"title":{"type":"string"},"description":{"type":["string","null"]},"climbCount":{"type":"integer"}})),"page":items}),
    );
    let expired = object(json!({"mode":{"const":"expired"}}));
    let redirect = object(
        json!({"mode":{"const":"owner"},"ownerId":{"type":"string"},"listId":{"type":"integer"}}),
    );
    api.get(
        link,
        "getSharedClimbList",
        json!({"oneOf":[shared,expired,redirect]}),
    );
    let sorts: Vec<_> = ["position", "grade", "area", "name", "added"]
        .into_iter()
        .flat_map(|k| ["asc", "desc"].map(|dir| format!("{k}_{dir}")))
        .collect();
    for path in [member, link] {
        api.query(
            path,
            "get",
            "sort",
            json!({"enum":sorts,"default":"position_asc"}),
            false,
        );
        api.query(path, "get", "name", json!({"type":"string"}), false);
        let discipline = api.schema::<Vec<ClimbType>>();
        api.query(path, "get", "discipline", discipline, false);
        for key in ["boulderRange", "sportRange", "tradRange", "ratingRange"] {
            api.query(
                path,
                "get",
                key,
                json!({"type":"array","items":{"type":"integer"},"maxItems":2}),
                false,
            );
        }
        api.query(
            path,
            "get",
            "minAscents",
            json!({"type":"integer","minimum":0}),
            false,
        );
        api.query(
            path,
            "get",
            "excludeSent",
            json!({"enum":["1","true"]}),
            false,
        );
    }
}

fn trips(api: &mut ApiSpec, header: &Value, owner: &Value) {
    let member_trip = api.schema::<trips::MemberTripSummary>();
    let public_trip = api.schema::<trips::TripSummary>();
    let index = object(
        json!({"header":header,"trips":{"type":"array","items":member_trip},"timezone":{"type":["string","null"]}}),
    );
    api.get("/api/pages/users/{id}/trips", "getTrips", index);
    let daily = object(
        json!({"rows":api.schema::<trips::DayRows>(),"breadcrumbs":api.schema::<BTreeMap<String,Vec<AreaBreadcrumbItem>>>()}),
    );
    let sends = api.schema::<Vec<AnalyticsSend>>();
    let sessions = api.schema::<Vec<AnalyticsSession>>();
    let chart = object(
        json!({"analytics":{"type":"object","required":["sends"],"properties":{"sends":sends,"sessions":sessions}}}),
    );
    let share = api.schema::<Option<trips::ShareLink>>();
    for (path, id, view, is_member) in [
        (
            "/api/pages/users/{id}/trips/{trip}",
            "getTrip",
            &daily,
            true,
        ),
        (
            "/api/pages/users/{id}/trips/{trip}/analytics",
            "getTripAnalytics",
            &chart,
            true,
        ),
        ("/api/pages/trips/{token}", "getSharedTrip", &daily, false),
        (
            "/api/pages/trips/{token}/analytics",
            "getSharedTripAnalytics",
            &chart,
            false,
        ),
    ] {
        let mut properties = json!({"notes":{"type":["string","null"]},"notesHtml":{"type":["string","null"]},"timezone":{"type":["string","null"]},"view":view});
        let response = if is_member {
            properties["trip"] = member_trip.clone();
            properties["header"] = header.clone();
            properties["share"] = share.clone();
            object(properties)
        } else {
            properties["trip"] = public_trip.clone();
            properties["owner"] = owner.clone();
            json!({"oneOf":[object(properties),object(json!({"expired":{"const":true}})),object(json!({"redirectTo":{"type":"string"}}))]})
        };
        api.get(path, id, response);
    }
    let photos = api.schema::<Vec<AlbumPhoto>>();
    api.get(
        "/api/pages/users/{id}/trips/{trip}/photos",
        "getTripPhotos",
        photos.clone(),
    );
    api.get(
        "/api/pages/trips/{token}/photos",
        "getSharedTripPhotos",
        photos,
    );
}

pub fn register(api: &mut ApiSpec) {
    let header = api.schema::<crate::routes::member_pages::ProfileHeaderData>();
    let owner = object(
        json!({"id":{"type":"string"},"name":{"type":"string"},"image":{"type":["string","null"]}}),
    );
    goals(api);
    lists(api, &header, &owner);
    trips(api, &header, &owner);
    let board = api.schema::<projects::ProjectBoard>();
    let path = "/api/pages/users/{id}/projects";
    api.get(path, "getProjectBoard", board);
    api.query(
        path,
        "get",
        "sent",
        json!({"type":"boolean","default":false}),
        false,
    );
    let public = object(
        json!({"status":{"const":"visible"},"project":api.schema::<projects::SharedProject>(),"sessions":api.schema::<Vec<projects::SharedSession>>() }),
    );
    api.get(
        "/api/pages/projects/{token}",
        "getSharedProject",
        json!({"oneOf":[public,object(json!({"status":{"const":"expired"}}))]}),
    );
    let analytics = object(
        json!({"header":header,"rows":api.schema::<Vec<AnalyticsSend>>(),"highlightSessions":api.schema::<Option<Vec<HighlightSession>>>(),"overview":api.schema::<ClimberOverview>(),"tags":{"type":"array","items":{"type":"string"}},"layout":api.schema::<Option<Layout>>(),"showAnnouncement":{"type":"boolean"},"viewerCreatedAt":{"type":"integer"},"nowMs":{"type":"integer"}}),
    );
    let path = "/api/pages/users/{id}/analytics";
    api.get(path, "getProfileAnalytics", analytics);
    api.query(
        path,
        "get",
        "tag",
        json!({"type":"array","items":{"type":"string"}}),
        false,
    );
}
