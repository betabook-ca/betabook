use super::{migrated_db, run_async};
use betabook_db::goals::*;
use betabook_db::sends::MutationError;
use betabook_db::{DbError, DbExecutor};
use serde_json::{Value, json};

fn training() -> Value {
    json!({"kind":"training","discipline":null,"grade":null,"target":2,"timeframe":"month","endDate":"2025-01-31","repeat":"month","timezone":"UTC","tags":["#Strength"]})
}
fn clock(day: &str) -> impl Fn(&str) -> Result<String, DbError> {
    move |_| Ok(day.to_owned())
}

#[test]
fn live_periods_follow_snapshots_tags_privacy_and_inclusive_final_date() {
    let db = migrated_db();
    run_async(async {
        db.execute("INSERT INTO user(id,name,email) VALUES('owner','Owner','owner@example.test'),('friend','Friend','friend@example.test')",&[]).await.expect("users");
        db.execute(
            "UPDATE user SET journal_visibility='friends' WHERE id='owner'",
            &[],
        )
        .await
        .expect("journal privacy");
        db.execute("INSERT INTO friendships(user_id,friend_id,status,requested_by) VALUES('friend','owner','accepted','owner')",&[]).await.expect("friendship");
        let mut input = training();
        let id = save(&db, "owner", None, &input, None, &clock("2025-01-07"))
            .await
            .expect("new routine");
        db.execute("INSERT INTO journal_entries(user_id,kind,entry_date,tags,body) VALUES('owner','training','2025-01-05','[\"strength\"]','private note'),('owner','training','2025-01-06','[\"strength\"]',NULL),('owner','training','2025-01-07','[]',NULL)",&[]).await.expect("training entries");
        let view = overview(&db, "owner", "owner", &clock("2025-01-10"))
            .await
            .expect("overview");
        assert_eq!(view["active"]["goals"][0]["progress"], 2);
        assert_eq!(view["completed"]["goals"][0]["completedDate"], "2025-01-06");
        assert!(!view.to_string().contains("private note"));
        input["target"] = json!(4);
        input["recurringEndDate"] = json!("2025-02-20");
        save(&db, "owner", Some(id), &input, None, &clock("2025-02-10"))
            .await
            .expect("change target");
        let visible = history(&db, "owner", "friend", id, 0, None, &clock("2025-02-10"))
            .await
            .expect("friend history");
        let periods = visible["periods"].as_array().expect("periods");
        assert!(
            periods
                .iter()
                .any(|p| p["target"] == 2 && p["progress"] == 2 && p["periodEnd"] == "2025-01-31")
        );
        assert!(
            periods
                .iter()
                .any(|p| p["target"] == 4 && p["periodEnd"] == "2025-02-20")
        );
        db.execute("UPDATE user SET is_private=1 WHERE id='owner'", &[])
            .await
            .expect("private profile");
        assert_eq!(
            history(&db, "owner", "friend", id, 0, None, &clock("2025-02-10"))
                .await
                .expect("hidden history")["periods"],
            json!([])
        );
        assert_eq!(
            page(
                &db,
                "owner",
                "owner",
                "active",
                0,
                None,
                &clock("2025-02-21")
            )
            .await
            .expect("ended")["total"],
            0
        );
        assert!(
            save(&db, "owner", Some(id), &input, None, &clock("2025-02-21"))
                .await
                .is_err()
        );
    });
}

