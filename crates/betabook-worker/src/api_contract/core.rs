//! Wire objects for core JSON endpoints and representation metadata for streams/downloads.
//! Row types come directly from the serializer used by the Worker.
#![allow(
    dead_code,
    reason = "Envelope fields describe JSON rendered by the route handlers"
)]

use std::collections::BTreeMap;

use betabook_db::{
    auth::AuthSession,
    feed::FeedPage,
    journal::JournalEntry,
    member_catalog::{AreaWithSubtreeSize, ClimbRecord, GradeHistogramRow},
    sends::{ClimbSendSummary, ClimbSendsPage, EditableSend},
    social::{
        ClimbSendStats, ClimbVideos, ClimbersPage, CompanionOption, FriendsPage, ProductTourState,
        SuggestedClimberRow,
    },
};
use betabook_domain::{grades::GradePreferences, public_catalog::*};
use schemars::JsonSchema;
use serde_json::json;

use super::ApiSpec;
use crate::auth::routes::*;
use crate::routes::import_sources::KayaAscent;

macro_rules! envelope {
    ($name:ident { $($field:ident : $ty:ty),* $(,)? })=>{
        #[derive(JsonSchema)]
        #[schemars(rename_all="camelCase")]
        struct $name { $($field:$ty),* }
    }
}

