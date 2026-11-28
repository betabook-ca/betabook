//! Positional RPC envelopes used by the SPA and the Worker's action dispatcher.
use super::ApiSpec;
use crate::rpc::Action;
use betabook_db::{journal::JournalEntry, sends::EditableSend};
use betabook_domain::{
    grades::ClimbType,
    wire::{AscentStyle, FriendshipStatus, GradeFeel, TourStatus},
};
use schemars::JsonSchema;
use serde_json::{Value, json};

/// Browser FormData serialized without collapsing repeated fields (tags, videos, companions).
#[derive(JsonSchema)]
#[expect(
    dead_code,
    reason = "Schema of the ordered JSON fields decoded by FormFields"
)]
struct ActionForm {
    #[schemars(rename = "__formData")]
    entries: Vec<(String, String)>,
}

fn id() -> Value {
    json!({"type":"integer","minimum":1,"maximum":9007199254740991i64})
}
fn string() -> Value {
    json!({"type":"string"})
}
fn number() -> Value {
    json!({"type":"integer"})
}
fn boolean() -> Value {
    json!({"type":"boolean"})
}
fn enumeration(items: &[&str]) -> Value {
    json!({"type":"string","enum":items})
}
fn nullable(schema: Value) -> Value {
    json!({"anyOf":[schema,{"type":"null"}]})
}
fn array(items: Value) -> Value {
    json!({"type":"array","items":items})
}
fn date() -> Value {
    json!({"type":"string","format":"date"})
}
fn object<const N: usize>(fields: [(&str, Value); N], required: &[&str]) -> Value {
    let fields: serde_json::Map<String, Value> =
        fields.into_iter().map(|(k, v)| (k.into(), v)).collect();
    json!({"type":"object","properties":fields,"required":required})
}
fn record<const N: usize>(fields: [(&str, Value); N]) -> Value {
    let required = fields.each_ref().map(|(k, _)| *k);
    object(fields, &required)
}

fn tuple(fields: &[(&str, Value)]) -> Value {
    if fields.is_empty() {
        return json!({"type":"array","const":[],"maxItems":0});
    }

    let entries: Vec<_> = fields
        .iter()
        .map(|(name, value)| {
            let mut schema = value.clone();
            schema["title"] = json!(name);
            schema
        })
        .collect();
    let mut schema =
        json!({"type":"array","minItems":fields.len(),"maxItems":fields.len(),"items":false});
    schema["prefixItems"] = json!(entries);
    schema
}

fn args<const N: usize>(fields: [(&str, Value); N]) -> Value {
    record([("args", tuple(&fields))])
}
fn optional_last<const N: usize>(fields: [(&str, Value); N]) -> Value {
    record([(
        "args",
        json!({"oneOf":[tuple(&fields[..N-1]),tuple(&fields)]}),
    )])
}

