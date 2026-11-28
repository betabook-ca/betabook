use super::{migrated_db, run_async};
use betabook_db::{
    DbError, DbExecutor,
    send_alerts::{
        PushSummary, PushTarget, alerts_for_day, delete_push_subscription, fan_out,
        forget_push_endpoint, list, mark_read, push_summary, push_targets, save_push_subscription,
        unread_count, update_preferences,
    },
    sqlite::SqliteDb,
};

fn device(endpoint: &str) -> PushTarget {
    PushTarget {
        endpoint: endpoint.to_owned(),
        p256dh: "B".repeat(87),
        auth: "a".repeat(22),
    }
}

#[test]
fn devices_follow_their_latest_account_and_only_owners_unsubscribe() -> Result<(), DbError> {
    let db = migrated_db();
    run_async(async {
        fixture(&db).await?;
        let phone = device("https://push.example/phone");
        save_push_subscription(&db, "friend", &phone).await?;
        save_push_subscription(&db, "quiet", &device("https://push.example/laptop")).await?;
        assert_eq!(
            push_targets(&db, &["friend".to_owned()]).await?,
            std::slice::from_ref(&phone)
        );

        save_push_subscription(&db, "quiet", &phone).await?;
        assert!(push_targets(&db, &["friend".to_owned()]).await?.is_empty());
        delete_push_subscription(&db, "friend", &phone.endpoint).await?;
        assert_eq!(push_targets(&db, &["quiet".to_owned()]).await?.len(), 2);
        delete_push_subscription(&db, "quiet", &phone.endpoint).await?;
        forget_push_endpoint(&db, "https://push.example/laptop").await?;
        assert!(push_targets(&db, &["quiet".to_owned()]).await?.is_empty());

        assert!(
            save_push_subscription(&db, "friend", &device("http://push.example/plain"))
                .await
                .is_err()
        );
        Ok(())
    })
}

#[test]
fn summarizes_the_day_by_its_latest_send() -> Result<(), DbError> {
    let db = migrated_db();
    run_async(async {
        fixture(&db).await?;
        send(&db, 2, DAY).await?;
        send(&db, 3, DAY).await?;
        let summary = PushSummary {
            name: "Climber".to_owned(),
            sends: 3,
            latest_climb: "Mid".to_owned(),
        };
        assert_eq!(push_summary(&db, "climber", DAY).await?, Some(summary));
        assert_eq!(push_summary(&db, "climber", TODAY).await?, None);
        Ok(())
    })
}

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
        assert_eq!(fan_out(&db, "climber", DAY, 10).await?, ["friend"]);
        assert_eq!(unread_count(&db, "friend").await?, 1);
        for other in ["quiet", "pending", "stranger", "climber"] {
            assert!(list(&db, other).await?.is_empty(), "{other}");
        }

        mark_read(&db, "friend", 10, 20).await?;
        assert_eq!(unread_count(&db, "friend").await?, 0);
        send(&db, 2, DAY).await?;
        send(&db, 3, DAY).await?;
        assert_eq!(fan_out(&db, "climber", DAY, 30).await?, ["friend"]);
        mark_read(&db, "friend", 25, 40).await?;
        assert_eq!(
            unread_count(&db, "friend").await?,
            1,
            "unseen refresh stays unread"
        );

        let alerts = list(&db, "friend").await?;
        assert_eq!(alerts.len(), 1);
        let alert = &alerts[0];
        assert_eq!((alert.sends, alert.updated_at, alert.unread), (3, 30, true));
        let names: Vec<_> = alert.climbs.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, ["Mid", "Hard", "Easy"], "newest send first");
        Ok(())
    })
}

#[test]
fn skips_old_sends_private_climbers_and_opted_out_climbers() -> Result<(), DbError> {
    for (day, alerts) in [
        ("2026-02-23", true),
        ("2026-02-22", false),
        ("2026-03-03", true),
        ("2026-03-04", false),
        ("not-a-date", false),
    ] {
        assert_eq!(alerts_for_day(day, TODAY), alerts, "{day}");
    }
    let db = migrated_db();
    run_async(async {
        fixture(&db).await?;
        assert!(fan_out(&db, "climber", "2026-02-20", 1).await?.is_empty());

        update_preferences(&db, "climber", false, true, 1).await?;
        assert!(fan_out(&db, "climber", DAY, 1).await?.is_empty());
        update_preferences(&db, "climber", true, true, 1).await?;
        db.execute("UPDATE user SET is_private=1 WHERE id='climber'", &[])
            .await?;
        assert!(fan_out(&db, "climber", DAY, 1).await?.is_empty());
        Ok(())
    })
}

#[test]
fn reads_hide_alerts_once_permissions_or_sends_change() -> Result<(), DbError> {
    let db = migrated_db();
    run_async(async {
        fixture(&db).await?;
        fan_out(&db, "climber", DAY, 10).await?;
        let visible = async || Ok::<_, DbError>(list(&db, "friend").await?.len());
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

        mark_read(&db, "climber", 100, 6).await?;
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
