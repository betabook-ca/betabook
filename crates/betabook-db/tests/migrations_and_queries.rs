use std::path::Path;

use betabook_db::auth::{
    CreateCredentialUser, SessionRecord, VerificationRow, claim_welcome_email_once, create_session,
    create_user_with_credential, create_verification, delete_account_and_cleanup,
    find_credential_password_by_user_id, find_user_by_email, find_valid_verification,
    get_session_by_token, get_share_link_owner, get_terms_acceptance, get_user_id_by_name_nocase,
    insert_friend_request, mark_email_verified, record_terms_acceptance,
    reset_credential_password_and_revoke_sessions, unique_display_name,
};
use betabook_db::catalog_export::{get_catalog_counts, stream_catalog_export_parts};
use betabook_db::executor::{DbError, DbExecutor, DbParam};
use betabook_db::public_catalog::{
    get_public_area, get_public_area_trail, get_public_climb, get_public_sends_for_climb,
    get_public_subareas, resolve_public_subarea, search_public_areas, search_public_climbs,
};
use betabook_db::sqlite::SqliteDb;
use betabook_domain::grades::ClimbType;
use betabook_domain::password::{hash_password, verify_password};
use betabook_domain::public_catalog::parse_public_catalog_options;
use betabook_domain::terms::{TERMS_VERSION, has_accepted_current_terms};

fn run_async<F: std::future::Future>(fut: F) -> F::Output {
    let waker = std::task::Waker::noop();
    let mut cx = std::task::Context::from_waker(waker);
    let mut pinned = std::pin::pin!(fut);
    match pinned.as_mut().poll(&mut cx) {
        std::task::Poll::Ready(val) => val,
        std::task::Poll::Pending => panic!("sqlite test future yielded Pending unexpectedly"),
    }
}

#[expect(
    clippy::expect_used,
    reason = "migration failures must fail the test fixture"
)]
fn migrated_db() -> SqliteDb {
    let db = SqliteDb::in_memory().expect("in-memory sqlite");
    let migrations = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../drizzle/migrations");
    let count = db.apply_migrations(&migrations).expect("apply migrations");
    assert!(count >= 57, "expected at least 57 migrations, got {count}");
    db
}

