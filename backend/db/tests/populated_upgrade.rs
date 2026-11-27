use std::{error::Error, fs, path::Path};

use rusqlite::{Connection, params};

#[test]
fn populated_database_keeps_trip_text_and_backfills_only_missing_grades()
-> Result<(), Box<dyn Error>> {
    let db = Connection::open_in_memory()?;
    db.execute_batch("PRAGMA foreign_keys = ON")?;
    let directory = Path::new(env!("CARGO_MANIFEST_DIR")).join("../migrations");
    let mut files = fs::read_dir(directory)?
        .map(|entry| entry.map(|entry| entry.path()))
        .collect::<Result<Vec<_>, _>>()?;
    files.retain(|path| path.extension().is_some_and(|ext| ext == "sql"));
    files.sort();

    let short = "x".repeat(160);
    let long = format!("{short}\nLonger notes.");
    for path in files {
        if path
            .file_name()
            .is_some_and(|name| name == "0051_trip_notes_friends_album.sql")
        {
            db.execute_batch(
                "INSERT INTO user(id,name,email) VALUES ('owner','Owner','owner@example.test');
                 INSERT INTO areas(id,name) VALUES (1,'Area');
                 INSERT INTO climbs(id,area_id,name,type,grade) VALUES
                    (10,1,'Old','boulder',NULL), (11,1,'Graded','sport',9),
                    (12,1,'Third','boulder',9);
                 INSERT INTO sends(id,user_id,climb_id,ascent_style,date_sent,suggested_grade)
                    VALUES (1,'owner',10,'flash','2026-01-01',NULL),
                           (2,'owner',11,'redpoint','2026-01-02',NULL),
                           (3,'owner',12,'flash','2026-01-03',7);",
            )?;
            for description in [Some(&short), Some(&long), None] {
                db.execute(
                    "INSERT INTO trips(user_id,name,description,start_date,end_date)
                     VALUES ('owner','Trip',?,'2026-01-01','2026-01-02')",
                    params![description],
                )?;
            }
        }
        db.execute_batch(&fs::read_to_string(path)?)?;
    }
    let text = db
        .prepare("SELECT description, notes FROM trips ORDER BY id")?
        .query_map([], |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    assert_eq!(
        text,
        [(Some(short), None), (None, Some(long)), (None, None)]
    );
    let mut select_grades = db.prepare(
        "SELECT c.grade, s.suggested_grade
         FROM sends s JOIN climbs c ON s.climb_id = c.id ORDER BY s.id",
    )?;
    let grades = select_grades
        .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    assert_eq!(grades, [(0, 0), (9, 9), (9, 7)]);
    assert!(!db.prepare("PRAGMA foreign_key_check")?.exists([])?);
    Ok(())
}
