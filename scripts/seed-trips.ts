import type { DatabaseSync } from "node:sqlite";

type Person = { id: string; email: string };
type Place = { id: number; name: string };
type Climb = { id: number; name: string; type: "boulder" | "sport" | "trad" };
type Friend = { id: string };
type Plan = {
  kind: "long" | "weekend" | "day" | "upcoming";
  start: string;
  days: number;
  sends: number;
  friends: number;
};

/** Ordinary history is scattered over every crag and year, so a window laid
 * over it catches a handful of unrelated climbs. Each plan brings its own
 * days at one place instead. */
const PLANS: Plan[] = [
  { kind: "long", start: "2026-04-10", days: 9, sends: 8, friends: 2 },
  { kind: "weekend", start: "2026-07-17", days: 3, sends: 4, friends: 1 },
  { kind: "day", start: "2026-08-22", days: 1, sends: 2, friends: 0 },
  { kind: "upcoming", start: "2027-05-14", days: 8, sends: 0, friends: 2 },
];

const ATTEMPTS = [
  "Did all the moves but not in a row. The move into the crux costs too much.",
  "Fell at the last hard move twice. Found a better foot for next time.",
  "Worked the top section on its own. Linking from the start tomorrow.",
  "Too warm in the afternoon. Came back for the evening shade and it felt a grade easier.",
];

const SEND_COMMENTS = [
  "Went first try of the day.",
  "Stuck the move I had been falling on. Shaky to the top.",
  "Felt steady the whole way. Good conditions.",
  null,
  "Took longer than it should have. The start is harder than it looks.",
];

