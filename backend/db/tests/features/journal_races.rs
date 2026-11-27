use super::{ConcurrentWrite, migrated_db, run_async};
use betabook_db::{
    DbExecutor,
    journal::{create_journal_entry_with_sync, update_journal_entry_with_sync},
    sends::MutationError,
};
use betabook_domain::sends::{ValidatedJournalInput, ValidatedSendInput};

fn entry(sent: bool) -> ValidatedJournalInput {
    ValidatedJournalInput {
        kind: "session".into(),
        climb_id: Some(1),
        sent,
        entry_date: "2026-01-01".into(),
        body: Some("Updated note".into()),
        tags: None,
    }
}

async fn fixture(db: &impl DbExecutor) -> Result<(), betabook_db::DbError> {
    db.execute(
        "INSERT INTO user(id,name,email) VALUES ('owner','Owner','owner@example.test')",
        &[],
    )
    .await?;
    db.execute("INSERT INTO areas(id,name) VALUES (1,'Area')", &[])
        .await?;
    db.execute(
        "INSERT INTO climbs(id,name,area_id,type,grade) VALUES (1,'Climb',1,'boulder',1)",
        &[],
    )
    .await?;
    Ok(())
}

#[test]
fn edit_of_a_concurrently_deleted_entry_reports_a_conflict() {
    run_async(async {
        for tags in [None, Some(vec!["friend".to_string()])] {
            let db = migrated_db();
            fixture(&db).await.expect("seed journal");
            db.execute("INSERT INTO journal_entries(id,user_id,climb_id,kind,entry_date) VALUES (1,'owner',1,'session','2026-01-01')", &[]).await.expect("entry");
            let raced = ConcurrentWrite {
                db: &db,
                sql: "DELETE FROM journal_entries WHERE id=1",
            };
            let result = update_journal_entry_with_sync(
                &raced,
                "owner",
                1,
                &entry(false),
                false,
                tags.as_deref(),
                1,
            )
            .await;
            assert!(
                matches!(result, Err(MutationError::Validation(ref message)) if message == "The entry changed — refresh and try again"),
                "{result:?}"
            );
        }
    });
}

#[test]
fn first_ascent_and_repeat_classification_detect_concurrent_changes() {
    run_async(async {
        let db = migrated_db();
        fixture(&db).await.expect("seed journal");
        // The action observed a send when it classified this as a repeat.
        let result =
            create_journal_entry_with_sync(&db, "owner", &entry(true), None, false, None, 1).await;
        let changed = "The send changed while this entry was being saved — try again";
        assert!(
            matches!(result, Err(MutationError::Validation(ref msg)) if msg == changed),
            "{result:?}"
        );
        // A competing writer logs the climb after the first-ascent preflight.
        let raced = ConcurrentWrite {
            db: &db,
            sql: "INSERT INTO sends(user_id,climb_id,ascent_style,suggested_grade) VALUES ('owner',1,'redpoint',1)",
        };
        let send = ValidatedSendInput {
            ascent_style: "flash".into(),
            date_sent: Some("2026-01-01".into()),
            comment: None,
            rating: None,
            suggested_grade: 1,
            grade_feel: "solid".into(),
            videos: None,
        };
        let result = create_journal_entry_with_sync(
            &raced,
            "owner",
            &entry(true),
            Some(&send),
            true,
            None,
            1,
        )
        .await;
        assert!(
            matches!(result, Err(MutationError::Validation(ref msg)) if msg == changed),
            "{result:?}"
        );
        assert!(
            db.query_one("SELECT id FROM journal_entries", &[])
                .await
                .expect("journal")
                .is_none()
        );
    });
}
