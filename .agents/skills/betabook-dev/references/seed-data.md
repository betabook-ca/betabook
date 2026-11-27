# Seeded accounts and fixtures

All seeded accounts use `password` unless a different password was passed when seeding.

## Seed commands

```bash
pnpm seed                                # 400 areas, 5,000 climbs, 50 climbers
pnpm seed --email me@example.com --password local-password --name "Local Climber"
pnpm seed --areas 50 --climbs 500 --users 3 --seed 7 --force
pnpm seed --social                       # add feed scenarios to an existing local seed
```

- The development account is upserted on every run, preserving its ID. Seeding preserves its
  privacy preferences.
- Sample data is generated only when there are no climbs or when `--force` is passed. **`--force`
  clears local areas, climbs, sends, journal entries, trips, and synthetic climbers**, including the
  development account's logs and trips.
- A fixed seed and size reproduce the same sample history.
- The seed script writes directly to the database and never sends email; the product tour's sample
  controls also send nothing.
- `--social` refreshes the social scenarios without regenerating climbs or removing the
  development account's logs, videos (once it has any) or privacy settings. It resets relationships
  and journal tour progress for synthetic accounts, preserves connections between other accounts and
  dev's tour progress, and does not duplicate activity when repeated. Run it to restore the
  scenarios below after testing.
- The full social set requires at least 16 synthetic users. Eight authors have a mixed-activity day
  on 2026-09-01; very small climb datasets may lack room for it.

## Terms of Service

The development account and all but the highest-numbered synthetic climber have accepted the
current Terms. With the default seed, use `climber50@example.com` to test the agreement flow. Every
`pnpm seed` run, including `--social`, refreshes acceptance for existing seeded accounts and resets
that climber's acceptance and history. Other accounts are left alone.

## Audiences

New accounts default to **Members** send commentary and **Friends** journal entries. The Members
label uses the stored `frontend/public` value. Send commentary covers original-send notes on climb pages,
Sends, the feed, and mirrored ascent notes in the journal. The journal audience is labeled **Journal
and goals** and covers the journal, sessions, repeats, training, tags and finished goals in friends'
feeds. A private profile overrides both and turns the climber's sends into anonymous rows on climb
pages; the disabled selectors show Only me while retaining the saved choices.

Signed out, area/route names, hierarchy, descriptions, grades, disciplines, community ratings and
ascent counts are public. Climb pages list the latest 10 sends anonymously with month-only dates,
naming only climbers who share send commentary with **Everyone**. Everything else requires login.

The first four accounts demonstrate independent sharing and the private-profile override:

| Account                | Profile | Send commentary          | Journal entries          |
| ---------------------- | ------- | ------------------------ | ------------------------ |
| `climber1@example.com` | Members | Members                  | Members                  |
| `climber2@example.com` | Members | Only me                  | Members                  |
| `climber3@example.com` | Members | Members                  | Only me                  |
| `climber4@example.com` | Private | Only me (saved: Members) | Only me (saved: Members) |

Fresh seeds cover all nine combinations of the commentary and journal audiences.

## Social scenarios

| Account                                         | Social scenario                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `dev@example.com`                               | Seven friends, one outgoing request, and two incoming requests                                                           |
| `climber1@example.com`                          | Friend of dev with member commentary and journal                                                                         |
| `climber2@example.com`                          | Friend with a member-shared journal and private send commentary                                                          |
| `climber3@example.com`                          | Friend with member-shared send commentary and an Only me journal                                                         |
| `climber4@example.com`                          | Friend with a private profile; hidden from discovery and feeds, name only in Friends                                     |
| `climber5@example.com`                          | No relationships in either direction, for the empty-feed flow                                                            |
| `climber6@example.com`, `climber7@example.com`  | Friends journals with Members commentary for climber 6 and Only me commentary for climber 7; opposite request directions |
| `climber8@example.com`                          | Dev's outgoing request; Friends journal inaccessible until accepted                                                      |
| `climber9@example.com`, `climber11@example.com` | Incoming requests from a private and a member-visible profile respectively                                               |
| `climber10@example.com`                         | No connection to dev; Friends journal inaccessible                                                                       |
| `climber12@example.com`                         | Friend of dev with Friends-only commentary and an Only me journal                                                        |
| `climber13@example.com`                         | Completed tour version 1; gets six What's new lessons                                                                    |
| `climber14@example.com`                         | Dismissed tour version 1; gets six What's new lessons                                                                    |
| `climber15@example.com`                         | Completed the current tour version; no invitation, full replay in Account                                                |
| `climber16@example.com`                         | No tour progress; gets the full ten-lesson tour                                                                          |

Dev's feed includes only accepted friends whose profiles are visible to members. Select **Friends**
in Account when testing shared access to dev's journal. Friend requests are independent of the
journal audience.

No account starts with a shared project, so Projects tabs are owner-only until one is shared from a
project card. Seeding creates no share links. A project link has no audience — anyone holding it can
open it.

### Checking request badges

Open **Community → Friends → Requests** as dev. Community, Friends and Requests should each show
**2** (excluding dev's outgoing request). Accepting one incoming request and declining the other
should change the badges to **1**, then hide them. `climber5@example.com` has no badge. Counts load
after the page renders and refresh immediately after handling a request; navigation and returning
to the app check at most once per minute; an idle tab does not poll.

### Checking request emails

With `RESEND_API_KEY` empty, send a new request from dev to `climber5@example.com`. The server
console should show one email for that account, naming Dev User and linking to
`/friends?view=requests`. Reloading keeps the request without another email. Cancel it afterward to
restore the empty-feed fixture.

## Trips

Dev and the first twelve climbers have trips: several days at one crag with sessions, sends, notes
and tagged friends. Dev has a long trip, a weekend, a single day, a road trip overlapping all three,
and an upcoming trip. Trips are dated after the rest of the seeded history, so no other sends fall
inside them. Trips follow the Trips audience; journal entries and tagged friends follow the journal
audience; notes are visible to friends. Seeded trips have no share links; create one from a trip's
Share button.

## Videos

Seeded videos cover YouTube videos and Shorts, Instagram reels and posts, a start time, and a send
with five videos. Videos follow the send commentary audience.

- Dev's five newest sends each link videos.
- Climb 1 has the 2026-09-01 send of climbers 1–4, 6–8 and 10. Dev sees the ten videos from
  climbers 1, 3, 6 and 10 and none from the others.
- Climb 2 has a send from every climber, each with one to three videos.
- The feed has two days climber 6 shares with a tagged friend: on 2026-09-28 climbers 6 and 3 both
  send one climb, with videos from different hosts; on 2026-09-27 climber 6 sends with a video and
  climber 2 logs a session.
- The newest sends of climbers 1, 2 and 12 link videos. The feed shows climber 2's send without one.

## Deleted sends

Deleting a send retains its journal entry and keeps its commentary audience, including after
further edits. Database triggers classify original-send notes for every write path.

## Seed checks

Against a disposable copy of a migrated, default-seeded SQLite database:

```bash
pnpm test:seed-social /path/to/copy.sqlite
pnpm test:seed-trips /path/to/copy.sqlite
```

CI's **Test & Build** job runs both against a freshly migrated and seeded database.
