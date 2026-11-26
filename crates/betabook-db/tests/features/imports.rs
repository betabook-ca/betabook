use super::*;
use betabook_db::imports::{Batch, import_sends};
use betabook_domain::grades::ImportGradePreference;

#[test]
fn import_receipts_roll_back_with_catalog_races_and_can_be_retried() {
    let db = migrated_db();
    run_async(async {
        for sql in [
            "INSERT INTO user(id,name,email) VALUES ('importer','Import test','import@example.test')",
            "INSERT INTO areas(id,name) VALUES (1,'Crag')",
            "INSERT INTO climbs(id,area_id,name,type,grade) VALUES (1,1,'Rock','boulder',3),(2,1,'Wall','sport',14)",
            "CREATE TRIGGER race_import AFTER INSERT ON import_batches BEGIN UPDATE climbs SET type='sport' WHERE id=1; END",
        ] {
            db.execute(sql, &[]).await.expect("seed");
        }
        let rows = vec![
            serde_json::json!({"climbId":1,"ascentStyle":"onsight","dateSent":"2025-03-01","gradeText":"V3"}),
            serde_json::json!({"climbId":2,"ascentStyle":"redpoint","dateSent":"2025-03-01"}),
        ];
        let batch = || Batch {
            owner: "importer",
            id: "stable",
            hash: "hash",
            scale: ImportGradePreference::Native,
            overwrite: true,
            today: "2025-03-02",
            now: 1,
        };
        // A trigger simulates the database rejecting the second row. No receipt or send may leak.
        db.execute("CREATE TRIGGER stop_second BEFORE INSERT ON sends WHEN NEW.climb_id=2 BEGIN SELECT RAISE(ABORT,'import rejected'); END",&[]).await.expect("setup");
        assert!(import_sends(&db, &rows, batch()).await.is_err());
        for table in ["import_batches", "sends", "journal_entries"] {
            let row = db
                .query_one(&format!("SELECT count(*) AS n FROM {table}"), &[])
                .await
                .expect("count")
                .expect("row");
            assert_eq!(row.get_i64("n").expect("n"), 0);
        }
        db.execute("DROP TRIGGER race_import", &[])
            .await
            .expect("drop fixture");
        db.execute("DROP TRIGGER stop_second", &[])
            .await
            .expect("drop fixture");
        let (result, wrote) = import_sends(&db, &rows, batch()).await.expect("retry");
        assert_eq!(result["imported"], 2);
        assert!(wrote);
        assert!(!import_sends(&db, &rows, batch()).await.expect("replay").1);
    });
}
