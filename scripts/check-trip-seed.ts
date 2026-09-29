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
  // The default seed already includes trips, so this usually adds none.
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

  // The road trip overlaps the three shorter trips.
  const stops = [long, weekend, day];
  for (const stop of stops) {
    assert.ok(road.start_date <= stop.start_date && stop.end_date <= road.end_date);
    const place = stop.name.replace(/^A day at /, "").replace(/, September 2026$/, "");
    assert.ok(road.notes?.includes(place), `road trip notes should mention ${place}`);
  }

  // `place` is the crag, the parent of the climb's sector. Climb names repeat
  // across crags, so sends are matched by the trip's dates, not by name.
  const sentInside = db.prepare(
    "SELECT c.name, COALESCE(a.parent_id, a.id) AS place FROM sends s JOIN trips t ON t.id = ? JOIN climbs c ON c.id = s.climb_id JOIN areas a ON a.id = c.area_id WHERE s.user_id = t.user_id AND s.date_sent BETWEEN t.start_date AND t.end_date",
  );
  // Analytics uses the send's suggested grade.
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
      assert.equal(inside.length, 0, `${trip.name} is upcoming and should have no sends`);
      assert.match(trip.notes ?? "", /^- \[ \] /m, `${trip.name} should have a tick list`);
      continue;
    }

    assert.ok(inside.length >= 2, `${trip.name} should have at least two sends`);
    assert.equal(
      (uncharted.get(trip.id) as { n: number }).n,
      0,
      `${trip.name} has sends without a suggested grade`,
    );
    assert.ok(
      (entriesInside.get(trip.id) as { n: number }).n >= inside.length,
      `${trip.name} should have a session for each send`,
    );
    for (const name of named) {
      assert.ok(
        inside.some((send) => send.name === name),
        `${trip.name} notes mention ${name}, which was not sent on the trip`,
      );
    }
    // Notes shouldn't list every send. The page already does.
    assert.ok(named.length < inside.length, `${trip.name} notes should not list every send`);
    // Each trip's sends are at one crag. The road trip's sends come only from
    // its three stops.
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
        `${trip.email}: road trip has sends from outside its stops`,
      );
    } else assert.equal(places.size, 1, `${trip.name} has sends from ${places.size} places`);
  }

  for (const subject of ["Getting there", "Where we stayed", "Food", "Next time", "Budget"]) {
    assert.ok(
      seeded.some((trip) => trip.notes?.split("\n").includes(`# ${subject}`)),
      `no notes have a "${subject}" section`,
    );
  }
  assert.ok(
    seeded.some((trip) => /^\| --- \|/m.test(trip.notes ?? "")),
    "no notes include a table",
  );
  assert.ok(
    seeded.some((trip) => /^> /m.test(trip.notes ?? "")),
    "no notes include a quote",
  );
  assert.ok(
    seeded.some((trip) => /^- \[x\] /m.test(trip.notes ?? "")),
    "no notes include a checked task",
  );
  assert.ok(
    seeded.some((trip) => /\]\(https:\/\/example\.com\/guides\//.test(trip.notes ?? "")),
    "no notes include a link",
  );
  // Notes shouldn't link an album. The trip has its own album field.
  assert.ok(!seeded.some((trip) => /^Photos: /m.test(trip.notes ?? "")));

  const tagged = tags();
  assert.ok(tagged.length > 0);
  for (const row of tagged) assert.equal(row.status, "accepted");
  const longTags = tagged.filter((row) => row.trip_id === long.id);
  assert.equal(longTags.length, 2);
  // Descriptions are visible to anyone who can see the trip, so they must not
  // name tagged friends.
  for (const row of tagged) {
    const trip = seeded.find((candidate) => candidate.id === row.trip_id);
    assert.ok(trip);
    assert.ok(
      !trip.description?.includes(row.name),
      `${trip.name} description mentions ${row.name}`,
    );
  }

  // Climber 5 has no friends, so their trip has no tags.
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
    `Trip seed passed: ${seeded.length} trips, each at one crag, with sends and sessions within their dates, notes that only mention climbs sent on the trip, descriptions without names, tagged friends, a trip without tags, an upcoming trip with a tick list, and idempotent reruns.`,
  );
} finally {
  db.close();
}
