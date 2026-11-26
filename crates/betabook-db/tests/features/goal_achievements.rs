use super::{migrated_db, run_async};
use betabook_db::{
    DbError, DbExecutor,
    goal_achievements::{AchievementKey, acknowledge, refresh, unseen},
    sqlite::SqliteDb,
};
use serde_json::json;

const LOG: &str =
    "INSERT INTO journal_entries(user_id,kind,entry_date) VALUES('owner','training','2026-03-01')";
const NOW: &str = "2026-03-02T00:30:00Z";

async fn fixture(db: &SqliteDb) -> Result<(), DbError> {
    db.execute("INSERT INTO user(id,name,email) VALUES ('owner','Owner','owner@example.test'),('other','Other','other@example.test')", &[]).await?;
    // Goal 1 predates achievement notices; goal 2 was created after that feature.
    db.execute("INSERT INTO goals(id,user_id,kind,target,timeframe,repeat,start_date,end_date,timezone,celebrations_initialized)
      VALUES(1,'owner','training',1,'month','none','2026-03-01','2026-03-31','America/Vancouver',0),
            (2,'owner','training',1,'month','none','2026-03-01','2026-03-31','America/Vancouver',1)", &[]).await?;
    db.execute(LOG, &[]).await?;
    Ok(())
}

#[test]
fn reconciles_atomically_and_retains_dismissals_across_corrections() -> Result<(), DbError> {
    let db = migrated_db();
    let today = |zone: &str| {
        assert_eq!(zone, "America/Vancouver");
        Ok("2026-03-01".to_owned())
    };
    run_async(async {
        fixture(&db).await?;
        db.execute("CREATE TRIGGER fail_notice BEFORE INSERT ON goal_achievements BEGIN SELECT RAISE(ABORT, 'failed notice'); END", &[]).await?;
        assert!(refresh(&db, "owner", NOW, &today).await.is_err());
        assert!(
            db.query_all("SELECT * FROM goal_completions", &[])
                .await?
                .is_empty()
        );
        db.execute("DROP TRIGGER fail_notice", &[]).await?;

        refresh(&db, "owner", NOW, &today).await?;
        let events = db
            .query_all("SELECT id FROM goal_completions ORDER BY goal_id", &[])
            .await?;
        assert_eq!(events.len(), 2);
        let event_id = events[1].get_i64("id")?;
        refresh(&db, "owner", NOW, &today).await?;
        assert_eq!(
            db.query_one("SELECT id FROM goal_completions WHERE goal_id=2", &[])
                .await?
                .expect("event")
                .get_i64("id")?,
            event_id
        );

        let periods: Vec<_> = [1, 2]
            .map(|id| {
                json!({"id":id,"timezone":"America/Vancouver","periodStart":"2026-03-01",
          "repeat":"none","target":1,"progress":1,"completedDate":"2026-03-01"})
            })
            .into();
        let pending = vec![periods[1].clone()];
        assert_eq!(unseen(&db, "owner", &periods, &today).await?, pending);
        let keys = AchievementKey::parse_many(Some(
            &json!([{"id":2,"periodStart":"2026-03-01","repeat":"none"}]),
        ))
        .expect("valid");
        acknowledge(&db, "other", &keys, NOW).await?;
        assert_eq!(unseen(&db, "owner", &periods, &today).await?, pending);
        acknowledge(&db, "owner", &keys, NOW).await?;
        db.execute("DELETE FROM journal_entries WHERE user_id='owner'", &[])
            .await?;
        refresh(&db, "owner", NOW, &today).await?;
        assert!(
            db.query_all("SELECT * FROM goal_completions", &[])
                .await?
                .is_empty()
        );
        db.execute(LOG, &[]).await?;
        refresh(&db, "owner", NOW, &today).await?;
        assert!(unseen(&db, "owner", &periods, &today).await?.is_empty());
        Ok(())
    })
}

#[test]
fn future_completions_wait_for_the_goals_civil_day() -> Result<(), DbError> {
    let db = migrated_db();
    run_async(async {
        fixture(&db).await?;
        db.execute("UPDATE journal_entries SET entry_date='2026-03-02'", &[])
            .await?;
        refresh(&db, "owner", NOW, &|_| Ok("2026-03-01".into())).await?;
        assert!(
            db.query_all("SELECT * FROM goal_completions", &[])
                .await?
                .is_empty()
        );
        refresh(&db, "owner", "2026-03-02T08:00:00Z", &|_| {
            Ok("2026-03-02".into())
        })
        .await?;
        assert_eq!(
            db.query_all("SELECT * FROM goal_completions", &[])
                .await?
                .len(),
            2
        );
        Ok(())
    })
}