#[test]
fn applies_all_migrations_and_enforces_triggers() {
    let db = migrated_db();
    run_async(async {
        db.execute(
            "INSERT INTO areas (id, parent_id, name) VALUES (1, NULL, 'Squamish'), (2, 1, 'Grand Wall')",
            &[],
        )
        .await
        .expect("insert areas");

        // Cycle guard rejects making Squamish a child of Grand Wall.
        let cycle_err = db
            .execute("UPDATE areas SET parent_id = 2 WHERE id = 1", &[])
            .await
            .expect_err("cycle guard should abort");
        assert!(cycle_err.to_string().contains("cycle"));

        // Grade-required trigger rejects null grade on climb insert.
        let null_grade_err = db
            .execute(
                "INSERT INTO climbs (area_id, name, type, grade) VALUES (2, 'Broken', 'boulder', NULL)",
                &[],
            )
            .await
            .expect_err("null grade should abort");
        assert!(null_grade_err.to_string().contains("grade"));

        db.execute(
            "INSERT INTO climbs (id, area_id, name, type, grade) VALUES (10, 2, 'Superfly', 'boulder', 10)",
            &[],
        )
        .await
        .expect("insert climb");

        // Create two users: one with 'everyone' commentary, one private.
        db.execute(
            "INSERT INTO user (id, name, email, is_private, send_comment_visibility)
             VALUES ('u1', 'Alice', 'alice@example.com', 0, 'everyone'),
                    ('u2', 'Bob', 'bob@example.com', 1, 'everyone')",
            &[],
        )
        .await
        .expect("insert users");

        // Boulder onsight trigger rejects 'onsight'.
        let onsight_err = db
            .execute(
                "INSERT INTO sends (user_id, climb_id, ascent_style, date_sent, suggested_grade)
                 VALUES ('u1', 10, 'onsight', '2026-09-01', 10)",
                &[],
            )
            .await
            .expect_err("boulder onsight should abort");
        assert!(onsight_err.to_string().contains("onsight"));

        db.execute(
            "INSERT INTO sends (user_id, climb_id, ascent_style, date_sent, comment, rating, suggested_grade)
             VALUES ('u1', 10, 'flash', '2026-09-02', 'Great crimp rail', 5, 10),
                    ('u2', 10, 'redpoint', '2026-09-03', 'Secret beta', 4, 10)",
            &[],
        )
        .await
        .expect("insert sends");

        // Public sends query keeps Alice's commentary and redacts private Bob's.
        let sends = get_public_sends_for_climb(&db, 10)
            .await
            .expect("public sends");
        assert_eq!(sends.len(), 2);
        let bob = &sends[0];
        assert_eq!(bob.user_name, None);
        assert_eq!(bob.comment, None);
        assert_eq!(bob.date_sent.as_deref(), Some("2026-09"));
        let alice = &sends[1];
        assert_eq!(alice.user_name.as_deref(), Some("Alice"));
        assert_eq!(alice.comment.as_deref(), Some("Great crimp rail"));
        assert_eq!(alice.date_sent.as_deref(), Some("2026-09-02"));

        // Verify aggregates updated by trigger.
        let climb = get_public_climb(&db, 10)
            .await
            .expect("get climb")
            .expect("climb exists");
        assert_eq!(climb.climb_type, ClimbType::Boulder);
        assert_eq!(climb.send_count, 2);
        assert_eq!(climb.avg_rating, Some(4.5));

        // Area trail, subareas, FTS5 search, and breadcrumbs.
        let trail = get_public_area_trail(&db, 2).await.expect("trail");
        assert_eq!(trail.len(), 2);
        assert_eq!(trail[0].name, "Squamish");
        assert_eq!(trail[1].name, "Grand Wall");

        let root = get_public_area(&db, 1)
            .await
            .expect("area")
            .expect("exists");
        let sub = resolve_public_subarea(
            &db,
            &betabook_domain::public_catalog::PublicArea {
                id: root.id,
                name: root.name.clone(),
                parent_id: root.parent_id,
            },
            Some(2),
        )
        .await
        .expect("subarea");
        assert_eq!(sub.id, 2);
        let subs = get_public_subareas(&db, 1).await.expect("subareas");
        assert_eq!(subs.len(), 1);

        let area_hits = search_public_areas(&db, &parse_public_catalog_options("name=grand"))
            .await
            .expect("search areas");
        assert_eq!(area_hits.areas.len(), 1);
        assert_eq!(
            area_hits.areas[0].ancestor_path.as_deref(),
            Some("Squamish")
        );

        let climb_hits = search_public_climbs(&db, &parse_public_catalog_options("name=super"))
            .await
            .expect("search climbs");
        assert_eq!(climb_hits.climbs.len(), 1);
        assert_eq!(climb_hits.climbs[0].name, "Superfly");

        // Streaming catalog export in small multipart chunks.
        let counts = get_catalog_counts(&db).await.expect("counts");
        assert_eq!(counts.area_count, 2);
        assert_eq!(counts.climb_count, 1);

        let mut assembled = Vec::new();
        let mut part_count = 0_usize;
        let summary = stream_catalog_export_parts(
            &db,
            counts,
            "2026-11-26T00:00:00.000Z",
            1,
            64,
            |_part_num, bytes| {
                part_count += 1;
                assembled.extend_from_slice(&bytes);
                async { Ok(()) }
            },
        )
        .await
        .expect("stream export");
        assert!(part_count > 1);
        assert_eq!(summary.size, assembled.len());
        let parsed: serde_json::Value = serde_json::from_slice(&assembled).expect("valid json");
        assert_eq!(parsed["climbs"][0]["gradeLabel"], "V9");
    });
}

