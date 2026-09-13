import type { DatabaseSync } from "node:sqlite";

/** The caller owns the transaction. Reset synthetic friendships while preserving
 * the development account's journal, send history and privacy settings. */
export function seedSocialData(db: DatabaseSync, viewerId: string): number {
  const users = db
    .prepare(
      "SELECT id, email FROM user WHERE email GLOB 'climber[0-9]*@example.com' ORDER BY CAST(substr(email, 8) AS INTEGER)",
    )
    .all() as { id: string; email: string }[];
  const privacy = db.prepare(
    "UPDATE user SET is_private = ?, journal_visibility = ?, send_comment_visibility = ? WHERE id = ?",
  );
  const clear = db.prepare("DELETE FROM friendships WHERE user_id = ? OR friend_id = ?");
  const clearTour = db.prepare(
    "DELETE FROM user_product_tours WHERE user_id = ? AND tour_id = 'journal'",
  );
  const saveTour = db.prepare(
    "INSERT INTO user_product_tours (user_id, tour_id, version, status) VALUES (?, 'journal', ?, ?)",
  );
  const connect = db.prepare(
    "INSERT INTO friendships (user_id, friend_id, requested_by, status, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
  );
  const createdAt = new Date("2026-09-02T12:00:00Z").getTime();
  let total = 0;
  function add(requester: string, recipient: string, status: "pending" | "accepted") {
    if (requester === recipient) return;
    const [a, b] = requester < recipient ? [requester, recipient] : [recipient, requester];
    total += Number(connect.run(a, b, requester, status, createdAt).changes);
  }
  for (const [i, person] of users.entries()) {
    if (person.id === viewerId) continue;
    const audiences = ["private", "friends", "public"];
    privacy.run(Number(i % 5 === 3), audiences[i % 3], audiences[Math.floor(i / 3) % 3], person.id);
    clear.run(person.id, person.id);
    clearTour.run(person.id);
    if (person.email === "climber13@example.com") saveTour.run(person.id, 1, "completed");
    if (person.email === "climber14@example.com") saveTour.run(person.id, 1, "dismissed");
    if (person.email === "climber15@example.com") saveTour.run(person.id, 2, "completed");
  }
  // Climber 5 has no relationships in either direction, even in larger seeds.
  const network = users.filter(
    (person) => person.email !== "climber5@example.com" && person.id !== viewerId,
  );
  for (const [i, person] of network.entries())
    for (let step = 1; step <= Math.min(3, network.length - 1); step += 1)
      add(person.id, network[(i + step) % network.length].id, "accepted");
  for (const [number, journalAudience, commentaryAudience, relationship] of [
    [1, "public", "public", "friends"],
    [2, "public", "private", "friends"],
    [3, "private", "public", "friends"],
    [4, "public", "public", "friends"],
    [5, "private", "private", "none"],
    [6, "friends", "public", "friends"],
    [7, "friends", "private", "friends"],
    [8, "friends", "friends", "outgoing"],
    [9, "public", "public", "incoming"],
    [10, "friends", "public", "none"],
    [11, "public", "friends", "incoming"],
    [12, "private", "friends", "friends"],
  ] as const) {
    const person = users.find((row) => row.email === `climber${number}@example.com`);
    if (!person || person.id === viewerId) continue;
    privacy.run(
      Number(number === 4 || number === 9),
      journalAudience,
      commentaryAudience,
      person.id,
    );
    if (relationship !== "none") {
      const incoming = relationship === "incoming" || number === 7 || number === 12;
      add(
        incoming ? person.id : viewerId,
        incoming ? viewerId : person.id,
        relationship === "friends" ? "accepted" : "pending",
      );
    }
    if ([1, 2, 3, 4, 6, 7, 8, 10].includes(number)) addDay(db, person.id);
  }
  addCompanionScenarios(db, users, viewerId);
  return total;
}