#[test]
fn missed_retries_and_active_slot_limit_are_atomic() {
    let db = migrated_db();
    run_async(async {
        db.execute(
            "INSERT INTO user(id,name,email) VALUES('owner','Owner','owner@example.test')",
            &[],
        )
        .await
        .expect("user");
        let mut missed = training();
        missed["repeat"] = json!("none");
        missed["timeframe"] = json!("custom");
        missed["startDate"] = json!("2025-01-01");
        let day = clock("2025-02-10");
        let id = save(&db, "owner", None, &missed, None, &day)
            .await
            .expect("past one-time");
        let mut ids = Vec::new();
        for _ in 0..5 {
            ids.push(
                save(&db, "owner", None, &training(), None, &day)
                    .await
                    .expect("active slot"),
            );
        }
        assert!(
            matches!(save(&db,"owner",None,&training(),Some(id),&day).await,Err(MutationError::Validation(m)) if m.contains("5 active goals"))
        );
        let active = page(&db, "owner", "owner", "active", 0, None, &day)
            .await
            .expect("active");
        assert!(
            active["goals"]
                .as_array()
                .expect("items")
                .iter()
                .any(|g| g["id"] == id && g["needsAction"] == true)
        );
        delete(&db, "owner", ids[0]).await.expect("free one slot");
        let retry = save(&db, "owner", None, &training(), Some(id), &day)
            .await
            .expect("retry");
        assert_ne!(id, retry);
        assert!(
            save(&db, "owner", None, &training(), Some(id), &day)
                .await
                .is_err()
        );
        assert!(archive(&db, "owner", id, &day).await.is_err());
        assert!(delete(&db, "friend", retry).await.is_err());
        let completed = page(&db, "owner", "owner", "completed", 0, Some(2025), &day)
            .await
            .expect("history");
        assert_eq!(completed["goals"][0]["id"], id);
        assert_eq!(completed["goals"][0]["archived"], true);
    });
}

#[test]
fn milestone_acceptance_survives_imports_and_contribution_queries_enforce_scope() {
    let db = migrated_db();
    run_async(async {
        db.execute("INSERT INTO user(id,name,email,journal_visibility) VALUES('owner','Owner','owner@example.test','public')",&[]).await.expect("user");
        db.execute("INSERT INTO areas(id,name) VALUES(41,'Area')", &[])
            .await
            .expect("area");
        db.execute("INSERT INTO climbs(id,name,area_id,type,grade) VALUES(51,'First',41,'boulder',5),(52,'Old',41,'boulder',7)",&[]).await.expect("climbs");
        let input = json!({"kind":"grade","discipline":"boulder","grade":5,"target":1,"timeframe":"custom","startDate":"2025-01-01","endDate":"2025-01-31","repeat":"none","timezone":"UTC","tags":null});
        let day = clock("2025-01-10");
        let id = save(&db, "owner", None, &input, None, &day)
            .await
            .expect("initial eligibility");
        db.execute("INSERT INTO sends(user_id,climb_id,ascent_style,date_sent,suggested_grade) VALUES('owner',52,'redpoint',NULL,7),('owner',51,'redpoint','2025-01-05',5)",&[]).await.expect("import existing undated send, add first dated send");
        db.execute("INSERT INTO journal_entries(user_id,climb_id,kind,entry_date,sent,is_ascent) VALUES('owner',51,'session','2025-01-05',1,1)",&[]).await.expect("dated ascent");
        save(&db, "owner", Some(id), &input, None, &day)
            .await
            .expect("retains eligibility even after import");
        assert!(
            matches!(save(&db,"owner",None,&input,None,&day).await,Err(MutationError::Validation(m)) if m.contains("already sent"))
        );
        assert_eq!(
            contributions(
                &db,
                "owner",
                "owner",
                id,
                "2025-01-01",
                Some("2025-01-31"),
                &day
            )
            .await
            .expect("qualified climb"),
            json!([{"id":51,"name":"First","type":"climb"}])
        );
        assert_eq!(
            contributions(
                &db,
                "owner",
                "owner",
                id,
                "2025-01-01",
                Some("2025-01-15"),
                &day
            )
            .await
            .expect("invalid bounds"),
            json!([])
        );
        db.execute("UPDATE user SET is_private=1 WHERE id='owner'", &[])
            .await
            .expect("privacy");
        assert_eq!(
            contributions(&db, "owner", "stranger", id, "2025-01-01", None, &day)
                .await
                .expect("private contributions"),
            json!([])
        );
        assert_eq!(
            next_grades(&db, "owner", "stranger")
                .await
                .expect("private grade suggestion"),
            json!({})
        );
        assert_eq!(
            next_grades(&db, "owner", "owner")
                .await
                .expect("owner suggestion"),
            json!({"boulder":8})
        );
    });
}
