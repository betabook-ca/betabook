import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { seedSocialData } from "./seed-social.ts";
import { seedTrips } from "./seed-trips.ts";

const filename = process.argv[2];
if (!filename) throw new Error("Pass a disposable SQLite database path");
const db = new DatabaseSync(filename);
db.exec("PRAGMA foreign_keys = ON");

type Trip = {
  id: number;
  email: string;
  name: string;
  description: string | null;
  notes: string | null;
  start_date: string;
  end_date: string;
};

try {
  const viewer = db.prepare("SELECT id FROM user WHERE email = 'dev@example.com'").get() as {
    id: string;
  };
  assert.ok(viewer);
  // A default seed already holds the trips, so this run usually adds none.
  seedSocialData(db, viewer.id);
  seedTrips(db, viewer.id);

  const trips = () =>
    db
      .prepare(
        "SELECT t.id, u.email, t.name, t.description, t.notes, t.start_date, t.end_date FROM trips t JOIN user u ON u.id = t.user_id ORDER BY u.email, t.start_date",
      )
      .all() as Trip[];
  const tags = () =>
    db
      .prepare(
        "SELECT tc.trip_id, owner.email AS owner, friend.email AS friend, friend.name AS name, f.status FROM trip_companions tc JOIN trips t ON t.id = tc.trip_id JOIN user owner ON owner.id = t.user_id JOIN user friend ON friend.id = tc.user_id JOIN friendships f ON f.user_id = tc.friendship_user_id AND f.friend_id = tc.friendship_friend_id ORDER BY tc.trip_id, friend.email",
      )
      .all() as { trip_id: number; owner: string; friend: string; name: string; status: string }[];
  const counts = () =>
    db
      .prepare(
        "SELECT (SELECT count(*) FROM sends) AS sends, (SELECT count(*) FROM journal_entries) AS entries, (SELECT count(*) FROM trips) AS trips",
      )
      .get();

  const seeded = trips();

  const mine = seeded.filter((trip) => trip.email === "dev@example.com");
  assert.equal(mine.length, 5);
  const [road, long, weekend, day, upcoming] = mine;
  assert.equal(road.name, "Fall road trip");
  assert.match(long.name, /, September 2026$/);
  assert.match(weekend.name, /, September 2026$/);
  assert.match(day.name, /^A day at /);
  assert.match(upcoming.name, /, May 2027$/);
  assert.equal(day.start_date, day.end_date);
  assert.equal(day.description, null);
  assert.equal(day.notes, null);

  // Trips overlap freely: the road trip holds the three stops made on it.
  const stops = [long, weekend, day];
  for (const stop of stops) {
    assert.ok(road.start_date <= stop.start_date && stop.end_date <= road.end_date);
    const place = stop.name.replace(/^A day at /, "").replace(/, September 2026$/, "");
    assert.ok(road.notes?.includes(place), `the road trip lists ${place}`);
  }

  // The place is the crag above the climb's own sector. Names repeat across
  // crags, so a climb is matched as a send inside the trip, never by name alone.
  const sentInside = db.prepare(
    "SELECT c.name, COALESCE(a.parent_id, a.id) AS place FROM sends s JOIN trips t ON t.id = ? JOIN climbs c ON c.id = s.climb_id JOIN areas a ON a.id = c.area_id WHERE s.user_id = t.user_id AND s.date_sent BETWEEN t.start_date AND t.end_date",
  );
  // Analytics charts the grade a climber gave their send.
  const uncharted = db.prepare(
    "SELECT count(*) AS n FROM sends s JOIN trips t ON t.id = ? JOIN climbs c ON c.id = s.climb_id WHERE s.user_id = t.user_id AND s.date_sent BETWEEN t.start_date AND t.end_date AND c.grade IS NOT NULL AND s.suggested_grade IS NULL",
  );
  const entriesInside = db.prepare(
    "SELECT count(*) AS n FROM journal_entries j JOIN trips t ON t.id = ? WHERE j.user_id = t.user_id AND j.entry_date BETWEEN t.start_date AND t.end_date",
  );

  for (const trip of seeded) {
    const inside = sentInside.all(trip.id) as { name: string; place: number }[];
    const named = [...(trip.notes ?? "").matchAll(/^- \*\*(.+?)\*\*/gm)].map((match) => match[1]);

    if (trip.start_date > "2027-01-01") {
      assert.equal(inside.length, 0, `${trip.name} has not happened yet`);
      assert.match(trip.notes ?? "", /^- \[ \] /m, `${trip.name} carries a tick list`);
      continue;
    }

    assert.ok(inside.length >= 2, `${trip.name} has sends inside its dates`);
    assert.equal(
      (uncharted.get(trip.id) as { n: number }).n,
      0,
      `${trip.name} has sends its analytics cannot chart`,
    );
    assert.ok(
      (entriesInside.get(trip.id) as { n: number }).n >= inside.length,
      `${trip.name} has the sessions behind its sends`,
    );
    for (const name of named) {
      assert.ok(
        inside.some((send) => send.name === name),
        `${trip.name} names ${name}, which was not sent on it`,
      );
    }
    // The page lists the sends under the notes, so the notes say the rest.
    assert.ok(named.length < inside.length, `${trip.name}'s notes list its sends over again`);
    // A stop is one place and nothing else was sent during it. The road trip
    // is its stops together and nothing besides.
    const places = new Set(inside.map((send) => send.place));
    if (trip.name === "Fall road trip") {
      const stopPlaces = seeded
        .filter((stop) => stop.email === trip.email && stop.id !== trip.id)
        .filter((stop) => trip.start_date <= stop.start_date && stop.end_date <= trip.end_date)
        .flatMap((stop) => sentInside.all(stop.id) as { place: number }[])
        .map((send) => send.place);
      assert.ok(places.size > 1);
      assert.deepEqual(
        [...places].toSorted((a, b) => a - b),
        [...new Set(stopPlaces)].toSorted((a, b) => a - b),
        `${trip.email}'s road trip has sends from outside its stops`,
      );
    } else assert.equal(places.size, 1, `${trip.name} has sends from ${places.size} places`);
  }

  for (const subject of ["Getting there", "Where we stayed", "Food", "Next time", "Budget"]) {
    assert.ok(
      seeded.some((trip) => trip.notes?.split("\n").includes(`# ${subject}`)),
      `some notes cover "${subject}"`,
    );
  }
  assert.ok(
    seeded.some((trip) => /^\| --- \|/m.test(trip.notes ?? "")),
    "some notes carry a table",
  );
  assert.ok(
    seeded.some((trip) => /^> /m.test(trip.notes ?? "")),
    "some notes carry a quote",
  );
  assert.ok(
    seeded.some((trip) => /^- \[x\] /m.test(trip.notes ?? "")),
    "some notes carry a ticked task",
  );
  assert.ok(
    seeded.some((trip) => /\]\(https:\/\/example\.com\/guides\//.test(trip.notes ?? "")),
    "some notes carry a link",
  );
  // The album is the trip's own, so the notes do not link one as well.
  assert.ok(!seeded.some((trip) => /^Photos: /m.test(trip.notes ?? "")));

  const tagged = tags();
  assert.ok(tagged.length > 0);
  for (const row of tagged) assert.equal(row.status, "accepted");
  const longTags = tagged.filter((row) => row.trip_id === long.id);
  assert.equal(longTags.length, 2);
  // Whoever can see a trip reads its description, and only whoever can read
  // the journal is told who was tagged.
  for (const row of tagged) {
    const trip = seeded.find((candidate) => candidate.id === row.trip_id);
    assert.ok(trip);
    assert.ok(!trip.description?.includes(row.name), `${trip.name} names ${row.name}`);
  }

  // Climber 5 has no relationships, so their trip has nobody to tag.
  const alone = seeded.filter((trip) => trip.email === "climber5@example.com");
  assert.ok(alone.length > 0);
  for (const trip of alone) {
    assert.equal(tagged.filter((row) => row.trip_id === trip.id).length, 0);
  }

  const before = counts();
  seedSocialData(db, viewer.id);
  assert.equal(tags().length, 0, "a social refresh cascades the tags away");
  assert.equal(seedTrips(db, viewer.id), 0);
  assert.deepEqual(counts(), before);
  assert.deepEqual(trips(), seeded);
  assert.deepEqual(tags(), tagged, "restore tags after the friendship reset cascades them");

  console.log(
    `Trip seed passed: ${seeded.length} trips at one place each, sends and sessions inside their dates, notes that name only what was sent there, descriptions that name nobody, tagged friends, a trip with nobody to tag, an upcoming tick list and idempotency.`,
  );
} finally {
  db.close();
}