#[test]
fn exercises_auth_queries_and_account_cleanup() {
    let db = migrated_db();
    run_async(async {
        let now = 1_787_000_000_000_i64;
        let hash = hash_password("secret-pass").expect("hash");
        create_user_with_credential(
            &db,
            &CreateCredentialUser {
                user_id: "user-1",
                account_id: "acct-1",
                name: "Alex Honnold",
                email: "alex@example.com",
                password_hash: &hash,
                terms_version: TERMS_VERSION,
                referred_by: None,
                now_ms: now,
            },
        )
        .await
        .expect("create user");

        // Case-insensitive name uniqueness lookup.
        assert_eq!(
            get_user_id_by_name_nocase(&db, "alex honnold")
                .await
                .expect("lookup"),
            Some("user-1".to_string())
        );
        assert_eq!(
            unique_display_name(&db, "Alex Honnold")
                .await
                .expect("unique name"),
            "Alex Honnold 2"
        );

        let stored = find_credential_password_by_user_id(&db, "user-1")
            .await
            .expect("cred")
            .expect("password");
        assert!(verify_password(&stored, "secret-pass"));

        let user = find_user_by_email(&db, "ALEX@EXAMPLE.COM")
            .await
            .expect("find email")
            .expect("exists");
        assert!(!user.email_verified);

        let ver = VerificationRow {
            id: "ver-1".to_string(),
            identifier: "email-verification:tok".to_string(),
            value: "user-1".to_string(),
            expires_at: now + 60_000,
        };
        create_verification(&db, &ver, now)
            .await
            .expect("create verification");
        assert!(
            find_valid_verification(&db, "email-verification:tok", now + 1000)
                .await
                .expect("find ver")
                .is_some()
        );
        mark_email_verified(&db, "user-1", now + 1000)
            .await
            .expect("verify email");
        assert!(
            claim_welcome_email_once(&db, "user-1", now + 1000)
                .await
                .expect("first welcome claim")
        );
        assert!(
            !claim_welcome_email_once(&db, "user-1", now + 2000)
                .await
                .expect("second welcome claim")
        );

        // Profile share link was issued by trigger 0041; another user can be referred.
        let token: String = db
            .query_one(
                "SELECT token FROM profile_share_links WHERE user_id = 'user-1'",
                &[],
            )
            .await
            .expect("query token")
            .expect("row")
            .get_string("token")
            .expect("token");
        let owner = get_share_link_owner(&db, &token)
            .await
            .expect("owner")
            .expect("exists");
        assert_eq!(owner.id, "user-1");

        create_user_with_credential(
            &db,
            &CreateCredentialUser {
                user_id: "user-2",
                account_id: "acct-2",
                name: "Lynn Hill",
                email: "lynn@example.com",
                password_hash: &hash,
                terms_version: TERMS_VERSION,
                referred_by: Some("user-1"),
                now_ms: now,
            },
        )
        .await
        .expect("create referred user");
        assert!(
            insert_friend_request(&db, "user-2", "user-1")
                .await
                .expect("friend request")
        );
        assert!(
            !insert_friend_request(&db, "user-2", "user-1")
                .await
                .expect("duplicate request ignored")
        );

        // Session + terms + password reset revocation.
        create_session(
            &db,
            &SessionRecord {
                id: "sess-1".to_string(),
                expires_at: now + 86_400_000,
                token: "tok-1".to_string(),
                created_at: now,
                updated_at: now,
                ip_address: Some("127.0.0.1".to_string()),
                user_agent: Some("test".to_string()),
                user_id: "user-1".to_string(),
            },
        )
        .await
        .expect("create session");
        let auth_sess = get_session_by_token(&db, "tok-1")
            .await
            .expect("get sess")
            .expect("exists");
        assert_eq!(auth_sess.user.email, "alex@example.com");

        let terms = get_terms_acceptance(&db, "user-1")
            .await
            .expect("terms")
            .expect("exists");
        assert!(has_accepted_current_terms(
            terms.terms_version.as_deref(),
            terms.terms_accepted_at
        ));
        record_terms_acceptance(&db, "user-1", now + 5000)
            .await
            .expect("record terms");

        let new_hash = hash_password("new-pass").expect("new hash");
        reset_credential_password_and_revoke_sessions(
            &db,
            "user-1",
            "acct-1",
            &new_hash,
            "ver-1",
            now + 6000,
        )
        .await
        .expect("reset password");
        assert!(
            get_session_by_token(&db, "tok-1")
                .await
                .expect("get sess after reset")
                .is_none()
        );

        // Account cleanup removes sends & pending requests before user delete.
        db.execute(
            "INSERT INTO areas (id, parent_id, name) VALUES (1, NULL, 'Crag')",
            &[],
        )
        .await
        .expect("area");
        db.execute(
            "INSERT INTO climbs (id, area_id, name, type, grade) VALUES (1, 1, 'Route', 'sport', 10)",
            &[],
        )
        .await
        .expect("climb");
        db.execute(
            "INSERT INTO sends (user_id, climb_id, ascent_style, rating, suggested_grade)
             VALUES ('user-1', 1, 'redpoint', 5, 10)",
            &[],
        )
        .await
        .expect("send");
        delete_account_and_cleanup(&db, "user-1")
            .await
            .expect("cleanup account");
        let climb = get_public_climb(&db, 1)
            .await
            .expect("climb")
            .expect("exists");
        assert_eq!(climb.send_count, 0);
        assert_eq!(climb.avg_rating, None);

        let err: Result<(), DbError> = Ok(());
        assert!(err.is_ok());
        let _ = DbParam::Null;
    });
}

