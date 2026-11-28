use super::{migrated_db, run_async};
use betabook_db::{
    DbError, DbExecutor,
    send_alerts::{fan_out, list, mark_read, unread_count, update_preferences},
    sqlite::SqliteDb,
};

const DAY: &str = "2026-03-01";
const TODAY: &str = "2026-03-02";

async fn fixture(db: &SqliteDb) -> Result<(), DbError> {
    db.execute(
        "INSERT INTO user(id,name,email,is_private) VALUES
           ('climber','Climber','climber@example.test',0),
           ('friend','Friend','friend@example.test',0),
           ('quiet','Quiet','quiet@example.test',0),
           ('pending','Pending','pending@example.test',0),
           ('stranger','Stranger','stranger@example.test',0)",
        &[],
    )
    .await?;
    db.execute(
        "INSERT INTO friendships(user_id,friend_id,status,requested_by) VALUES
           ('climber','friend','accepted','climber'),
           ('climber','quiet','accepted','quiet'),
           ('climber','pending','pending','pending')",
        &[],
    )
    .await?;
    db.execute("INSERT INTO areas(id,name) VALUES(1,'Bishop')", &[])
        .await?;
    db.execute(
        "INSERT INTO climbs(id,area_id,name,type,grade) VALUES
           (1,1,'Easy','boulder',2),(2,1,'Hard','boulder',7),(3,1,'Mid','boulder',4),(4,1,'Old','boulder',5)",
        &[],
    )
    .await?;
    update_preferences(db, "quiet", true, false, 1).await?;
    send(db, 1, DAY).await
}

async fn send(db: &SqliteDb, climb: i64, day: &str) -> Result<(), DbError> {
    db.execute(
        &format!(
            "INSERT INTO sends(user_id,climb_id,ascent_style,suggested_grade,date_sent)
             VALUES('climber',{climb},'redpoint',2,'{day}')"
        ),
        &[],
    )
    .await?;
    Ok(())
}

#[test]
fn alerts_accepted_friends_who_opted_in_and_batches_one_day() -> Result<(), DbError> {
    let db = migrated_db();
    run_async(async {
        fixture(&db).await?;
        assert_eq!(fan_out(&db, "climber", DAY, TODAY, 10).await?, ["friend"]);
        assert_eq!(unread_count(&db, "friend").await?, 1);
        for other in ["quiet", "pending", "stranger", "climber"] {
            assert!(list(&db, other, 50).await?.is_empty(), "{other}");
        }

        mark_read(&db, "friend", 20).await?;
        assert_eq!(unread_count(&db, "friend").await?, 0);
        send(&db, 2, DAY).await?;
        send(&db, 3, DAY).await?;
        assert_eq!(fan_out(&db, "climber", DAY, TODAY, 30).await?, ["friend"]);

        let alerts = list(&db, "friend", 50).await?;
        assert_eq!(alerts.len(), 1);
        let alert = &alerts[0];
        assert_eq!((alert.sends, alert.updated_at, alert.unread), (3, 30, true));
        let names: Vec<_> = alert.climbs.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, ["Hard", "Mid", "Easy"]);
        Ok(())
    })
}

#[test]
fn skips_old_sends_private_climbers_and_opted_out_climbers() -> Result<(), DbError> {
    let db = migrated_db();
    run_async(async {
        fixture(&db).await?;
        send(&db, 4, "2026-02-20").await?;
        assert!(
            fan_out(&db, "climber", "2026-02-20", TODAY, 1)
                .await?
                .is_empty()
        );
        assert!(
            fan_out(&db, "climber", "2026-03-05", TODAY, 1)
                .await?
                .is_empty()
        );

        update_preferences(&db, "climber", false, true, 1).await?;
        assert!(fan_out(&db, "climber", DAY, TODAY, 1).await?.is_empty());
        update_preferences(&db, "climber", true, true, 1).await?;
        db.execute("UPDATE user SET is_private=1 WHERE id='climber'", &[])
            .await?;
        assert!(fan_out(&db, "climber", DAY, TODAY, 1).await?.is_empty());
        Ok(())
    })
}

#[test]
fn reads_hide_alerts_once_permissions_or_sends_change() -> Result<(), DbError> {
    let db = migrated_db();
    run_async(async {
        fixture(&db).await?;
        fan_out(&db, "climber", DAY, TODAY, 10).await?;
        let visible = async || Ok::<_, DbError>(list(&db, "friend", 50).await?.len());
        assert_eq!(visible().await?, 1);

        db.execute("UPDATE user SET is_private=1 WHERE id='climber'", &[])
            .await?;
        assert_eq!(visible().await?, 0);
        db.execute("UPDATE user SET is_private=0 WHERE id='climber'", &[])
            .await?;
        update_preferences(&db, "climber", false, true, 2).await?;
        assert_eq!(visible().await?, 0);
        update_preferences(&db, "climber", true, true, 3).await?;
        update_preferences(&db, "friend", true, false, 4).await?;
        assert_eq!(
            (visible().await?, unread_count(&db, "friend").await?),
            (0, 0)
        );
        update_preferences(&db, "friend", true, true, 5).await?;
        assert_eq!(visible().await?, 1);

        mark_read(&db, "climber", 6).await?;
        assert_eq!(unread_count(&db, "friend").await?, 1);

        db.execute("DELETE FROM sends WHERE user_id='climber'", &[])
            .await?;
        assert_eq!(visible().await?, 0);
        send(&db, 1, DAY).await?;
        db.execute("DELETE FROM friendships WHERE friend_id='friend'", &[])
            .await?;
        assert_eq!(visible().await?, 0);
        Ok(())
    })
}
