import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { seedSocialData } from "./seed-social.ts";

const filename = process.argv[2];
if (!filename) throw new Error("Pass a disposable SQLite database path");
const db = new DatabaseSync(filename);
db.exec("PRAGMA foreign_keys = ON");
try {
  const viewer = db
    .prepare(
      "SELECT id, is_private, journal_visibility, send_comment_visibility FROM user WHERE email = 'dev@example.com'",
    )
    .get() as {
    id: string;
    is_private: number;
    journal_visibility: string;
    send_comment_visibility: string;
  };
  assert.ok(viewer);
  const viewerProgress = db
    .prepare("SELECT * FROM user_product_tours WHERE user_id = ?")
    .all(viewer.id);
  seedSocialData(db, viewer.id);
  const tourProgress = () =>
    db
      .prepare(
        "SELECT u.email, t.version, t.status FROM user u LEFT JOIN user_product_tours t ON t.user_id = u.id AND t.tour_id = 'journal' WHERE u.email IN ('climber13@example.com', 'climber14@example.com', 'climber15@example.com', 'climber16@example.com') ORDER BY u.email",
      )
      .all()
      .map((row) => [row.email, row.version, row.status]);
  const expectedTours = [
    ["climber13@example.com", 1, "completed"],
    ["climber14@example.com", 1, "dismissed"],
    ["climber15@example.com", 2, "completed"],
    ["climber16@example.com", null, null],
  ];
  assert.deepEqual(tourProgress(), expectedTours);
  const query = `SELECT u.email, u.is_private AS private, u.journal_visibility AS journal, u.send_comment_visibility AS commentary, f.status,
    CASE WHEN f.status = 'accepted' THEN 'friends' WHEN f.requested_by = ? THEN 'outgoing' ELSE 'incoming' END AS relationship
    FROM friendships f JOIN user u ON u.id = CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END
    WHERE f.user_id = ? OR f.friend_id = ? ORDER BY CAST(substr(u.email, 8) AS INTEGER)`;
  const rows = db.prepare(query).all(viewer.id, viewer.id, viewer.id, viewer.id);
  assert.deepEqual(
    rows.map((r) => [r.email, r.private, r.journal, r.commentary, r.relationship]),
    [
      ["climber1@example.com", 0, "public", "public", "friends"],
      ["climber2@example.com", 0, "public", "private", "friends"],
      ["climber3@example.com", 0, "private", "public", "friends"],
      ["climber4@example.com", 1, "public", "public", "friends"],
      ["climber6@example.com", 0, "friends", "public", "friends"],
      ["climber7@example.com", 0, "friends", "private", "friends"],
      ["climber8@example.com", 0, "friends", "friends", "outgoing"],
      ["climber9@example.com", 1, "public", "public", "incoming"],
      ["climber11@example.com", 0, "public", "friends", "incoming"],
      ["climber12@example.com", 0, "private", "friends", "friends"],
    ],
  );
  const combinations = db
    .prepare(
      "SELECT DISTINCT journal_visibility, send_comment_visibility FROM user WHERE is_private = 0 AND email GLOB 'climber[0-9]*@example.com' ORDER BY journal_visibility, send_comment_visibility",
    )
    .all();
  assert.deepEqual(
    combinations.map((row) => [row.journal_visibility, row.send_comment_visibility]),
    ["friends", "private", "public"].flatMap((journal) =>
      ["friends", "private", "public"].map((commentary) => [journal, commentary]),
    ),
  );
  for (const row of rows.filter((r) => r.status === "accepted")) {
    const other = db.prepare("SELECT id FROM user WHERE email = ?").get(row.email);
    assert.ok(other);
    const reverse = db.prepare(query).all(other.id, other.id, other.id, other.id);
    assert.equal(
      reverse.filter((r) => r.email === "dev@example.com" && r.relationship === "friends").length,
      1,
    );
  }
  const empty = db.prepare("SELECT id FROM user WHERE email = 'climber5@example.com'").get();
  assert.ok(empty);
  assert.equal(
    db
      .prepare("SELECT count(*) AS n FROM friendships WHERE user_id = ? OR friend_id = ?")
      .get(empty.id, empty.id)?.n,
    0,
  );
  assert.deepEqual(
    db
      .prepare(
        "SELECT id, is_private, journal_visibility, send_comment_visibility FROM user WHERE id = ?",
      )
      .get(viewer.id),
    viewer,
  );
  const activities = db
    .prepare(
      "SELECT kind, sent, is_ascent, count(*) AS n FROM journal_entries WHERE tags LIKE '%social-demo%' GROUP BY kind, sent, is_ascent",
    )
    .all();
  assert.deepEqual(
    activities.map((r) => [r.kind, r.sent, r.is_ascent, r.n]),
    [
      ["session", 0, 0, 8],
      ["session", 1, 0, 8],
      ["session", 1, 1, 8],
      ["training", 0, 0, 8],
    ],
  );
  const companionEntries = () =>
    db
      .prepare(
        "SELECT j.id, u.email, j.kind, j.climb_id, c.area_id, j.entry_date, j.sent, j.is_ascent, j.is_send_comment, j.body, j.tags FROM journal_entries j JOIN user u ON u.id = j.user_id LEFT JOIN climbs c ON c.id = j.climb_id WHERE j.tags LIKE '%companion-demo%' ORDER BY u.email, j.id",
      )
      .all();
  const companionTags = () =>
    db
      .prepare(
        "SELECT jc.entry_id, author.email AS author, companion.email AS companion, jc.suppressed, f.status, companion.is_private FROM journal_companions jc JOIN journal_entries j ON j.id = jc.entry_id JOIN user author ON author.id = j.user_id JOIN user companion ON companion.id = jc.user_id JOIN friendships f ON f.user_id = jc.friendship_user_id AND f.friend_id = jc.friendship_friend_id WHERE j.tags LIKE '%companion-demo%' ORDER BY author.email, jc.entry_id, companion.email",
      )
      .all();
  const scenarios = companionEntries();
  assert.equal(scenarios.length, 7, "seed the connected and unrelated companion scenarios");
  const scenarioKey = (row: (typeof scenarios)[number]) => {
    const tags = JSON.parse(String(row.tags)) as string[];
    assert.ok(tags.includes("companion-demo"));
    const scenario = tags.find((tag) => tag !== "companion-demo");
    assert.ok(scenario);
    return `${String(row.email)}:${scenario}`;
  };
  assert.deepEqual(scenarios.map(scenarioKey).sort(), [
    "climber1@example.com:connected-outdoor",
    "climber1@example.com:connected-training",
    "climber1@example.com:unrelated-outdoor",
    "climber2@example.com:connected-outdoor",
    "climber2@example.com:connected-training",
    "climber3@example.com:hidden-outdoor",
    "climber4@example.com:hidden-outdoor",
  ]);
  const scenario = (key: string) => {
    const row = scenarios.find((entry) => scenarioKey(entry) === key);
    assert.ok(row, key);
    return row;
  };
  for (const row of scenarios) {
    assert.equal(row.entry_date, "2026-09-02");
    assert.deepEqual([row.sent, row.is_ascent, row.is_send_comment], [0, 0, 0]);
    assert.ok(row.body);
  }
  const firstOutdoor = scenario("climber1@example.com:connected-outdoor");
  const secondOutdoor = scenario("climber2@example.com:connected-outdoor");
  const unrelated = scenario("climber1@example.com:unrelated-outdoor");
  assert.equal(firstOutdoor.kind, "session");
  assert.equal(secondOutdoor.kind, "session");
  assert.ok(firstOutdoor.area_id);
  assert.equal(firstOutdoor.climb_id, secondOutdoor.climb_id);
  assert.equal(firstOutdoor.area_id, secondOutdoor.area_id);
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM areas WHERE parent_id = ?").get(firstOutdoor.area_id)?.n,
    0,
  );
  assert.equal(unrelated.kind, "session");
  assert.equal(unrelated.area_id, firstOutdoor.area_id);
  assert.notEqual(unrelated.climb_id, firstOutdoor.climb_id);
  for (const email of ["climber1@example.com", "climber2@example.com"]) {
    const training = scenario(`${email}:connected-training`);
    assert.equal(training.kind, "training");
    assert.equal(training.climb_id, null);
  }
  for (const email of ["climber3@example.com", "climber4@example.com"]) {
    const hidden = scenario(`${email}:hidden-outdoor`);
    assert.equal(hidden.kind, "session");
    assert.equal(hidden.climb_id, firstOutdoor.climb_id);
  }
  const tags = companionTags();
  assert.deepEqual(
    tags.map((row) => [
      row.entry_id,
      row.author,
      row.companion,
      row.suppressed,
      row.status,
      row.is_private,
    ]),
    [
      [firstOutdoor.id, "climber1@example.com", "climber2@example.com", 0, "accepted", 0],
      [
        scenario("climber2@example.com:connected-training").id,
        "climber2@example.com",
        "climber1@example.com",
        0,
        "accepted",
        0,
      ],
      [
        scenario("climber3@example.com:hidden-outdoor").id,
        "climber3@example.com",
        "climber1@example.com",
        0,
        "accepted",
        0,
      ],
      [
        scenario("climber4@example.com:hidden-outdoor").id,
        "climber4@example.com",
        "climber1@example.com",
        0,
        "accepted",
        0,
      ],
    ],
  );
  const count = db.prepare("SELECT count(*) AS n FROM journal_entries").get()?.n;
  seedSocialData(db, viewer.id);
  assert.deepEqual(tourProgress(), expectedTours);
  assert.deepEqual(
    db.prepare("SELECT * FROM user_product_tours WHERE user_id = ?").all(viewer.id),
    viewerProgress,
  );
  assert.deepEqual(db.prepare(query).all(viewer.id, viewer.id, viewer.id, viewer.id), rows);
  assert.equal(db.prepare("SELECT count(*) AS n FROM journal_entries").get()?.n, count);
  assert.deepEqual(companionEntries(), scenarios);
  assert.deepEqual(companionTags(), tags, "restore tags after the friendship reset cascades them");
  console.log(
    "Social seed passed: mutual friends, incoming/outgoing requests, all nine independent audience combinations, mixed days, connected outdoor/training previews, unrelated and hidden entries, empty feed, tour version upgrades and idempotency.",
  );
} finally {
  db.close();
}
