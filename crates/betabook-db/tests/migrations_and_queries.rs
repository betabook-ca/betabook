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
