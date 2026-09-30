import type { DatabaseSync } from "node:sqlite";

// Public clips from climbing film, brand and federation channels. Each link is
// in the form `sendVideoUrl` (lib/send-video.ts) stores. The app does not play
// a stored link in any other form.
const BOULDER_UNCUT = "https://www.youtube.com/watch?v=r6lWVJrigTA";
const BOULDER_FIRST_ASCENT = "https://www.youtube.com/watch?v=_9mPC5drdAM";
const BOULDER_FILM = "https://www.youtube.com/watch?v=YafSnTSMOKY";
const SPORT_ASCENT = "https://www.youtube.com/watch?v=WEgpW2_lt4Y";
const SPORT_UNCUT = "https://www.youtube.com/watch?v=mGTUAEwvL3Y";
const FILM_FROM_90_SECONDS = "https://www.youtube.com/watch?v=SbWvFjUIt5k&t=90s";
const COMPETITION_SHORT = "https://www.youtube.com/shorts/mt3vMDIFBBQ";
const SEASON_SHORT = "https://www.youtube.com/shorts/U9zR6Fo2VfE";
const BOULDER_SHORT = "https://www.youtube.com/shorts/dh9i0abKbeg";
const BRAND_REEL = "https://www.instagram.com/reel/DHlf5W0p-g-/";
const GEAR_REEL = "https://www.instagram.com/reel/C5TpPHKM4oN/";
const ICE_POST = "https://www.instagram.com/p/C2P_M7rL6e6/";

/** For the development account's newest dated sends, newest first. The fourth
 * holds five links, the most one send can have. */
const OWN_VIDEOS = [
  [BOULDER_UNCUT],
  [COMPETITION_SHORT],
  [BRAND_REEL],
  [FILM_FROM_90_SECONDS, BOULDER_SHORT, GEAR_REEL, ICE_POST, SPORT_ASCENT],
  [ICE_POST],
];

/** For each climber's demo-day send from the social seed, keyed by the number
 * in their email. Videos follow the send commentary audience, so the
 * development account can watch those from climbers 1, 3, 6 and 10. Those add
 * up to ten, two more than a climb page lists. */
const DEMO_DAY_VIDEOS: [number, string[]][] = [
  [1, [BOULDER_FIRST_ASCENT, SEASON_SHORT, BRAND_REEL]],
  [2, [BOULDER_FILM]],
  [3, [SPORT_ASCENT, SPORT_UNCUT]],
  [4, [BOULDER_UNCUT]],
  [6, [BOULDER_SHORT, BOULDER_FILM, ICE_POST]],
  [7, [GEAR_REEL]],
  [8, [SPORT_UNCUT]],
  [10, [BOULDER_FIRST_ASCENT, GEAR_REEL]],
];

/** For the newest dated send of three friends of the development account.
 * Climber 2 keeps send commentary private, so the feed shows that send without
 * its video. */
const NEWEST_SEND_VIDEOS: [number, string[]][] = [
  [1, [COMPETITION_SHORT]],
  [2, [BOULDER_FILM]],
  [12, [BOULDER_UNCUT]],
];

/** Days climber 6 shares with a tagged friend. The development account's feed
 * shows each as one activity. On the first both send, with videos from
 * different hosts. On the second climber 6 sends with a video and the friend
 * logs a session. Both days are after the three climbers' trips. */
const SHARED_DAYS = [
  {
    scenario: "both-send",
    date: "2026-09-28",
    note: "Sent it a few minutes apart.",
    videos: [SPORT_UNCUT],
    friend: 3,
    friendNote: "Second go after a long rest.",
    friendVideos: [BRAND_REEL],
  },
  {
    scenario: "one-sends",
    date: "2026-09-27",
    note: "Went down while the rock was still cool.",
    videos: [SEASON_SHORT],
    friend: 2,
    friendNote: "Fell at the last move twice. Coming back for it.",
    friendVideos: null,
  },
];

