import type { DatabaseSync } from "node:sqlite";

type Person = { id: string; email: string };
type Place = { id: number; name: string };
type Climb = {
  id: number;
  name: string;
  type: "boulder" | "sport" | "trad";
  grade: number | null;
  sector: string;
};
type Friend = { id: string };
type Plan = {
  kind: "long" | "weekend" | "day" | "road" | "upcoming";
  start: string;
  days: number;
  sends: number;
  friends: number;
};

/** Seeded history is spread across all crags and years, so a random date range
 * would match unrelated climbs. Each plan adds its own days at one crag, dated
 * after the history ends on 2026-09-01. The road trip spans the three shorter
 * trips. */
const PLANS: Plan[] = [
  { kind: "long", start: "2026-09-03", days: 9, sends: 8, friends: 2 },
  { kind: "weekend", start: "2026-09-17", days: 3, sends: 4, friends: 1 },
  { kind: "day", start: "2026-09-25", days: 1, sends: 2, friends: 0 },
  { kind: "road", start: "2026-09-02", days: 29, sends: 0, friends: 0 },
  { kind: "upcoming", start: "2027-05-14", days: 8, sends: 0, friends: 2 },
];
const STOPS = PLANS.filter((plan) => plan.sends > 0);

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

const STAYS = [
  "Camped at the free site below the crag. No water there, so we filled up in town every second day.",
  "Rented a cabin twenty minutes out. Worth it for the stove and somewhere to dry everything.",
  "Slept in the van at the trailhead. Quiet after dark, busy by eight.",
];

const APPROACHES = [
  "Twenty minutes uphill from the upper lot, which fills by nine on a weekend.",
  "A flat walk along the river, then a scramble to the base that is awkward with pads.",
  "Park at the gate and walk the forestry road. The left fork after the bridge is the quick way.",
];

const MEALS = [
  "The bakery in town opens at six and has sold the good bread by eight.",
  "Cooked at camp most nights. The one pub nearby stops serving food at eight.",
  "Tacos from the truck by the gas station, twice.",
];

const BEST_TIMES = [
  "Morning, before the sun comes round",
  "Afternoon, once it has dried",
  "Evening, in the shade",
];

const LESSONS = [
  "Skin gave out before strength did.",
  "The rest day helped more than any session.",
  "Everything felt a grade easier before ten.",
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
  if (plan.kind === "road") return "Fall road trip";
  return plan.kind === "day" ? `A day at ${place.name}` : `${place.name}, ${monthOf(start)}`;
}

/** Descriptions are visible to anyone who can see the trip, so they don't name
 * tagged friends. */
function describe(plan: Plan, place: Place): string | null {
  if (plan.kind === "day") return null;
  if (plan.kind === "road") return "A month on the road.";
  if (plan.kind === "upcoming") return `Planning ${plan.days} days at ${place.name}.`;
  if (plan.kind === "weekend") return `A long weekend at ${place.name}.`;
  return `${plan.days} days at ${place.name}.`;
}

type Sent = { climb: Climb; day: number; style: "redpoint" | "flash" };

/** Zero-based index of the rest day in a long trip, or -1. */
function restDayOf(plan: Plan): number {
  return plan.kind === "long" ? Math.floor(plan.days / 2) : -1;
}

function table(head: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [line(head), line(head.map(() => "---")), ...rows.map(line)].join("\n");
}

/** Sample notes. They cover logistics, conditions and plans, and name only a
 * couple of sends, since the page lists all of them. */
function writeNotes(
  plan: Plan,
  place: Place,
  sent: Sent[],
  open: Climb[],
  index: number,
  stops: Place[],
): string | null {
  const slug = place.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const pick = (pool: string[]) => pool[index % pool.length];
  if (plan.kind === "day") return null;

  if (plan.kind === "road") {
    return [
      `A month on the road and ${stops.length} stops.`,
      "# Stops",
      stops.map((stop, order) => `${order + 1}. ${stop.name}`).join("\n"),
      "# Driving",
      "About 1,400 km in all. The first day was the longest, and nothing after it was more than four hours.",
      "# Budget",
      table(
        ["", "Planned", "Spent"],
        [
          ["Fuel", "$300", "$340"],
          ["Camping", "$200", "$165"],
          ["Food", "$450", "$520"],
        ],
      ),
      "# Gear worth bringing",
      "- The big water container\n- A second pad\n- Camp chairs",
      "# Gear we never used",
      "- The hangboard",
    ].join("\n\n");
  }

  if (plan.kind === "upcoming") {
    return [
      "# Plan",
      "1. Drive up on the Friday night\n2. Easy climbing the first morning\n3. Save skin for the last two days",
      "# To book",
      "- [x] Campsite for the first four nights\n- [ ] Somewhere with a shower for the rest day\n- [ ] Time off work",
      "# To pack",
      "- [ ] New brushes\n- [ ] More tape than seems necessary\n- [ ] Stove fuel",
      "# Tick list",
      open.map((climb) => `- [ ] ${climb.name}`).join("\n"),
    ].join("\n\n");
  }

  // Highlight the last send and the first flash.
  const best = [...new Set([sent.at(-1), sent.find(({ style }) => style === "flash")])]
    .filter((send) => send !== undefined)
    .slice(0, Math.max(sent.length - 1, 0))
    .map(
      ({ climb, day, style }) =>
        `- **${climb.name}** on day ${day + 1}${style === "flash" ? ", flashed" : ""}`,
    );
  const next = open[0];

  if (plan.kind === "weekend") {
    return [
      `Drove up the night before and climbed ${plan.days} days at ${place.name}. ${pick(CONDITIONS)}`,
      "# Logistics",
      `- ${pick(STAYS)}\n- ${pick(APPROACHES)}`,
      "# Best of it",
      best.join("\n"),
      "# Next time",
      [
        "- Leave earlier, to be asleep before midnight",
        next && `- *${next.name}* looked good and had a queue`,
      ]
        .filter(Boolean)
        .join("\n"),
    ].join("\n\n");
  }

  const sectors = [...new Set(sent.map(({ climb }) => climb.sector))];
  return [
    `Climbed ${plan.days - 1} of ${plan.days} days. ${pick(CONDITIONS)}`,
    "# Getting there",
    `Six hours' drive, split over two days. ${pick(APPROACHES)}`,
    "# Where we stayed",
    pick(STAYS),
    "# When to climb where",
    table(
      ["Sector", "Best"],
      sectors.map((sector, order) => [sector, BEST_TIMES[order % BEST_TIMES.length]]),
    ),
    "# Highlights",
    [...best, "- Sunset from the top of the crag on the last evening"].join("\n"),
    "# Rest day",
    `Day ${restDayOf(plan) + 1}. Walked the far sector to look at what to try next, then laundry in town.`,
    "# Food",
    pick(MEALS),
    "# What worked",
    "- Short sessions early, before the wall came into the sun\n- A full rest day in the middle\n- Taping before the skin split",
    "# Next time",
    [
      next && `- [ ] *${next.name}* is still open`,
      "- [ ] Bring a second brush",
      "- [x] Book the same place again",
    ]
      .filter(Boolean)
      .join("\n"),
    `> ${pick(LESSONS)}`,
    `[Topo and approach notes](https://example.com/guides/${slug})`,
  ].join("\n\n");
}

