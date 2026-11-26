use super::{DbExecutor, migrated_db, run_async};

#[test]
fn climb_lists_snapshot_order_access_and_share_lifecycle() {
    use betabook_db::climb_lists::{self as lists, ListAccess};
    use betabook_domain::climb_lists::ListInput;
    use betabook_domain::public_catalog::{
        parse_member_catalog_options, parse_public_catalog_options,
    };

    let db = migrated_db();
    run_async(async {
        db.execute("INSERT INTO user (id,name,email) VALUES ('owner','Owner','o@example.test'),('friend','Friend','f@example.test'),('stranger','Guest','s@example.test')",&[]).await.expect("users");
        db.execute("INSERT INTO friendships (user_id,friend_id,status,requested_by) VALUES ('friend','owner','accepted','owner'),('owner','stranger','pending','stranger')",&[]).await.expect("accepted and pending relationships");
        db.execute("INSERT INTO areas(id,name) VALUES(1,'Bishop')", &[])
            .await
            .expect("area");
        db.execute("INSERT INTO climbs(id,area_id,name,type,grade) VALUES(1,1,'Café','boulder',4),(2,1,'Blue','sport',3),(3,1,'Amber','trad',4)", &[]).await.expect("climbs");
        db.execute("INSERT INTO sends(user_id, climb_id, ascent_style, suggested_grade) VALUES ('owner',1,'redpoint',4),('friend',2,'redpoint',3)", &[]).await.expect("reader and owner sends");
        let input = ListInput::parse("  My  climbs ", None).expect("title");
        let created = lists::create(&db, "owner", &input, Some(1))
            .await
            .expect("create with first climb");
        assert_eq!(created.title, "My climbs");
        let list_id = created.id;
        let added = lists::add(&db, "owner", list_id, 2)
            .await
            .expect("add climb");
        assert!(added.changed);
        assert_eq!(added.climb_count, 2);
        let duplicate = lists::add(&db, "owner", list_id, 2)
            .await
            .expect("idempotent add");
        assert!(!duplicate.changed);
        assert_eq!(duplicate.climb_count, 2);
        let own = ListAccess::Member {
            list_id,
            viewer: "owner",
        };
        let friend = ListAccess::Member {
            list_id,
            viewer: "friend",
        };
        let stranger = ListAccess::Member {
            list_id,
            viewer: "stranger",
        };
        assert!(
            lists::list(&db, "owner", own)
                .await
                .expect("owner")
                .is_some()
        );
        assert!(
            lists::list(&db, "owner", friend)
                .await
                .expect("friend")
                .is_some()
        );
        assert!(
            lists::list(&db, "owner", stranger)
                .await
                .expect("pending")
                .is_none()
        );
        assert!(
            lists::save_edits(&db, "friend", list_id, &[])
                .await
                .is_err()
        );
        assert!(
            lists::copy(&db, "stranger", &input, stranger)
                .await
                .is_err()
        );
        let filtered = parse_member_catalog_options("excludeSent=1&name=cafe", "friend", 50);
        let read = lists::items(&db, friend, Some("friend"), &filtered, "area_desc")
            .await
            .expect("reader's unsent filtered climbs");
        assert_eq!(
            read.iter()
                .map(|r| (r.climb_id, r.sent))
                .collect::<Vec<_>>(),
            [(1, Some(false))]
        );

        lists::save_edits(&db, "owner", list_id, &[3, 999, 1])
            .await
            .expect("replace with editor's surviving order");
        assert!(
            lists::save_edits(&db, "owner", list_id, &[1, 1])
                .await
                .is_err()
        );
        db.execute(
            "UPDATE user SET climb_list_visibility='private' WHERE id='owner'",
            &[],
        )
        .await
        .expect("close lists");
        assert!(
            lists::list(&db, "owner", friend)
                .await
                .expect("closed")
                .is_none()
        );
        let link = lists::share(&db, "owner", list_id, None)
            .await
            .expect("share private-audience list");
        assert!(link.expires_at.is_none());
        let share = ListAccess::Link(&link.token);
        let options = parse_public_catalog_options("");
        let shared = lists::items(&db, share, None, &options, "position_asc")
            .await
            .expect("public reader");
        assert_eq!(
            shared
                .iter()
                .map(|r| (r.climb_id, r.position, r.sent))
                .collect::<Vec<_>>(),
            [(3, 1, None), (1, 2, None)]
        );
        let copy = lists::copy(&db, "stranger", &input, share)
            .await
            .expect("copy from live link");
        lists::save_edits(&db, "owner", list_id, &[])
            .await
            .expect("empty source");
        let snapshot = lists::items(
            &db,
            ListAccess::Member {
                list_id: copy.id,
                viewer: "stranger",
            },
            Some("stranger"),
            &options,
            "position_asc",
        )
        .await
        .expect("independent snapshot");
        assert_eq!(
            snapshot.iter().map(|r| r.climb_id).collect::<Vec<_>>(),
            [3, 1]
        );
        assert_eq!(
            lists::share(&db, "owner", list_id, Some("+7 days"))
                .await
                .expect("renew live")
                .token,
            link.token
        );
        db.execute(
            "UPDATE climb_list_share_links SET expires_at=datetime('now','-1 day') WHERE list_id=?",
            &[list_id.into()],
        )
        .await
        .expect("expire");
        assert!(
            lists::shared_list(&db, &link.token)
                .await
                .expect("expired")
                .is_some_and(|s| !s.live)
        );
        assert!(lists::copy(&db, "stranger", &input, share).await.is_err());
        let renewed = lists::share(&db, "owner", list_id, None)
            .await
            .expect("renew after expiry");
        assert_ne!(renewed.token, link.token);
        lists::unshare(&db, "owner", list_id).await.expect("revoke");
        assert!(
            lists::shared_list(&db, &renewed.token)
                .await
                .expect("revoked")
                .is_none()
        );
        let closing = lists::share(&db, "owner", list_id, None)
            .await
            .expect("re-share");
        db.execute("UPDATE user SET is_private=1 WHERE id='owner'", &[])
            .await
            .expect("private profile");
        db.execute("UPDATE user SET is_private=0 WHERE id='owner'", &[])
            .await
            .expect("public again");
        assert!(
            lists::shared_list(&db, &closing.token)
                .await
                .expect("still revoked")
                .is_none()
        );
        assert!(
            lists::create(&db, "owner", &input, Some(999))
                .await
                .is_err()
        );
        assert_eq!(
            lists::lists(&db, "owner", "owner")
                .await
                .expect("rolled back failed create")
                .len(),
            1
        );
    });
}