const CONDITIONS = [
  "Cold mornings and dry rock all week.",
  "One day lost to rain, the rest dry and windy.",
  "Hot by noon, so most of the climbing happened before ten and after five.",
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function shiftDate(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function monthOf(date: string): string {
  const [year, month] = date.split("-").map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

function tripName(plan: Plan, place: Place, start: string): string {
  return plan.kind === "day" ? `A day at ${place.name}` : `${place.name}, ${monthOf(start)}`;
}

/** Names nobody: whoever can see the trip reads this line, and the friends on
 * it are for whoever can read the journal. */
function describe(plan: Plan, place: Place): string | null {
  if (plan.kind === "day") return null;
  if (plan.kind === "upcoming") return `Planning ${plan.days} days at ${place.name}.`;
  if (plan.kind === "weekend") return `A long weekend at ${place.name}.`;
  return `${plan.days} days at ${place.name}.`;
}

type Sent = { climb: Climb; day: number; style: "redpoint" | "flash" };

function writeNotes(
  plan: Plan,
  place: Place,
  sent: Sent[],
  open: Climb[],
  index: number,
): string | null {
  const slug = place.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (plan.kind === "day") return null;

  if (plan.kind === "upcoming") {
    return [
      "# Plan",
      "1. Drive up on the Friday night\n2. Easy climbing the first morning\n3. Save skin for the last two days",
      "# Tick list",
      open.map((climb) => `- [ ] ${climb.name}`).join("\n"),
    ].join("\n\n");
  }

  const sends = sent
    .map(
      ({ climb, day, style }) =>
        `- **${climb.name}** on day ${day + 1}${style === "flash" ? ", flashed" : ""}`,
    )
    .join("\n");

  if (plan.kind === "weekend") {
    return [`${sent.length} sends in ${plan.days} days at ${place.name}.`, sends].join("\n\n");
  }

  const next = open[0];
  return [
    `Climbed ${plan.days - 1} of ${plan.days} days. ${CONDITIONS[index % CONDITIONS.length]}`,
    "# Sends",
    sends,
    "# What worked",
    "- Short sessions early, before the wall came into the sun\n- A full rest day in the middle",
    "# Next time",
    next
      ? `- *${next.name}* is still open\n- Bring more tape than seems necessary`
      : "- Bring more tape than seems necessary",
    `Photos: https://example.com/albums/${slug}`,
  ].join("\n\n");
}

/** The caller owns the transaction, and runs this after the social seed: the
 * tags need its friendships, and every social refresh cascades them away. */
export function seedTrips(db: DatabaseSync, viewerId: string): number {
  const climbers = db
    .prepare(
      "SELECT id, email FROM user WHERE email GLOB 'climber[0-9]*@example.com' AND id <> ? ORDER BY CAST(substr(email, 8) AS INTEGER)",
    )
    .all(viewerId) as Person[];

  let places = db
    .prepare(
      "SELECT crag.id, crag.name FROM areas crag JOIN areas leaf ON leaf.parent_id = crag.id JOIN climbs c ON c.area_id = leaf.id GROUP BY crag.id HAVING count(c.id) >= 12 ORDER BY crag.id",
    )
    .all() as Place[];
  // Tiny seeds have no third tier of areas, and hang their climbs off the second.
  if (places.length === 0) {
    places = db
      .prepare(
        "SELECT a.id, a.name FROM areas a JOIN climbs c ON c.area_id = a.id GROUP BY a.id HAVING count(c.id) >= 4 ORDER BY a.id",
      )
      .all() as Place[];
  }
  if (places.length === 0) return 0;

  const openClimbs = db.prepare(
    "SELECT c.id, c.name, c.type FROM climbs c WHERE (c.area_id = ? OR c.area_id IN (SELECT id FROM areas WHERE parent_id = ?)) AND c.broken_on IS NULL AND NOT EXISTS (SELECT 1 FROM sends s WHERE s.user_id = ? AND s.climb_id = c.id) AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j.user_id = ? AND j.climb_id = c.id) ORDER BY c.id LIMIT ?",
  );
  const friendsOf = db.prepare(
    "SELECT u.id FROM friendships f JOIN user u ON u.id = CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted' ORDER BY CAST(substr(u.email, 8) AS INTEGER), u.id LIMIT ?",
  );
  const findTrip = db.prepare("SELECT id FROM trips WHERE user_id = ? AND name = ?");
  const insertTrip = db.prepare(
    "INSERT INTO trips (user_id, name, description, notes, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
  );
  const insertSend = db.prepare(
    "INSERT INTO sends (user_id, climb_id, ascent_style, date_sent, rating, comment) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insertEntry = db.prepare(
    "INSERT INTO journal_entries (user_id, climb_id, kind, sent, is_ascent, entry_date, body) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const tag = db.prepare(
    "INSERT INTO trip_companions (trip_id, user_id, friendship_user_id, friendship_friend_id) VALUES (?, ?, ?, ?) ON CONFLICT (trip_id, user_id) DO NOTHING",
  );

  let created = 0;

  function addTrip(person: Person, index: number, plan: Plan, planIndex: number) {
    const place = places[(index * PLANS.length + planIndex) % places.length];
    const start = shiftDate(plan.start, (index % 4) * 14);
    const name = tripName(plan, place, start);
    const friends = friendsOf.all(person.id, person.id, person.id, plan.friends) as Friend[];

    let trip = findTrip.get(person.id, name) as { id: number } | undefined;
    if (!trip) {
      // Three more than are sent, so the notes have something left to name.
      const climbs = openClimbs.all(
        place.id,
        place.id,
        person.id,
        person.id,
        plan.sends + 3,
      ) as Climb[];
      const restDay = plan.kind === "long" ? Math.floor(plan.days / 2) : -1;
      const climbingDays = Array.from({ length: plan.days }, (_, day) => day).filter(
        (day) => day !== restDay,
      );
      const sent: Sent[] = climbs.slice(0, plan.sends).map((climb, order) => ({
        climb,
        day: climbingDays[Math.floor((order * climbingDays.length) / plan.sends)],
        style: order % 3 === 2 ? "flash" : "redpoint",
      }));
      const open = climbs.slice(sent.length);

      for (const [order, { climb, day, style }] of sent.entries()) {
        const date = shiftDate(start, day);
        if (day > 0 && style === "redpoint") {
          insertEntry.run(
            person.id,
            climb.id,
            "session",
            0,
            0,
            shiftDate(date, -1),
            ATTEMPTS[(index + order) % ATTEMPTS.length],
          );
        }
        const comment = SEND_COMMENTS[(index + order) % SEND_COMMENTS.length];
        insertSend.run(person.id, climb.id, style, date, 3 + ((index + order) % 3), comment);
        insertEntry.run(person.id, climb.id, "session", 1, 1, date, comment);
      }
      if (restDay >= 0) {
        insertEntry.run(
          person.id,
          null,
          "training",
          0,
          0,
          shiftDate(start, restDay),
          "Rest day. Walked the far sector to look at what to try next.",
        );
      }

      trip = insertTrip.get(
        person.id,
        name,
        describe(plan, place),
        writeNotes(plan, place, sent, open, index),
        start,
        shiftDate(start, plan.days - 1),
      ) as { id: number };
      created += 1;
    }

    for (const friend of friends) {
      const [a, b] = person.id < friend.id ? [person.id, friend.id] : [friend.id, person.id];
      tag.run(trip.id, friend.id, a, b);
    }
  }

  for (const [planIndex, plan] of PLANS.entries()) {
    addTrip({ id: viewerId, email: "" }, 0, plan, planIndex);
  }
  for (const [index, person] of climbers.entries()) {
    // The first dozen carry the audience mix the social seed documents; past
    // them, one climber in four has been away.
    const plans = index < 12 ? PLANS.slice(0, index % 3 === 0 ? 4 : 2) : PLANS.slice(1, 2);
    if (index >= 12 && index % 4 !== 0) continue;
    for (const plan of plans) addTrip(person, index + 1, plan, PLANS.indexOf(plan));
  }

  return created;
}
