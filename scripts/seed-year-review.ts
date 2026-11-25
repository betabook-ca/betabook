/**
 * Gives one account a full 2026 for the year-in-review page: a home region
 * with a pyramid of boulders and some sport, two new boulder grades, a
 * project that never goes, repeats, low-rated sends, a big day, a tagged
 * partner, a 2024 trip with a 2026 return, and a second 2026 trip to one of
 * the September seed trips' crags.
 *
 *   pnpm seed:year-review                     # dev@example.com
 *   pnpm seed:year-review --email me@example.com
 *
 * Writes the local D1 file directly, like `pnpm seed`. Stop `pnpm dev` first.
 * Runs once per account: a second run finds its marker trip and stops.
 */
import { DatabaseSync } from "node:sqlite";

import { requireLocalDb } from "./d1-local.ts";

const MARKER = "Seeded for the year in review.";
const FLASH = "flash";
const REDPOINT = "redpoint";
const YEAR = 2026;

type Climb = {
  id: number;
  name: string;
  type: "boulder" | "sport" | "trad";
  grade: number;
  areaId: number;
};
type Region = { id: number; name: string; rootId: number };

/** A small deterministic generator, so every run seeds the same year. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

function shift(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Every date in the year falling on one of `weekdays`, from `from` to `to`. */
function datesOn(weekdays: number[], from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = shift(date, 1)) {
    if (weekdays.includes(weekday(date))) dates.push(date);
  }
  return dates;
}

const SEND_COMMENTS = [
  "Went first go of the day.",
  "Finally stuck the crux move.",
  null,
  "Shaky top-out but it counts.",
  "Felt steady. Good friction.",
  null,
];
const PUMP_COMMENTS = [
  "Wet, sharp and chossy. Never again.",
  "One hold and a lot of dirt.",
  "Sent it, regretted it.",
];