#[test]
fn exercises_social_videos_and_send_stats_queries() {
    let db = migrated_db();
    run_async(async {
        use betabook_db::social::{
            CLIMBERS_PAGE_SIZE, dismiss_feature_announcement, get_climb_send_stats,
            get_climb_videos, get_climber_suggestions, get_climbers_page, get_friends_page,
            get_pending_friend_request_count, get_user_sent_climb_ids, upsert_product_tour_status,
        };

        db.execute(
            "INSERT INTO areas (id, parent_id, name) VALUES (1, NULL, 'Squamish')",
            &[],
        )
        .await
        .expect("area");
        db.execute(
            "INSERT INTO climbs (id, area_id, name, type, grade)
             VALUES (1, 1, 'Dreamcatcher', 'sport', 18), (2, 1, 'Cobra Crack', 'trad', 15)",
            &[],
        )
        .await
        .expect("climbs");
        db.execute(
            "INSERT INTO user (id, name, email, is_private, send_comment_visibility)
             VALUES ('u1', 'Alex', 'alex@example.com', 0, 'everyone'),
                    ('u2', 'Blake', 'blake@example.com', 0, 'public'),
                    ('u3', 'Casey', 'casey@example.com', 1, 'everyone')",
            &[],
        )
        .await
        .expect("users");
        db.execute(
            "INSERT INTO sends (user_id, climb_id, ascent_style, date_sent, rating, suggested_grade, grade_feel, videos)
             VALUES ('u1', 1, 'redpoint', '2026-09-01', 5, 18, 'high', '[\"https://www.youtube.com/watch?v=dQw4w9WgXcQ\"]'),
                    ('u2', 1, 'flash', '2026-09-02', 4, 17, 'solid', '[\"https://www.youtube.com/watch?v=abc123def45\"]'),
                    ('u3', 1, 'redpoint', '2026-09-03', NULL, 18, 'solid', '[\"https://www.youtube.com/watch?v=privatevid1\"]')",
            &[],
        )
        .await
        .expect("sends");

        // Signed-out viewer sees only 'everyone' video from public user.
        let anon_videos = get_climb_videos(&db, 1, None, 8)
            .await
            .expect("anon videos");
        assert_eq!(anon_videos.total, 1);
        assert_eq!(anon_videos.videos[0].user_id, None);
        assert_eq!(anon_videos.videos[0].user_name, "Alex");

        // Signed-in viewer u2 sees 'everyone' and 'public', still not private u3.
        let member_videos = get_climb_videos(&db, 1, Some("u2"), 8)
            .await
            .expect("member videos");
        assert_eq!(member_videos.total, 2);
        assert_eq!(member_videos.videos[0].user_id.as_deref(), Some("u2"));

        // Stats and sent IDs.
        let stats = get_climb_send_stats(&db, &[1, 2]).await.expect("stats");
        assert_eq!(stats[&1].send_count, 3);
        assert_eq!(stats[&2].send_count, 0);
        let sent_ids = get_user_sent_climb_ids(&db, "u1", &[1, 2])
            .await
            .expect("sent ids");
        assert_eq!(sent_ids, vec![1]);

        // Friendships & suggestions.
        db.execute(
            "INSERT INTO friendships (user_id, friend_id, status, requested_by)
             VALUES ('u1', 'u2', 'accepted', 'u1'),
                    ('u1', 'u3', 'pending', 'u3')",
            &[],
        )
        .await
        .expect("friendships");
        assert_eq!(
            get_pending_friend_request_count(&db, "u1")
                .await
                .expect("pending count"),
            1
        );
        let accepted = get_friends_page(&db, "u1", false, 0)
            .await
            .expect("accepted friends");
        assert_eq!(accepted.friends.len(), 1);
        assert_eq!(accepted.friends[0].name, "Blake");

        let climbers = get_climbers_page(&db, Some("u1"), "bl", 0, CLIMBERS_PAGE_SIZE)
            .await
            .expect("climbers search");
        assert_eq!(climbers.climbers.len(), 1);
        assert_eq!(climbers.climbers[0].friendship_status, "friends");

        let suggestions = get_climber_suggestions(&db, "u1", 6)
            .await
            .expect("suggestions");
        assert!(suggestions.is_empty());

        dismiss_feature_announcement(&db, "u1", "analytics-customize")
            .await
            .expect("dismiss announcement");
        upsert_product_tour_status(&db, "u1", "journal", 7, "completed")
            .await
            .expect("upsert tour");
    });
}