fn form(api: &mut ApiSpec, description: &str) -> Value {
    let mut schema = api.input_schema::<ActionForm>();
    schema["description"] = json!(description);
    schema
}
fn grade_preferences() -> Value {
    record([
        ("boulder", enumeration(&["hueco", "font"])),
        ("rope", enumeration(&["yds", "french"])),
    ])
}
fn grade_match() -> Value {
    enumeration(&["exact", "at-least"])
}
fn cadence() -> Value {
    enumeration(&["none", "week", "month", "year"])
}
fn goal(api: &mut ApiSpec) -> Value {
    object(
        [
            (
                "kind",
                enumeration(&["training", "days", "new-areas", "volume", "grade"]),
            ),
            (
                "target",
                json!({"type":"integer","minimum":1,"maximum":1000}),
            ),
            (
                "tags",
                json!({"type":["array","null"],"items":{"type":"string"},"maxItems":8}),
            ),
            ("discipline", nullable(api.input_schema::<ClimbType>())),
            ("grade", nullable(number())),
            ("gradeMatch", grade_match()),
            (
                "timeframe",
                enumeration(&["custom", "week", "month", "year"]),
            ),
            ("startDate", date()),
            ("endDate", date()),
            ("recurringEndDate", nullable(date())),
            ("repeat", cadence()),
            (
                "timezone",
                json!({"type":"string","description":"IANA timezone for civil dates","minLength":1,"maxLength":100}),
            ),
        ],
        &[
            "kind",
            "target",
            "discipline",
            "grade",
            "timeframe",
            "endDate",
            "repeat",
            "timezone",
        ],
    )
}
fn import_rows(api: &mut ApiSpec) -> Value {
    let mut rows = array(record([
        ("climbId", id()),
        ("gradeText", nullable(string())),
        ("ascentStyle", api.input_schema::<AscentStyle>()),
        ("dateSent", nullable(date())),
        ("comment", nullable(string())),
        ("rating", nullable(number())),
        ("gradeFeel", api.input_schema::<GradeFeel>()),
    ]));
    rows["maxItems"] = json!(50);
    rows
}
fn input(api: &mut ApiSpec, action: Action) -> Value {
    use Action::*;
    match action {
        UploadProfilePhoto => record([(
            "photo",
            json!({"type":"string","format":"binary","description":"JPEG, PNG or WebP, up to 3 MiB"}),
        )]),
        SubmitContactMessage => args([(
            "message",
            api.input_schema::<crate::routes::actions::ContactPayload>(),
        )]),
        AcceptTerms => args([("version", string()), ("agreed", json!({"const":true}))]),
        AcceptFriendRequest | CancelFriendRequest | DeclineFriendRequest | RemoveFriendship
        | RequestFriendship => args([("targetId", string())]),
        AcknowledgeGoalAchievements => {
            let mut keys = array(record([
                ("id", id()),
                ("periodStart", date()),
                ("repeat", cadence()),
            ]));
            keys["maxItems"] = json!(1000);
            args([("achievements", keys)])
        }
        AddClimbToList => args([("listId", id()), ("climbId", id())]),
        ApproveChangeRequest => args([("requestId", id())]),
        RejectChangeRequest => optional_last([("requestId", id()), ("note", nullable(string()))]),
        ArchiveGoal | DeleteGoal => args([("goalId", id())]),
        CopyClimbList => args([
            (
                "source",
                json!({"oneOf":[record([("listId",id())]),record([("token",string())])]}),
            ),
            (
                "list",
                api.input_schema::<betabook_domain::climb_lists::ListInput>(),
            ),
        ]),
        CreateClimbList => optional_last([
            (
                "list",
                api.input_schema::<betabook_domain::climb_lists::ListInput>(),
            ),
            ("options", object([("climbId", id())], &[])),
        ]),
        UpdateClimbList => args([
            ("listId", id()),
            (
                "list",
                api.input_schema::<betabook_domain::climb_lists::ListInput>(),
            ),
        ]),
        DeleteClimbList | UnshareClimbList => args([("listId", id())]),
        CreateArea => args([
            ("parentId", id()),
            ("area", form(api, "Area name and description")),
        ]),
        CreateClimb => args([
            ("areaId", id()),
            (
                "climb",
                form(api, "Climb name, discipline, grade and description"),
            ),
        ]),
        CreateUndatedSend => args([(
            "send",
            form(
                api,
                "Climb ID, ascent style, suggested grade, grade feel, rating, comment and videos",
            ),
        )]),
        CreateJournalEntry => args([(
            "entry",
            form(
                api,
                "Kind, entryDate, climbId, sent, body, tags, companions and send details",
            ),
        )]),
        DeleteJournalEntry | RemoveMyJournalTag => args([("entryId", id())]),
        DeleteSend => args([("sendId", id())]),
        DeleteTrip | RemoveMyTripTag | UnshareTrip => args([("tripId", id())]),
        DismissFeatureAnnouncement => args([("featureId", string())]),
        GetSendEditorData => args([(
            "target",
            json!({"oneOf":[record([("sendId",id())]),record([("entryId",id())])]}),
        )]),
        ImportSends => args([
            ("rows", import_rows(api)),
            (
                "options",
                object(
                    [
                        ("batchId", string()),
                        ("expectedOwnerId", string()),
                        ("gradeScale", enumeration(&["native", "converted"])),
                        ("onConflict", enumeration(&["skip", "overwrite"])),
                    ],
                    &["gradeScale", "onConflict"],
                ),
            ),
        ]),
        PinProject | UnpinProject | UnshareProject | RequestClimbDelete => {
            args([("climbId", id())])
        }
        MarkNotificationsRead => args([("seenThrough", number())]),
        RemoveProfilePhoto | ResetProfileShareLink => args([]),
        RequestAreaEdit | UpdateArea => args([
            ("areaId", id()),
            ("area", form(api, "Area name and/or description")),
        ]),
        RequestAreaDelete => args([("areaId", id())]),
        RequestAreaReparent => args([("areaId", id()), ("newParentId", id())]),
        RequestClimbBreak => args([
            ("climbId", id()),
            (
                "report",
                form(api, "Broken-on date, reason and proposed successor details"),
            ),
        ]),
        RequestClimbEdit | UpdateClimb => args([
            ("climbId", id()),
            (
                "climb",
                form(api, "Climb name, discipline, grade or description"),
            ),
        ]),
        RequestClimbMerge => optional_last([
            ("sourceClimbId", id()),
            ("targetClimbId", id()),
            (
                "overrides",
                object(
                    [
                        ("name", string()),
                        ("grade", number()),
                        ("description", nullable(string())),
                    ],
                    &[],
                ),
            ),
        ]),
        RequestClimbMove => args([("climbId", id()), ("newAreaId", id())]),
        ResolveImportClimbs => args([("names", array(string()))]),
        ResolveImportClimbsInAreas => args([(
            "pairs",
            array(record([("name", string()), ("areaName", string())])),
        )]),
        SaveAnalyticsLayout => args([(
            "layout",
            api.input_schema::<betabook_domain::analytics_layout::Layout>(),
        )]),
        SaveClimbListEdits => args([("listId", id()), ("climbIds", array(id()))]),
        SaveGoal => optional_last([
            ("id", nullable(id())),
            ("goal", goal(api)),
            ("retryOf", id()),
        ]),
        SaveProductTourStatus => args([
            ("id", string()),
            ("version", number()),
            ("status", api.input_schema::<TourStatus>()),
        ]),
        SaveTrip => args([
            ("id", nullable(id())),
            (
                "trip",
                api.input_schema::<betabook_domain::trips::TripInput>(),
            ),
        ]),
        SaveTripNotes => args([("tripId", id()), ("notes", string())]),
        SavePushSubscription => args([(
            "subscription",
            record([
                ("endpoint", string()),
                ("p256dh", string()),
                ("auth", string()),
            ]),
        )]),
        DeletePushSubscription => args([("endpoint", string())]),
        SetClimbListVisibility | SetJournalVisibility | SetTripVisibility => {
            args([("visibility", enumeration(&["public", "friends", "private"]))])
        }
        SetSendCommentVisibility => args([(
            "visibility",
            enumeration(&["everyone", "public", "friends", "private"]),
        )]),
        SetGradePreferences => args([("scales", grade_preferences())]),
        SetSendAlertPreferences => args([(
            "preferences",
            record([("shareWithFriends", boolean()), ("receive", boolean())]),
        )]),
        SetUserPrivate => args([("isPrivate", boolean())]),
        ShareClimbList | ShareProject | ShareTrip => args([
            ("id", id()),
            ("expiry", enumeration(&["7d", "30d", "6mo", "never"])),
        ]),
        UpdateDisplayName => args([(
            "profile",
            form(api, "The member's display name (name field)"),
        )]),
        UpdateJournalEntry => args([
            ("entryId", id()),
            (
                "entry",
                form(api, "Updated date, body, tags, companions and send details"),
            ),
        ]),
        UpdateSend => args([
            ("sendId", id()),
            (
                "send",
                form(
                    api,
                    "Edited ascent style, date, grade, rating, comment and videos",
                ),
            ),
        ]),
    }
}