// oxlint-disable-next-line complexity -- a one-off script that seeds every chapter in order
function main() {
  const args = process.argv.slice(2);
  const emailIndex = args.indexOf("--email");
  const email = emailIndex >= 0 ? args[emailIndex + 1] : "dev@example.com";
  const db = new DatabaseSync(requireLocalDb());
  db.exec("pragma foreign_keys = on");

  const owner = db.prepare("SELECT id FROM user WHERE email = ?").get(email) as
    | { id: string }
    | undefined;
  if (!owner) throw new Error(`No account ${email}. Run \`pnpm seed\` first.`);
  const ownerId = owner.id;
  if (
    db.prepare("SELECT 1 FROM trips WHERE user_id = ? AND description = ?").get(ownerId, MARKER)
  ) {
    console.log(`${email} already has a seeded ${YEAR}. Nothing to do.`);
    return;
  }

  const next = random(2026);
  const pick = <T>(list: readonly T[]) => list[Math.floor(next() * list.length)];

  // Regions: second-level areas whose third-level crags hold plenty of
  // climbs the account has never touched.
  const regions = db
    .prepare(
      `SELECT region.id, region.name, region.parent_id AS rootId
       FROM areas region JOIN areas crag ON crag.parent_id = region.id
       JOIN climbs c ON c.area_id = crag.id
       WHERE region.parent_id IS NOT NULL AND c.broken_on IS NULL
       GROUP BY region.id
       HAVING sum(c.type = 'boulder') >= 12 AND sum(c.type = 'sport') >= 8
       -- The busiest boulder region first: home needs ~45 untouched boulders.
       ORDER BY sum(c.type = 'boulder') DESC, region.id`,
    )
    .all() as Region[];
  const untouched = db.prepare(
    `SELECT c.id, c.name, c.type, c.grade, c.area_id AS areaId FROM climbs c
     JOIN areas crag ON crag.id = c.area_id
     WHERE crag.parent_id = ? AND c.broken_on IS NULL
       AND NOT EXISTS (SELECT 1 FROM sends s WHERE s.user_id = ? AND s.climb_id = c.id)
       AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j.user_id = ? AND j.climb_id = c.id)
     ORDER BY c.id`,
  );
  const climbsIn = (region: Region) => untouched.all(region.id, ownerId, ownerId) as Climb[];
  const touched = new Set(
    (
      db
        .prepare(
          `SELECT DISTINCT crag.parent_id AS id FROM climbs c JOIN areas crag ON crag.id = c.area_id
       WHERE c.id IN (SELECT climb_id FROM sends WHERE user_id = ? UNION SELECT climb_id FROM journal_entries WHERE user_id = ? AND climb_id IS NOT NULL)`,
        )
        .all(ownerId, ownerId) as { id: number }[]
    ).map((row) => row.id),
  );
  const fresh = regions.filter((region) => !touched.has(region.id));
  const home = fresh[0];
  const spring = fresh.find((region) => region.rootId !== home.rootId) ?? fresh[1];
  const returning =
    fresh.find(
      (region) => region.id !== home.id && region.id !== spring.id && region.rootId !== home.rootId,
    ) ?? fresh[2];
  if (!home || !spring || !returning)
    throw new Error("Not enough untouched regions. Run `pnpm seed --force`.");

  // The September seed trip at one crag gets a June visit too.
  const septTrip = db
    .prepare(
      `SELECT t.name, t.start_date AS startDate, t.end_date AS endDate FROM trips t
       WHERE t.user_id = ? AND t.start_date LIKE '2026-09-%' AND t.end_date > t.start_date
         AND t.name LIKE '%, September 2026' ORDER BY t.start_date LIMIT 1`,
    )
    .get(ownerId) as { name: string; startDate: string; endDate: string } | undefined;
  // Area names repeat in the sample tree, so find the region from the trip's
  // own sends rather than its name.
  const septRegion = septTrip
    ? (db
        .prepare(
          `SELECT region.id, region.name, region.parent_id AS rootId
           FROM sends s JOIN climbs c ON c.id = s.climb_id
           JOIN areas crag ON crag.id = c.area_id JOIN areas region ON region.id = crag.parent_id
           WHERE s.user_id = ? AND s.date_sent BETWEEN ? AND ?
           GROUP BY region.id ORDER BY count(*) DESC LIMIT 1`,
        )
        .get(ownerId, septTrip.startDate, septTrip.endDate) as Region | undefined)
    : undefined;

  // Trip windows move later a week at a time until they hold none of the
  // account's existing days, so each trip is at one place.
  const busy = new Set(
    (
      db
        .prepare(
          `SELECT entry_date AS day FROM journal_entries WHERE user_id = ?
         UNION SELECT date_sent FROM sends WHERE user_id = ? AND date_sent IS NOT NULL`,
        )
        .all(ownerId, ownerId) as { day: string }[]
    ).map((row) => row.day),
  );
  const claimed: [string, string][] = [["2026-09-01", "2026-09-30"]];
  function freeWindow(start: string, days: number): string {
    for (let from = start; ; from = shift(from, 7)) {
      const to = shift(from, days - 1);
      const clear =
        !claimed.some(([a, b]) => from <= b && to >= a) &&
        Array.from({ length: days }, (_, day) => shift(from, day)).every((date) => !busy.has(date));
      if (clear) {
        claimed.push([from, to]);
        return from;
      }
    }
  }
  const springStart = freeWindow("2026-04-10", 7);
  const juneStart = freeWindow("2026-06-05", 3);
  const julyStart = freeWindow("2026-07-18", 6);
  const firstVisitStart = freeWindow("2024-08-10", 4);
  const atHome = (date: string) => !claimed.some(([from, to]) => date >= from && date <= to);

  const ceiling = (type: string) =>
    (
      db
        .prepare(
          `SELECT max(s.suggested_grade) AS grade FROM sends s JOIN climbs c ON c.id = s.climb_id
       WHERE s.user_id = ? AND c.type = ? AND (s.date_sent IS NULL OR s.date_sent < '2026-01-01')`,
        )
        .get(ownerId, type) as { grade: number | null }
    ).grade ?? 3;
  const boulderTop = Math.min(ceiling("boulder"), 12);
  const sportTop = Math.min(ceiling("sport"), 26);

  const insertSend = db.prepare(
    `INSERT INTO sends (user_id, climb_id, ascent_style, date_sent, rating, suggested_grade, grade_feel, comment)
     VALUES (?, ?, ?, ?, ?, ?, 'solid', ?)`,
  );
  const insertEntry = db.prepare(
    `INSERT INTO journal_entries (user_id, climb_id, kind, sent, is_ascent, entry_date, body)
     VALUES (?, ?, 'session', ?, ?, ?, ?) RETURNING id`,
  );
  const insertTrip = db.prepare(
    "INSERT INTO trips (user_id, name, description, start_date, end_date) VALUES (?, ?, ?, ?, ?)",
  );
  const tag = db.prepare(
    `INSERT INTO journal_companions (entry_id, user_id, friendship_user_id, friendship_friend_id)
     VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`,
  );
  const friends = db
    .prepare(
      `SELECT CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END AS id, f.user_id AS a, f.friend_id AS b
     FROM friendships f WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'
     ORDER BY f.created_at LIMIT 2`,
    )
    .all(ownerId, ownerId, ownerId) as { id: string; a: string; b: string }[];

  const used = new Set<number>();
  /** The untouched climb in `pool` closest to `grade`, of `type`. */
  function take(pool: Climb[], type: Climb["type"], grade: number): Climb | undefined {
    const options = pool
      .filter((climb) => climb.type === type && !used.has(climb.id))
      .toSorted((a, b) => Math.abs(a.grade - grade) - Math.abs(b.grade - grade) || a.id - b.id);
    const climb = options[0];
    if (climb) used.add(climb.id);
    return climb;
  }

  const entryIds: { id: number; date: string }[] = [];
  function session(climb: Climb, date: string, body: string | null, sent = 0, ascent = 0) {
    const row = insertEntry.get(ownerId, climb.id, sent, ascent, date, body) as { id: number };
    entryIds.push({ id: row.id, date });
    return row.id;
  }
  let sendCount = 0;
  function send(
    climb: Climb,
    date: string,
    grade: number,
    style: "redpoint" | "flash" | "onsight",
    rating = 3 + Math.floor(next() * 3),
    comment: string | null = pick(SEND_COMMENTS),
    attempts = 0,
  ) {
    // Practice sessions a week apart before the send, never inside a trip.
    let practice = date;
    for (let attempt = attempts; attempt > 0; attempt -= 1) {
      do practice = shift(practice, -7);
      while (!atHome(practice));
      session(climb, practice, "Worked the moves. Close.");
    }
    insertSend.run(ownerId, climb.id, style, date, rating, grade, comment);
    session(climb, date, comment, 1, 1);
    sendCount += 1;
  }

  db.exec("begin");
  try {
    const homePool = climbsIn(home);
    // Home days stay out of every trip window, so each trip is one place.
    const homeDays = [
      ...datesOn([6, 0], "2026-01-10", "2026-11-22").filter((_, index) => index % 3 === 0),
      ...datesOn([2], "2026-02-03", "2026-11-17").filter((_, index) => index % 4 === 0),
    ]
      .filter(atHome)
      .toSorted();
    const tuesdays = homeDays.filter((date) => weekday(date) === 2);
    const weekends = homeDays.filter((date) => weekday(date) !== 2);

    // The pyramid: two new grades on Tuesdays, the base on weekends.
    const pyramid: [number, number][] = [
      [boulderTop + 2, 1],
      [boulderTop + 1, 2],
      [boulderTop, 3],
      [boulderTop - 1, 5],
      [Math.max(0, boulderTop - 2), 7],
      [Math.max(0, boulderTop - 3), 9],
    ];
    // The project that never goes: the hardest boulder left, held back
    // before the pyramid takes the hard grades.
    const project = take(homePool, "boulder", 99);
    // The low-rated sends, held back too, so each keeps its comment.
    const pumpClimbs = PUMP_COMMENTS.map(() =>
      take(homePool, "boulder", Math.max(0, boulderTop - 2)),
    );
    let weekendIndex = 0;
    let tuesdayIndex = 0;
    for (const [grade, count] of pyramid) {
      for (let n = 0; n < count; n += 1) {
        const climb = take(homePool, "boulder", grade);
        if (!climb) continue;
        const hard = grade >= boulderTop;
        const date = hard
          ? tuesdays[(tuesdayIndex += 3) % tuesdays.length]
          : weekends[(weekendIndex += 1) % weekends.length];
        const style: "flash" | "redpoint" = !hard && next() < 0.45 ? FLASH : REDPOINT;
        send(climb, date, grade, style, undefined, undefined, style === "redpoint" && hard ? 2 : 0);
      }
    }
    // Sport at home: a couple of onsights and a short pyramid.
    for (const [grade, count, style] of [
      [sportTop + 1, 1, "redpoint"],
      [sportTop, 2, "onsight"],
      [sportTop - 1, 4, "flash"],
      [sportTop - 2, 6, "redpoint"],
    ] as const) {
      for (let n = 0; n < count; n += 1) {
        const climb = take(homePool, "sport", grade);
        if (climb) send(climb, weekends[(weekendIndex += 2) % weekends.length], grade, style);
      }
    }

    // The big day: 9 sends and 5 attempts on one Saturday.
    const bigDay = "2026-05-16";
    for (let n = 0; n < 9; n += 1) {
      const climb = take(homePool, "boulder", Math.max(0, boulderTop - 3 + (n % 3)));
      if (climb) send(climb, bigDay, climb.grade, n % 2 ? "flash" : "redpoint");
    }
    for (let n = 0; n < 5; n += 1) {
      const climb = take(homePool, "boulder", boulderTop);
      if (climb) session(climb, bigDay, "Ran out of skin.");
    }

    // The one that got away: seven sessions, no send.
    if (project) {
      for (const date of [
        "2026-03-14",
        "2026-04-04",
        "2026-06-20",
        "2026-08-08",
        "2026-10-03",
        "2026-10-24",
        "2026-11-14",
      ].filter(atHome)) {
        session(project, date, "Closer every time. Not today.");
      }
    }

    // Not worth the pump.
    for (const [index, comment] of PUMP_COMMENTS.entries()) {
      const climb = pumpClimbs[index];
      if (climb)
        send(
          climb,
          weekends[(index * 5 + 2) % weekends.length],
          climb.grade,
          "redpoint",
          index === 0 ? 1 : 2,
          comment,
        );
    }

    // Repeats of climbs sent in earlier years.
    const earlier = db
      .prepare(
        `SELECT c.id, c.name, c.type, c.grade, c.area_id AS areaId FROM sends s JOIN climbs c ON c.id = s.climb_id
         WHERE s.user_id = ? AND s.date_sent < '2026-01-01' ORDER BY s.date_sent LIMIT 12`,
      )
      .all(ownerId) as Climb[];
    for (const [index, climb] of earlier.entries()) {
      session(climb, weekends[(index * 2 + 1) % weekends.length], "Lap for old times' sake.", 1, 0);
    }

    // Spring trip in a new region, under a different root.
    const springPool = climbsIn(spring);
    for (let day = 0; day < 7; day += 1) {
      if (day === 3) continue;
      const date = shift(springStart, day);
      for (let n = 0; n < 3; n += 1) {
        const climb = take(
          springPool,
          n === 2 ? "sport" : "boulder",
          n === 2 ? sportTop - 2 : boulderTop - 2,
        );
        if (climb) send(climb, date, climb.grade, n === 0 ? "flash" : "redpoint");
      }
    }
    insertTrip.run(
      ownerId,
      `${spring.name}, spring 2026`,
      MARKER,
      springStart,
      shift(springStart, 6),
    );

    // 2024 trip and its 2026 return.
    const returnPool = climbsIn(returning);
    for (const [start, days, perDay] of [
      [firstVisitStart, 4, 2],
      [julyStart, 6, 3],
    ] as const) {
      for (let day = 0; day < days; day += 1) {
        const date = shift(start, day);
        for (let n = 0; n < perDay; n += 1) {
          const climb = take(
            returnPool,
            n % 2 ? "sport" : "boulder",
            n % 2 ? sportTop - 3 : boulderTop - 3,
          );
          if (!climb) continue;
          if (start.startsWith("2024")) {
            insertSend.run(ownerId, climb.id, "redpoint", date, 4, climb.grade, null);
            session(climb, date, null, 1, 1);
          } else send(climb, date, climb.grade, n === 0 ? "flash" : "redpoint");
        }
      }
      const year = start.slice(0, 4);
      insertTrip.run(
        ownerId,
        `${returning.name}, summer ${year}`,
        year === "2024" ? "First time here." : "Back again.",
        start,
        shift(start, days - 1),
      );
    }

    // A June visit to the September trip's crag.
    if (septRegion) {
      const septPool = climbsIn(septRegion);
      for (let day = 0; day < 3; day += 1) {
        const date = shift(juneStart, day);
        for (let n = 0; n < 2; n += 1) {
          const climb = take(septPool, "boulder", boulderTop - 2 + n);
          if (climb) send(climb, date, climb.grade, n ? "redpoint" : "flash");
        }
      }
      insertTrip.run(
        ownerId,
        `${septRegion.name}, early summer 2026`,
        "A long weekend.",
        juneStart,
        shift(juneStart, 2),
      );
    }

    // Partners: the first friend on many days, the second on a few.
    const [first, second] = friends;
    const byDay = new Map<string, number[]>();
    for (const { id, date } of entryIds) {
      if (!date.startsWith(`${YEAR}-`)) continue;
      byDay.set(date, [...(byDay.get(date) ?? []), id]);
    }
    const days = [...byDay.keys()].toSorted();
    for (const [index, date] of days.entries()) {
      const ids = byDay.get(date) ?? [];
      if (first && index % 3 === 0) for (const id of ids) tag.run(id, first.id, first.a, first.b);
      if (second && index % 7 === 1)
        for (const id of ids) tag.run(id, second.id, second.a, second.b);
    }

    db.exec("commit");
    console.log(
      `Seeded ${YEAR} for ${email}: ${sendCount} sends, ${entryIds.length} journal entries, home region ${home.name}.`,
    );
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

main();