function addCompanionScenarios(
  db: DatabaseSync,
  users: { id: string; email: string }[],
  viewerId: string,
) {
  const person = (number: number) =>
    users.find((row) => row.email === `climber${number}@example.com` && row.id !== viewerId);
  const first = person(1);
  const second = person(2);
  if (!first || !second) return;
  const sharedArea = db
    .prepare(
      "SELECT c.area_id FROM climbs c WHERE NOT EXISTS (SELECT 1 FROM areas child WHERE child.parent_id = c.area_id) GROUP BY c.area_id HAVING count(*) >= 2 ORDER BY c.area_id LIMIT 1",
    )
    .get() as { area_id: number } | undefined;
  // Tiny seeds may not contain two climbs in one leaf area. Their existing
  // mixed-day fixtures remain useful without these additional comparisons.
  if (!sharedArea) return;
  const climbs = db
    .prepare("SELECT id FROM climbs WHERE area_id = ? ORDER BY id LIMIT 2")
    .all(sharedArea.area_id) as { id: number }[];
  const [sharedClimb, unrelatedClimb] = climbs;
  const findEntry = db.prepare(
    "SELECT id FROM journal_entries WHERE user_id = ? AND entry_date = ? AND tags = ? ORDER BY id LIMIT 1",
  );
  const insertEntry = db.prepare(
    "INSERT INTO journal_entries (user_id, climb_id, kind, sent, is_ascent, entry_date, body, tags) VALUES (?, ?, ?, 0, 0, ?, ?, ?) RETURNING id",
  );
  const insertCompanion = db.prepare(
    "INSERT INTO journal_companions (entry_id, user_id, friendship_user_id, friendship_friend_id) VALUES (?, ?, ?, ?) ON CONFLICT (entry_id, user_id) DO NOTHING",
  );
  const date = "2026-09-02";
  function addEntry(
    authorId: string,
    scenario: string,
    climbId: number | null,
    note: string,
    companionId?: string,
  ) {
    const tags = JSON.stringify(["companion-demo", scenario]);
    const existing = findEntry.get(authorId, date, tags) as { id: number } | undefined;
    const entry =
      existing ??
      (insertEntry.get(
        authorId,
        climbId,
        climbId === null ? "training" : "session",
        date,
        note,
        tags,
      ) as { id: number });
    // Every social refresh resets synthetic friendships, cascading old tags.
    // Reattach these explicit fixture tags even when their entry already exists.
    if (companionId) {
      const [a, b] = authorId < companionId ? [authorId, companionId] : [companionId, authorId];
      insertCompanion.run(entry.id, companionId, a, b);
    }
  }
  addEntry(
    first.id,
    "connected-outdoor",
    sharedClimb.id,
    "Worked the opening moves with a friend.",
    second.id,
  );
  addEntry(
    second.id,
    "connected-outdoor",
    sharedClimb.id,
    "Tried another sequence on the same climb.",
  );
  addEntry(
    first.id,
    "unrelated-outdoor",
    unrelatedClimb.id,
    "A separate session on another climb in this area.",
  );
  addEntry(first.id, "connected-training", null, "Easy mobility and shoulder work.");
  addEntry(
    second.id,
    "connected-training",
    null,
    "A short strength session with a friend.",
    first.id,
  );
  for (const number of [3, 4]) {
    const hidden = person(number);
    if (hidden)
      addEntry(
        hidden.id,
        "hidden-outdoor",
        sharedClimb.id,
        "A session whose journal or profile is private.",
        first.id,
      );
  }
}

function addDay(db: DatabaseSync, userId: string) {
  if (
    db
      .prepare(
        "SELECT 1 FROM journal_entries WHERE user_id = ? AND tags LIKE '%social-demo%' LIMIT 1",
      )
      .get(userId)
  )
    return;
  const climb = db
    .prepare(
      "SELECT c.id FROM climbs c WHERE NOT EXISTS (SELECT 1 FROM sends s WHERE s.user_id = ? AND s.climb_id = c.id) ORDER BY c.id LIMIT 1",
    )
    .get(userId) as { id: number } | undefined;
  // Tiny seeds may have no unsent climbs left; their ordinary history still
  // supplies the feed. Default-size seeds always get this mixed-activity day.
  if (!climb) return;
  const date = "2026-09-01";
  const note = "A good day out with friends. Finally found a steady sequence.";
  db.prepare(
    "INSERT INTO sends (user_id, climb_id, ascent_style, date_sent, comment) VALUES (?, ?, 'redpoint', ?, ?)",
  ).run(userId, climb.id, date, note);
  const entry = db.prepare(
    "INSERT INTO journal_entries (user_id, climb_id, kind, sent, is_ascent, entry_date, body, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const tags = JSON.stringify(["social-demo", "footwork"]);
  entry.run(userId, climb.id, "session", 1, 1, date, note, tags);
  entry.run(userId, climb.id, "session", 1, 0, date, "Repeated it with quieter feet.", tags);
  entry.run(userId, climb.id, "session", 0, 0, date, "Worked through the moves together.", tags);
  entry.run(
    userId,
    null,
    "training",
    0,
    0,
    date,
    "Easy mobility and a short hangboard session.",
    tags,
  );
}