fn candidate(api: &mut ApiSpec) -> Value {
    record([
        ("id", id()),
        ("name", string()),
        ("key", string()),
        ("areaId", id()),
        ("areaName", string()),
        ("type", api.schema::<ClimbType>()),
        ("grade", nullable(number())),
        ("sendCount", number()),
        ("brokenOn", nullable(date())),
        ("total", number()),
        (
            "ancestors",
            array(record([("id", id()), ("name", string())])),
        ),
    ])
}

fn result(api: &mut ApiSpec, action: Action) -> Value {
    use Action::*;
    let value = match action {
        GetSendEditorData => Some(record([
            ("send", api.schema::<EditableSend>()),
            ("entry", nullable(api.schema::<JournalEntry>())),
            (
                "climb",
                record([
                    ("id", id()),
                    ("areaId", id()),
                    ("type", api.schema::<ClimbType>()),
                    ("grade", nullable(number())),
                    ("brokenOn", nullable(date())),
                ]),
            ),
        ])),
        AcceptFriendRequest | CancelFriendRequest | DeclineFriendRequest | RemoveFriendship
        | RequestFriendship => Some(api.schema::<FriendshipStatus>()),
        AddClimbToList => Some(record([("changed", boolean()), ("climbCount", number())])),
        ApproveChangeRequest => Some(record([(
            "decision",
            enumeration(&["applied", "awaiting"]),
        )])),
        CreateArea | CreateClimb | SaveGoal | SaveTrip => Some(id()),
        CopyClimbList | CreateClimbList => Some(record([("id", id()), ("title", string())])),
        ImportSends => Some(object(
            [
                ("imported", number()),
                ("overwritten", number()),
                ("alreadyLogged", number()),
                ("missing", array(number())),
                ("broken", array(number())),
            ],
            &["imported", "overwritten", "alreadyLogged", "missing"],
        )),
        RequestAreaDelete | RequestAreaEdit | RequestAreaReparent | RequestClimbBreak
        | RequestClimbDelete | RequestClimbEdit | RequestClimbMerge | RequestClimbMove => {
            Some(record([("status", enumeration(&["pending", "applied"]))]))
        }
        ResolveImportClimbs | ResolveImportClimbsInAreas => Some(array(candidate(api))),
        ShareClimbList | ShareProject | ShareTrip => Some(record([
            ("token", string()),
            ("expiresAt", nullable(string())),
        ])),
        AcceptTerms
        | AcknowledgeGoalAchievements
        | ArchiveGoal
        | CreateJournalEntry
        | CreateUndatedSend
        | DeleteClimbList
        | DeleteGoal
        | DeleteJournalEntry
        | DeletePushSubscription
        | DeleteSend
        | DeleteTrip
        | DismissFeatureAnnouncement
        | MarkNotificationsRead
        | PinProject
        | RejectChangeRequest
        | RemoveMyJournalTag
        | RemoveMyTripTag
        | RemoveProfilePhoto
        | ResetProfileShareLink
        | SaveAnalyticsLayout
        | SaveClimbListEdits
        | SaveProductTourStatus
        | SavePushSubscription
        | SaveTripNotes
        | SetClimbListVisibility
        | SetGradePreferences
        | SetJournalVisibility
        | SetSendAlertPreferences
        | SetSendCommentVisibility
        | SetTripVisibility
        | SetUserPrivate
        | SubmitContactMessage
        | UnpinProject
        | UnshareClimbList
        | UnshareProject
        | UnshareTrip
        | UpdateArea
        | UpdateClimb
        | UpdateClimbList
        | UpdateDisplayName
        | UpdateJournalEntry
        | UpdateSend
        | UploadProfilePhoto => None,
    };
    let yes = json!({"type":"boolean","const":true});
    let success = match value {
        Some(v) => record([("ok", yes), ("value", v)]),
        None => record([("ok", yes)]),
    };
    let mut failure = record([
        ("ok", json!({"type":"boolean","const":false})),
        ("error", string()),
    ]);
    if action == ImportSends {
        failure["properties"]["outcome"] = json!({"type":"string","const":"unknown","description":"The batch may already have committed. Retry with the same batchId."});
    }
    json!({"oneOf":[success,failure]})
}

