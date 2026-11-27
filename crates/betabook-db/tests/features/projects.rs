use super::{migrated_db, run_async};
use betabook_db::{DbExecutor, projects::*};
use serde_json::json;

#[test]
fn boards_and_share_links_follow_pin_send_and_privacy_state() {
    let db = migrated_db();
    run_async(async {
        for sql in [
            "INSERT INTO areas (id,name) VALUES (1,'Area')",
            "INSERT INTO climbs (id,area_id,name,type,grade) VALUES (1,1,'Pinned','boulder',5),(2,1,'Suggestion','sport',6)",
            "INSERT INTO user (id,name,email) VALUES ('owner','Owner','o@example.test'),('other','Other','x@example.test')",
            "INSERT INTO journal_entries(user_id,climb_id,kind,entry_date,body) VALUES
             ('owner',1,'session','2026-01-01','one'),('owner',1,'session','2026-01-02','two'),
             ('owner',1,'session','2026-01-03','three'),('owner',1,'session','2026-01-04','four'),
             ('owner',2,'session','2026-01-05','unrelated'),('other',1,'session','2026-01-05','secret')",
        ] {db.execute(sql,&[]).await.expect("seed");}
        pin_project(&db, "owner", 1).await.expect("pin");
        pin_project(&db, "owner", 1).await.expect("duplicate pin");
        let board = json!(project_board(&db, "owner", false).await.expect("board"));
        assert_eq!(board["projects"][0]["sessionCount"], 4);
        assert_eq!(
            board["projects"][0]["sessions"].as_array().map(Vec::len),
            Some(3)
        );
        assert_eq!(board["suggestions"][0]["climbId"], 2);
        assert_eq!(board["pinnedClimbIds"], json!([1]));
        assert!(share_project(&db, "other", 1, None).await.is_err());
        let token = share_project(&db, "owner", 1, None)
            .await
            .expect("share")
            .token;
        let public = json!(shared_project(&db, &token).await.expect("visible"));
        assert_eq!(public["status"], "visible");
        assert_eq!(public["sessions"][0]["body"], "four");
        assert!(!public.to_string().contains("companions"));
        assert!(!public.to_string().contains("unrelated"));
        assert!(!public.to_string().contains("secret"));
        db.execute("INSERT INTO sends(user_id,climb_id,ascent_style,suggested_grade) VALUES ('owner',1,'redpoint',5)",&[]).await.expect("undated send");
        let open = json!(project_board(&db, "owner", false).await.expect("open"));
        assert_eq!(open["projects"], json!([]));
        assert_eq!(open["pinnedClimbIds"], json!([1]));
        let sent = json!(project_board(&db, "owner", true).await.expect("sent"));
        assert_eq!(sent["projects"][0]["sent"], true);
        assert!(sent["projects"][0]["sentOn"].is_null());
        db.execute(
            "UPDATE project_share_links SET expires_at='2000-01-01 00:00:00'",
            &[],
        )
        .await
        .expect("expire");
        assert!(matches!(
            shared_project(&db, &token).await.expect("expired"),
            SharedAccess::Expired
        ));
        assert_eq!(
            share_project(&db, "owner", 1, Some("+7 days"))
                .await
                .expect("renew")
                .token,
            token
        );
        unshare_project(&db, "other", 1)
            .await
            .expect("other revokes own");
        assert!(matches!(
            shared_project(&db, &token).await.expect("visible"),
            SharedAccess::Visible { .. }
        ));
        db.execute("UPDATE user SET is_private=1 WHERE id='owner'", &[])
            .await
            .expect("private");
        assert!(matches!(
            shared_project(&db, &token).await.expect("revoked"),
            SharedAccess::Hidden
        ));
        assert!(share_project(&db, "owner", 1, None).await.is_err());
        db.execute("UPDATE user SET is_private=0 WHERE id='owner'", &[])
            .await
            .expect("public");
        let new = share_project(&db, "owner", 1, None)
            .await
            .expect("new share")
            .token;
        assert_ne!(token, new);
        unpin_project(&db, "owner", 1).await.expect("unpin");
        assert!(matches!(
            shared_project(&db, &new).await.expect("cascade"),
            SharedAccess::Hidden
        ));
    });
}

#[test]
fn pin_limit_is_atomic_and_duplicate_pins_remain_successful() {
    let db = migrated_db();
    run_async(async {
        db.execute(
            "INSERT INTO user (id,name,email) VALUES ('owner','Owner','o@example.test')",
            &[],
        )
        .await
        .expect("owner");
        db.execute("INSERT INTO areas (id,name) VALUES (1,'Area')", &[])
            .await
            .expect("area");
        db.execute("WITH RECURSIVE ids(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM ids WHERE n<101)
           INSERT INTO climbs(id,area_id,name,type,grade) SELECT n,1,'Climb '||n,'boulder',1 FROM ids", &[]).await.expect("climbs");
        db.execute("INSERT INTO pinned_projects(user_id,climb_id) SELECT 'owner',id FROM climbs WHERE id<=100", &[]).await.expect("fill board");
        pin_project(&db, "owner", 100)
            .await
            .expect("existing pin at cap");
        assert!(matches!(
            pin_project(&db, "owner", 101).await,
            Err(betabook_db::sends::MutationError::Validation(_))
        ));
        unpin_project(&db, "owner", 100).await.expect("unpin");
        pin_project(&db, "owner", 101)
            .await
            .expect("reclaimed slot");
    });
}
