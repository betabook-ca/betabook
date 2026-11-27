use super::{ConcurrentWrite, migrated_db, run_async};
use betabook_db::{
    DbError, DbExecutor,
    moderation::{review, review_queue, submit},
    sqlite::SqliteDb,
};
use serde_json::json;

async fn fixture(db: &SqliteDb) -> Result<(), DbError> {
    db.execute("INSERT INTO user(id,name,email,role) VALUES ('a','Alice','a@example.test','admin'),('b','Bob','b@example.test','admin'),('m','Meg','m@example.test','user'),('s','Sam','s@example.test','user')",&[]).await?;
    db.execute("INSERT INTO areas(id,name,parent_id) VALUES(1,'First',NULL),(2,'Second',NULL),(3,'Child',1)",&[]).await?;
    db.execute("INSERT INTO climbs(id,name,type,grade,area_id) VALUES(4,'Source','boulder',1,3),(5,'Target','boulder',2,2)",&[]).await?;
    db.execute(
        "INSERT INTO admin_area_scopes(user_id,area_id) VALUES('a',1),('b',2)",
        &[],
    )
    .await?;
    Ok(())
}
const DAY: &str = "2026-11-26";

#[test]
fn scoped_votes_recheck_grants_and_preserve_merged_history() {
    run_async(async {
        let db = migrated_db();
        fixture(&db).await.expect("fixture");
        db.execute("INSERT INTO sends(user_id,climb_id,ascent_style,suggested_grade,comment,videos) VALUES ('m',4,'redpoint',1,'Keep source note','[\"https://www.youtube.com/watch?v=abcdefghijk\"]'),('m',5,'redpoint',2,NULL,NULL)",&[]).await.expect("colliding sends");
        db.execute(
            "INSERT INTO pinned_projects(user_id,climb_id) VALUES('s',4)",
            &[],
        )
        .await
        .expect("pin");
        db.execute(
            "INSERT INTO project_share_links(token,user_id,climb_id) VALUES('token','s',4)",
            &[],
        )
        .await
        .expect("share");
        let input = json!({"targetClimbId":5,"overrides":{"description":"Both lines"}});
        assert_eq!(
            submit(&db, "a", "climb_merge", 4, input.clone(), DAY)
                .await
                .expect("submit"),
            "pending"
        );
        assert!(
            submit(&db, "a", "climb_merge", 4, input, DAY)
                .await
                .is_err()
        );
        let own = review_queue(&db, "a", None).await.expect("own queue");
        assert_eq!(own["rows"], json!([]));
        let queue = review_queue(&db, "b", None).await.expect("other queue");
        assert_eq!(queue["rows"][0]["missingAreaNames"], json!(["Second"]));
        let id = queue["rows"][0]["id"].as_i64().expect("request id");
        assert!(review(&db, "a", id, true, None, DAY).await.is_err());
        assert!(review(&db, "s", id, false, None, DAY).await.is_err());
        db.execute("DELETE FROM admin_area_scopes WHERE user_id='a'", &[])
            .await
            .expect("revoke");
        assert!(
            review(&db, "b", id, true, None, DAY)
                .await
                .expect("still incomplete")
                .awaiting
        );
        db.execute(
            "INSERT INTO admin_area_scopes(user_id,area_id) VALUES('a',1)",
            &[],
        )
        .await
        .expect("restore");
        assert!(
            !review(&db, "b", id, true, None, DAY)
                .await
                .expect("apply")
                .awaiting
        );
        assert!(review(&db, "b", id, false, None, DAY).await.is_err());
        let result=db.query_one("SELECT c.description,s.videos,l.climb_id AS linked, (SELECT body FROM journal_entries WHERE climb_id=5 AND is_send_comment=1) AS note FROM climbs c JOIN sends s ON s.climb_id=c.id JOIN project_share_links l ON l.climb_id=c.id WHERE c.id=5",&[]).await.expect("query").expect("result");
        assert_eq!(
            result.get_string("description").expect("desc"),
            "Both lines"
        );
        assert_eq!(result.get_i64("linked").expect("link"), 5);
        assert_eq!(result.get_string("note").expect("note"), "Keep source note");
        assert!(
            result
                .get_string("videos")
                .expect("videos")
                .contains("youtube.com")
        );
    });
}