envelope!(AuthConfig { google_enabled:bool,turnstile_site_key:Option<String> });
envelope!(TermsStatus {user_id:Option<String>,required:bool,version:String,version_label:String,previous_version:Option<String>});
envelope!(AuthBasicUser {
    id: String,
    email: String,
    name: String,
    email_verified: bool
});
envelope!(AuthLoginUser { id:String,email:String,name:String,email_verified:bool, image:Option<String>, role:Option<String> });
envelope!(SignInResult {
    redirect: bool,
    token: String,
    user: AuthLoginUser
});
envelope!(SignUpResult {
    token: (),
    user: AuthBasicUser
});
envelope!(SocialRedirect {
    url: String,
    redirect: bool
});
envelope!(AuthStatus { status: bool });
envelope!(AuthSuccess { success: bool });
envelope!(TermsAccepted { ok: bool });
envelope!(CatalogSnapshot { schema_version:u32, generated_at:String, areas:Vec<betabook_db::catalog_export::CatalogAreaRow>, climbs:Vec<betabook_db::catalog_export::ExportClimbItem<'static>> });
envelope!(UsageReport {
    period_start: String,
    period_end: String,
    worker_requests: f64,
    worker_cpu_ms: f64,
    d1_rows_read: f64
});

type Breadcrumbs = BTreeMap<i64, Vec<AreaBreadcrumbItem>>;
envelope!(PublicAreaPage {area:PublicAreaDetails, ancestors:Vec<PublicAreaDetails>,trail:Vec<PublicAreaDetails>,subareas:Vec<PublicArea>});
envelope!(PublicClimbPage {climb:PublicClimb,area:Option<PublicAreaDetails>,ancestors:Vec<PublicAreaDetails>,trail:Vec<PublicAreaDetails>,public_sends:Vec<PublicClimbSend>,videos:ClimbVideos});
envelope!(MemberClimbs {climbs:Vec<PublicClimb>,has_next_page:bool,send_stats:BTreeMap<i64,ClimbSendStats>,area_breadcrumbs:Breadcrumbs,sent_climb_ids:Vec<i64>});
envelope!(MemberAreas {areas:Vec<PublicAreaResult>,has_next_page:bool,area_breadcrumbs:Breadcrumbs});
envelope!(MemberAreaPage {area:AreaWithSubtreeSize,ancestors:Vec<PublicAreaDetails>,subareas:Vec<PublicArea>,grade_histogram_rows:Vec<GradeHistogramRow>,climbs_page:MemberClimbs});
envelope!(MemberClimbPage {climb:ClimbRecord,area:Option<PublicAreaDetails>,ancestors:Vec<PublicAreaDetails>,user_send:Option<EditableSend>,summary:ClimbSendSummary,journal_entries:Vec<JournalEntry>,videos:ClimbVideos,sends_page:ClimbSendsPage});
envelope!(AreaChoice {
    id: i64,
    name: String,
    ancestor_path: String
});
envelope!(NewClimbPage {selected_area:Option<AreaChoice>});
envelope!(PendingFriendCount {
    user_id: String,
    count: i64
});
envelope!(FriendSuggestions {climbers:Vec<SuggestedClimberRow>});
envelope!(FriendCompanions {friends:Vec<CompanionOption>});
#[derive(JsonSchema)]
#[schemars(rename_all = "lowercase")]
enum FriendsView {
    Friends,
    Requests,
}
#[derive(JsonSchema)]
#[schemars(rename_all = "lowercase")]
enum FeedView {
    All,
    Sends,
}
envelope!(MemberFeedPage {
    view: FeedView,
    page: FeedPage,
    has_friends: bool
});
envelope!(MemberFriendsPage {view:FriendsView,page:FriendsPage,suggestions:Option<Vec<SuggestedClimberRow>>});
#[derive(JsonSchema)]
#[schemars(rename_all = "lowercase")]
enum SharingAudience {
    Private,
    Friends,
    Public,
}
#[derive(JsonSchema)]
#[schemars(rename_all = "lowercase")]
enum CommentAudience {
    Private,
    Friends,
    Public,
    Everyone,
}
envelope!(AccountIdentity {id:String,name:String,email:String,image:Option<String>});
envelope!(CatalogExportInfo {
    generated_at: String,
    area_count: u64,
    climb_count: u64,
    size: u64
});
envelope!(AccountPage {user:AccountIdentity,is_private:bool,journal_visibility:SharingAudience,send_comment_visibility:CommentAudience,trip_visibility:SharingAudience,climb_list_visibility:SharingAudience,grade_preferences:GradePreferences,share_url:Option<String>,turnstile_site_key:Option<String>,catalog_export:Option<CatalogExportInfo>,is_admin:bool});
envelope!(ReviewPerson {name:String,image:Option<String>});
envelope!(ReviewApprover {id:String,name:String,image:Option<String>});
envelope!(ReviewDescription {href:String,summary:String,requester_summary:String,details:Vec<String>});
envelope!(ReviewQueueRow{id:i64,requested_at:i64,description:ReviewDescription,requester:Option<ReviewPerson>,already_approved:bool,approvers:Vec<ReviewApprover>,missing_area_names:Vec<String>});
envelope!(ReviewQueue {managed_areas:Vec<AreaBreadcrumbItem>,rows:Vec<ReviewQueueRow>,next_href:Option<String>,has_previous:bool});

#[derive(JsonSchema)]
#[schemars(rename_all = "lowercase")]
enum ErrorBoundary {
    Page,
    Global,
}
envelope!(ClientErrorReport{boundary:ErrorBoundary,digest:Option<String>,message:String,path:String});

#[derive(JsonSchema)]
#[schemars(rename_all = "kebab-case")]
enum KayaRetryReason {
    RateLimit,
    Unavailable,
}
#[derive(JsonSchema)]
#[schemars(tag = "type", rename_all = "lowercase")]
enum KayaStreamEvent {
    Heartbeat,
    Profile {
        username: String,
    },
    Page {
        items: Vec<KayaAscent>,
        total: u64,
    },
    Retry {
        attempt: u8,
        #[schemars(rename = "delayMs")]
        delay_ms: u64,
        reason: KayaRetryReason,
    },
    Complete {
        total: u64,
    },
    Error {
        error: String,
    },
}
fn redirect(api: &mut ApiSpec, path: &str, id: &str) {
    api.operation(path,"get",json!({"operationId":id,"responses":{
        "302":{"description":"Return the browser to the validated application callback",
               "headers":{"Location":{"schema":{"type":"string"}}, "Set-Cookie":{"schema":{"type":"string"}}}},
        "default":{"$ref":"#/components/responses/Error"}
    }}));
}

fn catalog_query(api: &mut ApiSpec, path: &str, member: bool, climbs: bool) {
    let string = json!({"type":"string"});
    let array = json!({"type":"array","items":{"type":"string"}});
    let integer = json!({"type":"integer"});
    for name in ["name", "sort"] {
        api.query(path, "get", name, string.clone(), false);
    }
    for name in ["page", "offset", "limit", "areaId", "subarea"] {
        api.query(path, "get", name, integer.clone(), false);
    }
    api.query(path, "get", "areaName", string.clone(), false);
    if climbs {
        for name in [
            "discipline",
            "boulderRange",
            "sportRange",
            "tradRange",
            "ratingRange",
        ] {
            api.query(path, "get", name, array.clone(), false);
        }
        api.query(path, "get", "minAscents", integer, false);
        if member {
            api.query(
                path,
                "get",
                "excludeSent",
                json!({"enum":["1","true","0","false"]}),
                false,
            );
        }
    }
}

pub(super) fn register(api: &mut ApiSpec) {
    macro_rules! get {
        ($path:literal,$id:literal,$ty:ty) => {{
            let response = api.schema::<$ty>();
            api.get($path, $id, response);
        }};
    }
    macro_rules! post {
        ($path:literal,$id:literal,$input:ty,$out:ty) => {{
            let body = api.input_schema::<$input>();
            let response = api.schema::<$out>();
            api.post($path, $id, body, response);
        }};
    }
    get!("/api/health", "health", crate::HealthResponse);
    get!("/api/public/usage", "usage", Option<UsageReport>);
    get!("/api/config/auth", "authConfig", AuthConfig);
    get!("/api/auth/get-session", "getSession", Option<AuthSession>);
    post!(
        "/api/auth/sign-up/email",
        "signUpEmail",
        SignUpEmailBody,
        SignUpResult
    );
    post!(
        "/api/auth/sign-in/email",
        "signInEmail",
        SignInEmailBody,
        SignInResult
    );
    post!(
        "/api/auth/send-verification-email",
        "sendVerificationEmail",
        SendVerificationBody,
        AuthStatus
    );
    post!(
        "/api/auth/request-password-reset",
        "requestPasswordReset",
        RequestPasswordResetBody,
        AuthStatus
    );
    post!(
        "/api/auth/reset-password",
        "resetPassword",
        ResetPasswordBody,
        AuthStatus
    );
    post!(
        "/api/auth/sign-in/social",
        "socialSignIn",
        SocialSignInBody,
        SocialRedirect
    );
    for (path, id) in [
        ("/api/auth/sign-out", "signOut"),
        ("/api/auth/delete-user", "deleteUser"),
    ] {
        let response = api.schema::<AuthSuccess>();
        api.operation(path,"post",json!({"operationId":id,"responses":{"200":{"description":"Success","content":{"application/json":{"schema":response}}},"default":{"$ref":"#/components/responses/Error"}}}));
    }
    redirect(api, "/api/auth/verify-email", "verifyEmail");
    redirect(api, "/api/auth/reset-password/{token}", "legacyResetLink");
    redirect(api, "/api/auth/callback/google", "googleCallback");
    for (path, names) in [
        ("/api/auth/verify-email", &["token", "callbackURL"][..]),
        ("/api/auth/reset-password/{token}", &["callbackURL"]),
        ("/api/auth/callback/google", &["state", "code", "error"]),
    ] {
        for name in names {
            api.query(path, "get", name, json!({"type":"string"}), false);
        }
    }
    get!("/api/terms/status", "termsStatus", TermsStatus);
    post!(
        "/api/terms/accept",
        "acceptTermsHttp",
        AcceptTermsBody,
        TermsAccepted
    );

    get!(
        "/api/public/search/areas",
        "searchPublicAreas",
        PublicAreasPage
    );
    get!(
        "/api/public/search/climbs",
        "searchPublicClimbs",
        PublicClimbsPage
    );
    get!("/api/public/areas/{id}", "getPublicArea", PublicAreaPage);
    get!(
        "/api/public/areas/{id}/climbs",
        "publicAreaClimbs",
        PublicClimbsPage
    );
    get!("/api/public/climbs/{id}", "getPublicClimb", PublicClimbPage);
    get!("/api/search/climbs", "searchMemberClimbs", MemberClimbs);
    get!("/api/search/areas", "searchMemberAreas", MemberAreas);
    get!("/api/search/climbers", "searchClimbers", ClimbersPage);
    let member_climbs = api.schema::<MemberClimbs>();
    api.get("/api/areas/{id}/climbs","memberAreaClimbs",json!({"allOf":[member_climbs,{"type":"object","properties":{"page":{"type":"integer"},"pageSize":{"type":"integer"}}}]}));
    get!("/api/climbs/{id}/sends", "climbSends", ClimbSendsPage);
    get!("/api/pages/areas/{id}", "memberAreaPage", MemberAreaPage);
    get!("/api/pages/climbs/{id}", "memberClimbPage", MemberClimbPage);
    get!("/api/pages/climbs/new", "newClimbPage", NewClimbPage);
    api.query(
        "/api/pages/climbs/new",
        "get",
        "areaId",
        json!({"type":"integer"}),
        false,
    );
    for (path, member, climbs) in [
        ("/api/public/search/areas", false, false),
        ("/api/public/search/climbs", false, true),
        ("/api/public/areas/{id}/climbs", false, true),
        ("/api/search/climbs", true, true),
        ("/api/search/areas", true, false),
        ("/api/areas/{id}/climbs", true, true),
        ("/api/pages/areas/{id}", true, true),
    ] {
        catalog_query(api, path, member, climbs);
    }
    api.query(
        "/api/search/climbers",
        "get",
        "name",
        json!({"type":"string"}),
        false,
    );
    api.query(
        "/api/search/climbers",
        "get",
        "offset",
        json!({"type":"integer"}),
        false,
    );
    api.query(
        "/api/climbs/{id}/sends",
        "get",
        "offset",
        json!({"type":"integer"}),
        false,
    );
    let page = api.schema::<FriendsPage>();
    let count = api.schema::<PendingFriendCount>();
    api.get("/api/friends", "friends", json!({"oneOf":[page,count]}));
    api.query(
        "/api/friends",
        "get",
        "view",
        json!({"enum":["count","requests","friends","all"]}),
        false,
    );
    api.query(
        "/api/friends",
        "get",
        "offset",
        json!({"type":"integer"}),
        false,
    );
    get!(
        "/api/friends/suggestions",
        "friendSuggestions",
        FriendSuggestions
    );
    get!(
        "/api/friends/companions",
        "friendCompanions",
        FriendCompanions
    );
    api.query(
        "/api/friends/companions",
        "get",
        "q",
        json!({"type":"string"}),
        false,
    );
    get!("/api/feed", "feed", FeedPage);
    get!("/api/pages/feed", "feedPage", MemberFeedPage);
    for path in ["/api/feed", "/api/pages/feed"] {
        api.query(path, "get", "view", json!({"enum":["all","sends"]}), false);
    }
    api.query(
        "/api/feed",
        "get",
        "cursor",
        json!({"type":"string"}),
        false,
    );
    get!("/api/pages/friends", "friendsPage", MemberFriendsPage);
    api.query(
        "/api/pages/friends",
        "get",
        "view",
        json!({"enum":["requests","friends"]}),
        false,
    );
    get!("/api/pages/account", "accountPage", AccountPage);
    get!("/api/pages/tutorial", "tutorialProgress", ProductTourState);
    get!("/api/pages/admin/requests", "reviewQueue", ReviewQueue);
    for name in ["after", "at"] {
        api.query(
            "/api/pages/admin/requests",
            "get",
            name,
            json!({"type":"integer"}),
            false,
        );
    }

    let report = api.input_schema::<ClientErrorReport>();
    api.operation("/api/client-errors","post",json!({"operationId":"reportClientError","requestBody":{"required":true,"content":{"application/json":{"schema":report}}},
        "responses":{"204":{"description":"Report accepted"},"400":{"description":"Invalid report"},"403":{"description":"Invalid origin"},"413":{"description":"Report too large"},"429":{"description":"Rate limited"}}}));

    api.operation("/api/avatars/{key}","get",json!({"operationId":"avatar","parameters":[{"in":"header","name":"If-None-Match","schema":{"type":"string"}}],"responses":{
        "200":{"description":"Avatar image","headers":{"ETag":{"schema":{"type":"string"}}},"content":{"image/webp":{"schema":{"type":"string","format":"binary"}}}},
        "304":{"description":"Unchanged"},"404":{"description":"Avatar unavailable"} }}));
    let snapshot = api.schema::<CatalogSnapshot>();
    api.operation("/api/catalog/export","get",json!({"operationId":"catalogExport","security":[{"session":[]}],"responses":{
        "200":{"description":"Stream the most recent catalog snapshot","headers":{"Content-Disposition":{"schema":{"type":"string"}}},"content":{"application/json":{"schema":snapshot}}},
        "default":{"$ref":"#/components/responses/Error"}}}));
    let event = api.schema::<KayaStreamEvent>();
    api.operation("/api/import/kaya","get",json!({"operationId":"kayaImport","security":[{"session":[]}],"responses":{"200":{"description":"One JSON event per line","content":{"application/x-ndjson":{"schema":{"type":"string","x-event-schema":event}}}},"default":{"$ref":"#/components/responses/Error"}}}));
    api.query(
        "/api/import/kaya",
        "get",
        "username",
        json!({"type":"string"}),
        true,
    );
    api.query(
        "/api/import/kaya",
        "get",
        "climbTypeId",
        json!({"enum":["1","2"]}),
        true,
    );
    api.operation("/api/import/mountain-project","get",json!({"operationId":"mountainProjectImport","security":[{"session":[]}],"responses":{"200":{"description":"Tick export CSV","headers":{"X-Mountain-Project-User":{"schema":{"type":"string"}}},"content":{"text/csv":{"schema":{"type":"string"}}}},"default":{"$ref":"#/components/responses/Error"}}}));
    api.query(
        "/api/import/mountain-project",
        "get",
        "userId",
        json!({"type":"string"}),
        true,
    );
    describe_auth_headers(api);
}

fn describe_auth_headers(api: &mut ApiSpec) {
    const PATHS: &[(&str, &str)] = &[
        ("/api/auth/get-session", "get"),
        ("/api/auth/verify-email", "get"),
        ("/api/auth/reset-password/{token}", "get"),
        ("/api/auth/callback/google", "get"),
        ("/api/auth/sign-up/email", "post"),
        ("/api/auth/sign-in/email", "post"),
        ("/api/auth/sign-in/social", "post"),
        ("/api/auth/request-password-reset", "post"),
        ("/api/auth/reset-password", "post"),
        ("/api/auth/send-verification-email", "post"),
        ("/api/auth/sign-out", "post"),
        ("/api/auth/delete-user", "post"),
    ];
    for &(path, method) in PATHS {
        let operation = &mut api.paths[path][method];
        let parameters = operation["parameters"]
            .as_array_mut()
            .expect("registered auth operation");
        if method == "post" {
            parameters.push(json!({"in":"header","name":"Origin","required":false,"schema":{"type":"string"},
                "description":"Browser writes with cookies or Fetch Metadata must supply a trusted Origin or Referer."}));
            parameters.push(json!({"in":"header","name":"Referer","required":false,"schema":{"type":"string","format":"uri"},"description":"Used for the origin check when Origin is absent."}));
        }
        if matches!(
            path,
            "/api/auth/sign-up/email"
                | "/api/auth/sign-in/email"
                | "/api/auth/request-password-reset"
        ) {
            parameters.push(json!({"in":"header","name":"X-Captcha-Response","required":false,"schema":{"type":"string"},
                "description":"Turnstile token when the deployment enables CAPTCHA; captchaToken in the JSON body is also supported."}));
        }
        operation["responses"]["429"] = json!({
            "description":"Production authentication rate limit reached",
            "headers":{"X-Retry-After":{"schema":{"type":"integer","minimum":1}},"Retry-After":{"schema":{"type":"integer","minimum":1}}},
            "content":{"application/json":{"schema":{"type":"object","required":["message"],"properties":{"message":{"type":"string"}}}}}
        });
        if matches!(
            path,
            "/api/auth/get-session"
                | "/api/auth/sign-in/email"
                | "/api/auth/sign-in/social"
                | "/api/auth/sign-out"
                | "/api/auth/delete-user"
        ) {
            operation["responses"]["200"]["headers"]["Set-Cookie"] = json!({"schema":{"type":"string"},"description":"Creates, refreshes or clears an HTTP-only session or OAuth state cookie, as applicable."});
        }
    }
}
#[cfg(test)]
mod tests {
    use super::super::document;
    #[test]
    fn describes_conditionally_required_auth_headers_and_sparse_upstream_rows() {
        let spec = document(false).expect("document");
        let login = &spec["paths"]["/api/auth/sign-in/email"]["post"];
        assert!(
            login["parameters"]
                .as_array()
                .expect("headers")
                .iter()
                .any(|p| p["name"] == "X-Captcha-Response")
        );
        assert!(login["responses"]["429"]["headers"]["X-Retry-After"].is_object());
        assert!(spec["paths"]["/api/auth/get-session"]["get"]["responses"]["200"]["headers"]["Set-Cookie"].is_object());
        let row = &spec["components"]["schemas"]["KayaAscent"];
        assert!(row["properties"]["id"].is_object());
        assert!(
            row.get("required")
                .is_none_or(|v| v.as_array().is_some_and(Vec::is_empty))
        );
    }
}
