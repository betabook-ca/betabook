use super::*;
use betabook_db::imports::{Batch, import_sends};
use betabook_domain::grades::ImportGradePreference;

#[test]
fn import_receipts_roll_back_with_send_writes_and_can_be_retried() {
    let db = migrated_db();
    run_async(async {
        for sql in [
            "INSERT INTO user(id,name,email) VALUES ('importer','Import test','import@example.test')",
            "INSERT INTO areas(id,name) VALUES (1,'Crag')",
            "INSERT INTO climbs(id,area_id,name,type,grade) VALUES (1,1,'Rock','boulder',3),(2,1,'Wall','sport',14)",
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
        db.execute("DROP TRIGGER stop_second", &[])
            .await
            .expect("drop fixture");
        let (result, wrote) = import_sends(&db, &rows, batch()).await.expect("retry");
        assert_eq!(result["imported"], 2);
        assert!(wrote);
        assert!(!import_sends(&db, &rows, batch()).await.expect("replay").1);
    });
}

// Interpose a committed catalog change after the import read its source rows,
// exactly when a second request could move the climb to another discipline.
struct Reclassified<'a>(&'a SqliteDb);

#[async_trait::async_trait(?Send)]
impl DbExecutor for Reclassified<'_> {
    async fn query_all(
        &self,
        sql: &str,
        p: &[DbParam],
    ) -> Result<Vec<betabook_db::DbRow>, betabook_db::DbError> {
        self.0.query_all(sql, p).await
    }
    async fn execute(&self, sql: &str, p: &[DbParam]) -> Result<u64, betabook_db::DbError> {
        self.0.execute(sql, p).await
    }
    async fn batch_rows(
        &self,
        statements: Vec<(String, Vec<DbParam>)>,
    ) -> Result<Vec<Vec<betabook_db::DbRow>>, betabook_db::DbError> {
        self.0
            .execute("UPDATE climbs SET type='sport',grade=15 WHERE id=1", &[])
            .await?;
        self.0.batch_rows(statements).await
    }
}

#[test]
fn catalog_changes_abort_an_import_prepared_for_another_discipline() {
    let db = migrated_db();
    run_async(async {
        db.execute(
            "INSERT INTO user (id,name,email) VALUES ('owner','owner','owner@example.test')",
            &[],
        )
        .await
        .expect("owner");
        db.execute("INSERT INTO areas(id,name) VALUES (1,'A')", &[])
            .await
            .expect("area");
        db.execute(
            "INSERT INTO climbs(id,area_id,name,type,grade) VALUES(1,1,'Slab','boulder',4)",
            &[],
        )
        .await
        .expect("climb");
        let row = serde_json::json!({"climbId":1,"ascentStyle":"flash","dateSent":"2025-03-01","gradeText":"V3"});
        let rows = [row];
        let batch = || Batch {
            owner: "owner",
            id: "retry",
            hash: "same",
            scale: ImportGradePreference::Native,
            overwrite: false,
            today: "2025-03-02",
            now: 1,
        };
        assert!(
            import_sends(&Reclassified(&db), &rows, batch())
                .await
                .is_err()
        );
        assert!(
            db.query_all("SELECT id FROM sends", &[])
                .await
                .expect("sends")
                .is_empty()
        );
        assert!(
            db.query_all("SELECT batch_id FROM import_batches", &[])
                .await
                .expect("receipts")
                .is_empty()
        );
        let (result, wrote) = import_sends(&db, &rows, batch()).await.expect("retry");
        assert_eq!(result["imported"], 1);
        assert!(wrote);
        assert_eq!(
            db.query_one("SELECT suggested_grade FROM sends", &[])
                .await
                .expect("query")
                .expect("send")
                .get_i64("suggested_grade")
                .expect("grade"),
            15
        );
    });
}