/** Cycled over every climber's send of the second climb, which makes it the
 * one climb with many sends and many videos. The development account can
 * watch only those its audiences allow, about a third of them. */
const POPULAR_CLIMB_VIDEOS = [
  [BOULDER_UNCUT],
  [COMPETITION_SHORT, BRAND_REEL],
  [SPORT_UNCUT, BOULDER_FILM],
  [SPORT_ASCENT],
  [ICE_POST],
  [BOULDER_FIRST_ASCENT, GEAR_REEL, SEASON_SHORT],
  [FILM_FROM_90_SECONDS],
  [BOULDER_SHORT],
];
const POPULAR_CLIMB_NOTES = [
  "Worth the walk in.",
  null,
  "The crux is the second clip, not the top.",
  "Better in the shade.",
  null,
];
/** The popular climb's sends end here, before any seeded trip starts. */
const POPULAR_CLIMB_LAST_DATE = "2026-08-31";

function shiftDate(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Links sample videos to seeded sends, adds the sends described above, and
 * returns how many sends it gave videos. The caller owns the transaction. Runs
 * after the social and trip seeds, which create the sends and friendships used
 * here. */
export function seedSendVideos(db: DatabaseSync, viewerId: string): number {
  const climbers = db
    .prepare(
      "SELECT id, email FROM user WHERE email GLOB 'climber[0-9]*@example.com' AND id <> ? ORDER BY CAST(substr(email, 8) AS INTEGER)",
    )
    .all(viewerId) as { id: string; email: string }[];
  // Small seeds may lack a climber. Each fixture that needs one is skipped.
  const climber = (number: number) =>
    climbers.find((row) => row.email === `climber${number}@example.com`);

  const link = db.prepare("UPDATE sends SET videos = ? WHERE id = ?");
  const insertSend = db.prepare(
    "INSERT INTO sends (user_id, climb_id, ascent_style, date_sent, rating, comment, videos) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const insertEntry = db.prepare(
    "INSERT INTO journal_entries (user_id, climb_id, kind, sent, is_ascent, entry_date, body, tags) VALUES (?, ?, 'session', ?, ?, ?, ?, ?) RETURNING id",
  );
  let linked = 0;

  /** A send and the journal entry that records it. Returns the entry's id. */
  function logSend(
    userId: string,
    climbId: number,
    send: {
      style: "redpoint" | "flash";
      date: string;
      rating: number | null;
      note: string | null;
      videos: string[] | null;
      tags: string | null;
    },
  ): number {
    insertSend.run(
      userId,
      climbId,
      send.style,
      send.date,
      send.rating,
      send.note,
      send.videos && JSON.stringify(send.videos),
    );
    if (send.videos) linked += 1;
    const entry = insertEntry.get(userId, climbId, 1, 1, send.date, send.note, send.tags);
    return (entry as { id: number }).id;
  }

  function linkEach(find: ReturnType<DatabaseSync["prepare"]>, fixtures: [number, string[]][]) {
    for (const [number, videos] of fixtures) {
      const person = climber(number);
      const send = person && (find.get(person.id) as { id: number } | undefined);
      if (!send) continue;
      link.run(JSON.stringify(videos), send.id);
      linked += 1;
    }
  }
  // In a seed without trips a climber's newest send is the demo-day send,
  // which then keeps its demo-day videos.
  linkEach(
    db.prepare(
      "SELECT id FROM sends WHERE user_id = ? AND date_sent IS NOT NULL ORDER BY date_sent DESC, id DESC LIMIT 1",
    ),
    NEWEST_SEND_VIDEOS,
  );
  linkEach(
    db.prepare(
      "SELECT s.id FROM sends s JOIN journal_entries j ON j.user_id = s.user_id AND j.climb_id = s.climb_id AND j.is_ascent = 1 WHERE s.user_id = ? AND j.tags LIKE '%social-demo%'",
    ),
    DEMO_DAY_VIDEOS,
  );

  const popular = db.prepare("SELECT id FROM climbs ORDER BY id LIMIT 1 OFFSET 1").get() as
    | { id: number }
    | undefined;
  if (popular) {
    const sent = db.prepare("SELECT id FROM sends WHERE user_id = ? AND climb_id = ?");
    for (const [index, person] of climbers.entries()) {
      const videos = POPULAR_CLIMB_VIDEOS[index % POPULAR_CLIMB_VIDEOS.length];
      const existing = sent.get(person.id, popular.id) as { id: number } | undefined;
      if (!existing) {
        logSend(person.id, popular.id, {
          style: index % 4 === 1 ? "flash" : "redpoint",
          date: shiftDate(POPULAR_CLIMB_LAST_DATE, -7 * index),
          rating: 3 + (index % 3),
          note: POPULAR_CLIMB_NOTES[index % POPULAR_CLIMB_NOTES.length],
          videos,
          tags: null,
        });
      } else {
        link.run(JSON.stringify(videos), existing.id);
        linked += 1;
      }
    }
  }

  const lead = climber(6);
  const findEntry = db.prepare(
    "SELECT id FROM journal_entries WHERE user_id = ? AND entry_date = ? AND tags = ? LIMIT 1",
  );
  const openClimb = db.prepare(
    "SELECT c.id FROM climbs c WHERE NOT EXISTS (SELECT 1 FROM sends s WHERE s.climb_id = c.id AND s.user_id IN (?, ?)) AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j.climb_id = c.id AND j.user_id IN (?, ?)) ORDER BY c.id LIMIT 1",
  );
  const accepted = db.prepare(
    "SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ? AND status = 'accepted'",
  );
  const tagCompanion = db.prepare(
    "INSERT INTO journal_companions (entry_id, user_id, friendship_user_id, friendship_friend_id) VALUES (?, ?, ?, ?) ON CONFLICT (entry_id, user_id) DO NOTHING",
  );
  for (const day of SHARED_DAYS) {
    const friend = climber(day.friend);
    if (!lead || !friend) continue;
    const [a, b] = lead.id < friend.id ? [lead.id, friend.id] : [friend.id, lead.id];
    // A companion tag needs an accepted friendship.
    if (!accepted.get(a, b)) continue;
    const tags = JSON.stringify(["video-demo", day.scenario]);
    let entryId = (findEntry.get(lead.id, day.date, tags) as { id: number } | undefined)?.id;
    if (entryId === undefined) {
      const climb = openClimb.get(lead.id, friend.id, lead.id, friend.id) as
        | { id: number }
        | undefined;
      if (!climb) continue;
      entryId = logSend(lead.id, climb.id, {
        style: "redpoint",
        date: day.date,
        rating: 4,
        note: day.note,
        videos: day.videos,
        tags,
      });
      if (day.friendVideos) {
        logSend(friend.id, climb.id, {
          style: "redpoint",
          date: day.date,
          rating: 4,
          note: day.friendNote,
          videos: day.friendVideos,
          tags,
        });
      } else {
        insertEntry.get(friend.id, climb.id, 0, 0, day.date, day.friendNote, tags);
      }
    }
    // Every social refresh resets synthetic friendships, which deletes the tag.
    tagCompanion.run(entryId, friend.id, a, b);
  }

  // Keep any videos already linked by hand on the development account.
  const hasOwnVideos = db
    .prepare("SELECT 1 FROM sends WHERE user_id = ? AND videos IS NOT NULL LIMIT 1")
    .get(viewerId);
  if (hasOwnVideos) return linked;
  const newest = db
    .prepare(
      "SELECT id FROM sends WHERE user_id = ? AND date_sent IS NOT NULL ORDER BY date_sent DESC, id DESC LIMIT ?",
    )
    .all(viewerId, OWN_VIDEOS.length) as { id: number }[];
  for (const [index, send] of newest.entries()) {
    link.run(JSON.stringify(OWN_VIDEOS[index]), send.id);
    linked += 1;
  }
  return linked;
}