/** Runs inside the caller's transaction, after the social seed. Tags need its
 * friendships, and re-running the social seed deletes them. */
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
  // Small seeds have only two levels of areas, with climbs on the second.
  if (places.length === 0) {
    places = db
      .prepare(
        "SELECT a.id, a.name FROM areas a JOIN climbs c ON c.area_id = a.id GROUP BY a.id HAVING count(c.id) >= 4 ORDER BY a.id",
      )
      .all() as Place[];
  }
  if (places.length === 0) return 0;

  const openClimbs = db.prepare(
    "SELECT c.id, c.name, c.type, c.grade, a.name AS sector FROM climbs c JOIN areas a ON a.id = c.area_id WHERE (c.area_id = ? OR c.area_id IN (SELECT id FROM areas WHERE parent_id = ?)) AND c.broken_on IS NULL AND NOT EXISTS (SELECT 1 FROM sends s WHERE s.user_id = ? AND s.climb_id = c.id) AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j.user_id = ? AND j.climb_id = c.id) ORDER BY c.id LIMIT ?",
  );
  const friendsOf = db.prepare(
    "SELECT u.id FROM friendships f JOIN user u ON u.id = CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted' ORDER BY CAST(substr(u.email, 8) AS INTEGER), u.id LIMIT ?",
  );
  const findTrip = db.prepare("SELECT id FROM trips WHERE user_id = ? AND name = ?");
  const insertTrip = db.prepare(
    "INSERT INTO trips (user_id, name, description, notes, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
  );
  const insertSend = db.prepare(
    "INSERT INTO sends (user_id, climb_id, ascent_style, date_sent, rating, suggested_grade, grade_feel, comment) VALUES (?, ?, ?, ?, ?, ?, 'solid', ?)",
  );
  const insertEntry = db.prepare(
    "INSERT INTO journal_entries (user_id, climb_id, kind, sent, is_ascent, entry_date, body) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const tag = db.prepare(
    "INSERT INTO trip_companions (trip_id, user_id, friendship_user_id, friendship_friend_id) VALUES (?, ?, ?, ?) ON CONFLICT (trip_id, user_id) DO NOTHING",
  );

  let created = 0;

  const placeFor = (index: number, plan: Plan) =>
    places[(index * PLANS.length + PLANS.indexOf(plan)) % places.length];

  function addTrip(person: Person, index: number, plan: Plan, plans: Plan[]) {
    const place = placeFor(index, plan);
    // Offset each climber's trips by up to three days, keeping past trips
    // before the seed date.
    const start = plan.kind === "road" ? plan.start : shiftDate(plan.start, index % 4);
    const name = tripName(plan, place, start);
    const friends = friendsOf.all(person.id, person.id, person.id, plan.friends) as Friend[];

    let trip = findTrip.get(person.id, name) as { id: number } | undefined;
    if (!trip) {
      // Fetch three extra climbs to mention as unsent in the notes.
      const climbs = openClimbs.all(
        place.id,
        place.id,
        person.id,
        person.id,
        plan.sends + 3,
      ) as Climb[];
      const restDay = restDayOf(plan);
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
        insertSend.run(
          person.id,
          climb.id,
          style,
          date,
          3 + ((index + order) % 3),
          // Analytics uses the send's suggested grade.
          climb.grade,
          comment,
        );
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
        writeNotes(
          plan,
          place,
          sent,
          open,
          index,
          STOPS.filter((stop) => plans.includes(stop)).map((stop) => placeFor(index, stop)),
        ),
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

  for (const plan of PLANS) addTrip({ id: viewerId, email: "" }, 0, plan, PLANS);
  for (const [index, person] of climbers.entries()) {
    // The first twelve climbers match the audiences described in the social
    // seed. After that, one in four has a trip.
    const plans = index < 12 ? (index % 3 === 0 ? PLANS : PLANS.slice(0, 2)) : PLANS.slice(1, 2);
    if (index >= 12 && index % 4 !== 0) continue;
    for (const plan of plans) addTrip(person, index + 1, plan, plans);
  }

  return created;
}