pub(super) fn register(api: &mut ApiSpec) {
    for &action in Action::ALL {
        let name = action.name();
        let path = format!("/api/actions/{name}");
        let request = input(api, action);
        let response = result(api, action);
        let content = if action == Action::UploadProfilePhoto {
            json!({"multipart/form-data": {"schema":request, "encoding":{"photo":{"contentType":"image/jpeg, image/png, image/webp"}}}})
        } else {
            json!({"application/json":{"schema":request}})
        };
        let security = if action == Action::SubmitContactMessage {
            json!([])
        } else {
            json!([{"session":[]}])
        };
        api.operation(&path,"post",json!({
            "operationId":name,
            "security":security,
            "requestBody":{"required":true,"content":content},
            "responses":{
                "200":{"description":"Action success or a handled validation or permission error","content":{"application/json":{"schema":response}}},
                "default":{"$ref":"#/components/responses/Error"}
            }
        }));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn action_spec_matches_dispatch_and_transport() -> Result<(), String> {
        let doc = super::super::document()?;
        let paths = doc["paths"].as_object().ok_or("expected paths")?;
        assert_eq!(
            paths
                .keys()
                .filter(|path| path.starts_with("/api/actions/"))
                .count(),
            Action::ALL.len()
        );
        for action in Action::ALL {
            let name = action.name();
            assert!(Action::parse(name) == Some(*action));
            let operation = &paths[&format!("/api/actions/{name}")]["post"];
            assert_eq!(operation["operationId"], name);
            let content = &operation["requestBody"]["content"];
            if *action == Action::UploadProfilePhoto {
                assert_eq!(
                    content["multipart/form-data"]["schema"]["required"],
                    json!(["photo"])
                );
                assert!(content["application/json"].is_null());
            } else {
                assert_eq!(
                    content["application/json"]["schema"]["required"],
                    json!(["args"])
                );
            }
            assert_eq!(
                operation["security"],
                if *action == Action::SubmitContactMessage {
                    json!([])
                } else {
                    json!([{"session":[]}])
                }
            );
        }
        Ok(())
    }
}