#[test]
fn break_moves_dated_history_and_creates_undated_send_for_later_repeats() {
    run_async(async {
        let db = migrated_db();
        fixture(&db).await.expect("fixture");
        db.execute("INSERT INTO sends(user_id,climb_id,ascent_style,date_sent,suggested_grade) VALUES ('m',4,'redpoint','2026-06-07',1),('s',4,'redpoint','2026-06-01',1)",&[]).await.expect("sends");
        db.execute("INSERT INTO journal_entries(user_id,climb_id,kind,sent,is_ascent,entry_date) VALUES('m',4,'session',1,1,'2026-06-07'),('s',4,'session',1,1,'2026-06-01'),('s',4,'session',1,0,'2026-06-07')",&[]).await.expect("entries");
        let payload = json!({"brokenOn":"2026-06-04","reason":"Hold detached"});
        assert_eq!(
            submit(&db, "m", "climb_break", 4, payload.clone(), DAY)
                .await
                .expect("report"),
            "pending"
        );
        assert_eq!(
            submit(&db, "s", "climb_merge", 4, json!({"targetClimbId":5}), DAY)
                .await
                .expect("report duplicate"),
            "pending"
        );
        db.execute("UPDATE climbs SET name='Renamed' WHERE id=4", &[])
            .await
            .expect("rename");
        let q = review_queue(&db, "a", None).await.expect("queue");
        let id = q["rows"][0]["id"].as_i64().expect("request id");
        review(&db, "a", id, true, None, DAY)
            .await
            .expect("approve break");
        let row = db
            .query_one(
                "SELECT id FROM climbs WHERE name='Source - post break (2026)'",
                &[],
            )
            .await
            .expect("query")
            .expect("successor");
        let successor = row.get_i64("id").expect("id");
        let s = db
            .query_one(
                "SELECT date_sent FROM sends WHERE user_id='s' AND climb_id=?",
                &[successor.into()],
            )
            .await
            .expect("query")
            .expect("repeat-only");
        assert!(s.get_opt_string("date_sent").expect("date").is_none());
        let rows = db
            .query_all(
                "SELECT * FROM journal_entries WHERE climb_id=?",
                &[successor.into()],
            )
            .await
            .expect("entries");
        assert_eq!(rows.len(), 2);
        assert!(
            submit(&db, "a", "climb_break", 4, payload, DAY)
                .await
                .is_err()
        );
        assert_eq!(
            review_queue(&db, "a", None).await.expect("resolved queue")["rows"],
            json!([])
        );
    });
}

#[test]
fn revalidates_payloads_and_keeps_failed_decision_pending() {
    run_async(async {
        let db = migrated_db();
        fixture(&db).await.expect("fixture");
        assert_eq!(
            submit(&db, "a", "area_edit", 3, json!({"name":"Edited"}), DAY)
                .await
                .expect("direct"),
            "applied"
        );
        assert!(
            submit(&db, "a", "area_reparent", 1, json!({"newParentId":3}), DAY)
                .await
                .is_err()
        );
        assert!(
            submit(&db, "a", "area_delete", 1, json!({}), DAY)
                .await
                .is_err()
        );
        assert!(
            submit(&db, "a", "area_delete", 3, json!({}), DAY)
                .await
                .is_err()
        );
        assert_eq!(
            submit(
                &db,
                "m",
                "climb_edit",
                4,
                json!({"name":"Changed","type":"boulder","grade":"6"}),
                DAY
            )
            .await
            .expect("queue"),
            "pending"
        );
        db.execute("UPDATE climbs SET type='sport' WHERE id=4", &[])
            .await
            .expect("changed");
        let queue = review_queue(&db, "a", None).await.expect("queue");
        let id = queue["rows"][0]["id"].as_i64().expect("request");
        assert!(review(&db, "a", id, true, None, DAY).await.is_err());
        let decision = review(
            &db,
            "a",
            id,
            false,
            Some("Grade now refers to another discipline".into()),
            DAY,
        )
        .await
        .expect("reject");
        assert!(!decision.email.expect("notification").approved);
        assert_eq!(
            submit(&db, "a", "climb_delete", 4, json!({}), DAY)
                .await
                .expect("delete"),
            "applied"
        );
        assert_eq!(
            submit(&db, "a", "area_delete", 3, json!({}), DAY)
                .await
                .expect("delete area"),
            "applied"
        );
    });
}

#[test]
fn direct_merges_abort_when_either_climb_breaks_or_a_grant_disappears() {
    run_async(async {
        for change in [
            "UPDATE climbs SET broken_on='2026-06-01' WHERE id=4",
            "UPDATE climbs SET broken_on='2026-06-01' WHERE id=5",
            "DELETE FROM admin_area_scopes WHERE user_id='a' AND area_id=2",
        ] {
            let db = migrated_db();
            fixture(&db).await.expect("fixture");
            db.execute(
                "INSERT INTO admin_area_scopes(user_id,area_id) VALUES('a',2)",
                &[],
            )
            .await
            .expect("admin for both climbs");
            let raced = ConcurrentWrite {
                db: &db,
                sql: change,
            };
            assert!(
                submit(
                    &raced,
                    "a",
                    "climb_merge",
                    4,
                    json!({"targetClimbId":5}),
                    DAY
                )
                .await
                .is_err()
            );
            let row=db.query_one("SELECT (SELECT count(*) FROM climbs) AS climbs, (SELECT count(*) FROM change_requests) AS requests, (SELECT count(*) FROM change_request_approvals) AS approvals", &[]).await.expect("query").expect("result");
            assert_eq!(row.get_i64("climbs").expect("climbs"), 2);
            assert_eq!(row.get_i64("requests").expect("audit"), 0);
            assert_eq!(row.get_i64("approvals").expect("approvals"), 0);
        }
    });
}