#[test]
fn exercises_layer6_feed_journal_sends_friendships_and_catalog() {
    let db = migrated_db();
    run_async(async {
        use betabook_db::auth::{insert_friend_request, unique_display_name};
        use betabook_db::feed::{FEED_PAGE_SIZE, get_feed_page};
        use betabook_db::journal::{
            JOURNAL_PAGE_SIZE, JournalFilter, create_journal_entry_with_sync,
            delete_journal_entry_with_sync, get_ascent_entry_id, get_journal_entry_for_edit,
            get_journal_page, get_user_hashtags, remove_my_journal_tag,
            update_journal_entry_with_sync,
        };
        use betabook_db::member_catalog::{
            create_area, create_climb, get_area_with_subtree_size, get_climb_by_id,
            get_subtree_grade_histogram, update_area_description, update_climb_description,
        };
        use betabook_db::sends::{
            UserSendsFilter, create_undated_send, delete_user_send, get_climb_send_summary,
            get_sends_for_climb, get_sends_for_user_export_page, get_sends_for_user_page,
            get_user_sends_summary, update_send_with_journal,
        };
        use betabook_db::social::{
            FriendshipEndOp, VisibilityColumn, accept_friend_request, end_friendship_relationship,
            get_climber_hardest, get_friendship_status, get_journal_filter_friends,
            get_product_tour_state, reset_profile_share_link, search_companion_friends,
            update_user_display_name, update_user_grade_preferences, update_user_private,
            update_user_visibility,
        };
        use betabook_domain::grades::GradePreferences;
        use betabook_domain::sends::{validate_journal_input, validate_send_input};

        let now = 1_787_000_000_000_i64;
        db.execute(
            "INSERT INTO areas (id, parent_id, name) VALUES (1, NULL, 'Squamish')",
            &[],
        )
        .await
        .expect("root area");
        let sub_area = create_area(&db, 1, "Grand Wall", Some("Granite wall"))
            .await
            .expect("create subarea");
        update_area_description(&db, sub_area, Some("Updated granite wall"))
            .await
            .expect("update area");
        let area_info = get_area_with_subtree_size(&db, 1)
            .await
            .expect("area info")
            .expect("exists");
        assert!(!area_info.large_subtree);

        let c1 = create_climb(
            &db,
            sub_area,
            "Split Pillar",
            ClimbType::Trad,
            15,
            Some("Classic"),
        )
        .await
        .expect("create climb 1");
        let c2 = create_climb(&db, sub_area, "Superfly", ClimbType::Boulder, 10, None)
            .await
            .expect("create climb 2");
        update_climb_description(&db, c2, Some("Crimpy traverse"))
            .await
            .expect("update climb");
        assert_eq!(
            get_climb_by_id(&db, c2)
                .await
                .expect("get climb")
                .expect("exists")
                .description
                .as_deref(),
            Some("Crimpy traverse")
        );
        let hist = get_subtree_grade_histogram(&db, 1)
            .await
            .expect("histogram");
        assert_eq!(hist.len(), 2);

        // Create two users and exercise friendship lifecycle.
        db.execute(
            "INSERT INTO user (id, name, email, is_private, journal_visibility, send_comment_visibility)
             VALUES ('u1', 'Alex', 'alex@example.com', 0, 'friends', 'public'),
                    ('u2', 'Sam', 'sam@example.com', 0, 'friends', 'public'),
                    ('u3', 'Pat', 'pat@example.com', 0, 'private', 'private')",
            &[],
        )
        .await
        .expect("users");

        assert!(
            insert_friend_request(&db, "u1", "u2")
                .await
                .expect("req u2")
        );
        assert_eq!(
            get_friendship_status(&db, "u2", "u1")
                .await
                .expect("status"),
            "incoming"
        );
        assert!(
            accept_friend_request(&db, "u2", "u1")
                .await
                .expect("accept")
        );
        assert_eq!(
            get_friendship_status(&db, "u1", "u2")
                .await
                .expect("friends"),
            "friends"
        );
        assert_eq!(
            search_companion_friends(&db, "u1", "sa")
                .await
                .expect("companion search")
                .len(),
            1
        );
        assert_eq!(
            get_journal_filter_friends(&db, "u1")
                .await
                .expect("filter friends")
                .len(),
            1
        );

        // Request & decline / cancel check
        assert!(
            insert_friend_request(&db, "u1", "u3")
                .await
                .expect("req u3")
        );
        assert!(
            end_friendship_relationship(&db, "u3", "u1", FriendshipEndOp::Decline)
                .await
                .expect("decline")
        );
        assert_eq!(
            get_friendship_status(&db, "u1", "u3")
                .await
                .expect("declined"),
            "none"
        );

        // Account updates
        assert_eq!(
            unique_display_name(&db, "Alex").await.expect("dup"),
            "Alex 2"
        );
        update_user_display_name(&db, "u1", "Alex Climbs", now)
            .await
            .expect("rename");
        update_user_visibility(&db, "u1", VisibilityColumn::Journal, "public", now)
            .await
            .expect("vis");
        update_user_grade_preferences(&db, "u1", "font", "french", now)
            .await
            .expect("grade prefs");
        reset_profile_share_link(&db, "u1")
            .await
            .expect("reset share link");
        assert!(
            get_product_tour_state(&db, "u1")
                .await
                .expect("tour")
                .is_some()
        );

        // Create ascent via journal entry + companion tag
        let j_in = validate_journal_input(
            Some("session"),
            Some(&c2.to_string()),
            Some("true"),
            Some("2026-11-20"),
            Some("Sent on go 3 #granite"),
            &["granite".to_string()],
            "2026-11-26",
        )
        .expect("valid journal ascent");
        let s_in = validate_send_input(
            ClimbType::Boulder,
            Some("redpoint"),
            Some("2026-11-20"),
            Some("Sent on go 3 #granite"),
            Some("5"),
            Some("10"),
            Some("solid"),
            Some(&["https://youtu.be/dQw4w9WgXcQ".to_string()]),
            "2026-11-26",
        )
        .expect("valid send");
        create_journal_entry_with_sync(
            &db,
            "u1",
            &j_in,
            Some(&s_in),
            true,
            Some(&["u2".to_string()]),
            now,
        )
        .await
        .expect("create ascent journal entry");

        // Verify feed for u2 includes u1's send + companion tag
        let feed = get_feed_page(
            &db,
            "u2",
            "all",
            None,
            FEED_PAGE_SIZE,
            GradePreferences::default(),
        )
        .await
        .expect("feed");
        assert_eq!(feed.days.len(), 1);
        assert_eq!(feed.days[0].sends, 1);
        assert_eq!(feed.days[0].activities[0].companions.len(), 1);
        assert!(feed.days[0].activities[0].companions[0].is_self);

        // u2 removes their companion tag
        let asc_id = get_ascent_entry_id(&db, "u1", c2)
            .await
            .expect("asc id")
            .expect("exists");
        remove_my_journal_tag(&db, "u2", asc_id)
            .await
            .expect("remove tag");
        let edited_entry = get_journal_entry_for_edit(&db, asc_id, "u1")
            .await
            .expect("edit proj")
            .expect("exists");
        assert!(edited_entry.companions.is_empty());

        // u1 logs a repeat on the same climb + training entry
        let repeat_in = validate_journal_input(
            Some("session"),
            Some(&c2.to_string()),
            Some("true"),
            Some("2026-11-22"),
            Some("Felt casual on repeat"),
            &[],
            "2026-11-26",
        )
        .expect("valid repeat");
        create_journal_entry_with_sync(&db, "u1", &repeat_in, None, false, None, now + 100)
            .await
            .expect("create repeat");

        let train_in = validate_journal_input(
            Some("training"),
            None,
            Some("false"),
            Some("2026-11-23"),
            Some("Max hangs"),
            &["hangboard".to_string()],
            "2026-11-26",
        )
        .expect("valid training");
        create_journal_entry_with_sync(&db, "u1", &train_in, None, false, None, now + 200)
            .await
            .expect("create training");

        let j_page = get_journal_page(
            &db,
            "u1",
            Some("u1"),
            &JournalFilter::default(),
            None,
            JOURNAL_PAGE_SIZE,
        )
        .await
        .expect("journal page");
        assert_eq!(j_page.entries.len(), 3);

        let tags = get_user_hashtags(&db, "u1", Some("u1"), false, true)
            .await
            .expect("hashtags");
        assert_eq!(tags, vec!["granite".to_string(), "hangboard".to_string()]);

        // Update training entry
        let train_id = j_page.entries[0].id;
        let train_upd = validate_journal_input(
            Some("training"),
            None,
            Some("false"),
            Some("2026-11-23"),
            Some("Updated max hangs"),
            &["hangboard".to_string()],
            "2026-11-26",
        )
        .expect("upd");
        update_journal_entry_with_sync(&db, "u1", train_id, &train_upd, false, None, now + 300)
            .await
            .expect("update journal");

        // Create undated send on c1, then update to dated send creating ascent entry
        let undated_in = validate_send_input(
            ClimbType::Trad,
            Some("onsight"),
            None,
            Some("Great crack"),
            Some("5"),
            Some("15"),
            Some("solid"),
            None,
            "2026-11-26",
        )
        .expect("undated trad");
        create_undated_send(&db, "u1", c1, ClimbType::Trad, &undated_in, now)
            .await
            .expect("create undated");
        let send_c1 = betabook_db::sends::get_user_send_for_climb(&db, "u1", c1)
            .await
            .expect("lookup")
            .expect("exists");
        let dated_in = validate_send_input(
            ClimbType::Trad,
            Some("onsight"),
            Some("2026-11-19"),
            Some("Awesome gear"),
            Some("5"),
            Some("15"),
            Some("high"),
            None,
            "2026-11-26",
        )
        .expect("dated trad");
        update_send_with_journal(
            &db,
            "u1",
            send_c1.id,
            &dated_in,
            None,
            Some(""),
            false,
            None,
            now + 400,
        )
        .await
        .expect("convert undated to dated");
        assert!(
            get_ascent_entry_id(&db, "u1", c1)
                .await
                .expect("ascent")
                .is_some()
        );

        // User sends query, export, summary, climb sends & summary
        let sends_page =
            get_sends_for_user_page(&db, "u1", &UserSendsFilter::default(), 0, 10, Some("u1"))
                .await
                .expect("user sends");
        assert_eq!(sends_page.sends.len(), 2);

        let export_page = get_sends_for_user_export_page(&db, "u1", None)
            .await
            .expect("export sends");
        assert_eq!(export_page.sends.len(), 2);

        let summary = get_user_sends_summary(&db, "u1", GradePreferences::default())
            .await
            .expect("user summary");
        assert_eq!(summary.send_count, 2);

        let hardest = get_climber_hardest(&db, "u1", GradePreferences::default())
            .await
            .expect("hardest");
        assert_eq!(hardest.len(), 2);

        let c_sends = get_sends_for_climb(&db, c2, 0, 10, Some("u1"))
            .await
            .expect("climb sends");
        assert_eq!(c_sends.sends.len(), 1);
        let c_summary = get_climb_send_summary(&db, c2)
            .await
            .expect("climb summary");
        assert_eq!(c_summary.send_count, 1);

        // Delete ascent entry cascades to send delete, and delete_user_send removes c1
        delete_journal_entry_with_sync(&db, "u1", asc_id)
            .await
            .expect("delete ascent");
        assert!(
            betabook_db::sends::get_user_send_for_climb(&db, "u1", c2)
                .await
                .expect("check deleted send")
                .is_none()
        );
        delete_user_send(&db, "u1", send_c1.id)
            .await
            .expect("delete send");
        update_user_private(&db, "u1", true, now + 500)
            .await
            .expect("private");
    });
}
