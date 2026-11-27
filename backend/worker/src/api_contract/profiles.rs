use super::ApiSpec;
use crate::routes::profile_payloads::{
    JournalResponse, JournalWorkspace, ProfilePage, SendsResponse, SendsWorkspace,
};
use betabook_db::sends::UserSendsExportPage;
use serde_json::json;

pub(super) fn register(api: &mut ApiSpec) {
    macro_rules! get {
        ($path:literal,$id:literal,$ty:ty) => {{
            let schema = api.schema::<$ty>();
            api.get($path, $id, schema);
        }};
    }
    get!("/api/pages/users/{id}", "getProfilePage", ProfilePage);
    get!(
        "/api/pages/users/{id}/journal",
        "getJournalWorkspace",
        JournalWorkspace
    );
    get!(
        "/api/pages/users/{id}/sends",
        "getSendsWorkspace",
        SendsWorkspace
    );
    get!("/api/users/{id}/journal", "getUserJournal", JournalResponse);
    get!("/api/users/{id}/sends", "getUserSends", SendsResponse);
    get!(
        "/api/users/{id}/sends/export",
        "exportUserSends",
        UserSendsExportPage
    );
    api.query(
        "/api/pages/users/{id}",
        "get",
        "share",
        json!({"type":"string"}),
        false,
    );
    for path in [
        "/api/pages/users/{id}",
        "/api/pages/users/{id}/journal",
        "/api/pages/users/{id}/sends",
        "/api/users/{id}/journal",
        "/api/users/{id}/sends",
    ] {
        for key in ["date", "dateFrom", "dateTo"] {
            api.query(path, "get", key, json!({"type":"string"}), false);
        }
        api.query(
            path,
            "get",
            "tag",
            json!({"type":"array","items":{"type":"string"}}),
            false,
        );
    }
    for path in [
        "/api/pages/users/{id}",
        "/api/pages/users/{id}/journal",
        "/api/users/{id}/journal",
    ] {
        for key in ["q", "view"] {
            api.query(path, "get", key, json!({"type":"string"}), false);
        }
        for key in ["climbId", "year"] {
            api.query(path, "get", key, json!({"type":"integer"}), false);
        }
        api.query(path,"get","friendId",json!({"type":"array","items":{"type":"string"},"description":"Companion filters on the owner's own journal"}),false);
    }
    for path in [
        "/api/pages/users/{id}",
        "/api/pages/users/{id}/sends",
        "/api/users/{id}/sends",
    ] {
        for key in ["sort", "name", "areaName"] {
            api.query(path, "get", key, json!({"type":"string"}), false);
        }
        for key in ["areaId", "minRating", "maxRating"] {
            api.query(path, "get", key, json!({"type":"integer"}), false);
        }
        for key in ["discipline", "ascentStyle"] {
            api.query(
                path,
                "get",
                key,
                json!({"type":"array","items":{"type":"string"}}),
                false,
            );
        }
        for key in ["boulderRange", "sportRange", "tradRange"] {
            api.query(
                path,
                "get",
                key,
                json!({"type":"array","items":{"type":"integer"}}),
                false,
            );
        }
    }
    for key in ["cursorDate", "cursorId"] {
        api.query(
            "/api/users/{id}/journal",
            "get",
            key,
            json!({"type":"string"}),
            false,
        );
    }
    api.query(
        "/api/users/{id}/sends",
        "get",
        "offset",
        json!({"type":"integer","minimum":0}),
        false,
    );
    for key in ["afterDate", "afterId"] {
        api.query(
            "/api/users/{id}/sends/export",
            "get",
            key,
            json!({"type":"string"}),
            false,
        );
    }
}
