# KAYA import

Account → Import sends → KAYA accepts a KAYA username or a public profile link such as
<https://kaya-app.kayaclimb.com/user/suzilu>. The importer loads outdoor boulders
and routes into the existing matching and review wizard. Nothing is written
until the user completes that wizard. Profile input stays in form state and is
not saved to browser storage or the database.

## Verified public API

Verified September 8, 2026 against the supplied profile and KAYA's public client
`https://kaya-app.kayaclimb.com/static/js/main.1228e5fb.chunk.js`:

- `webUser(username)` returns `id`, `username`, and `is_private`.
- `webAscentsForUser` accepts `filter_by: OUTDOOR`, `climb_type_id: "1"` for
  Bouldering or `"2"` for Routes, `sort_by: DATE`, and `offset`/`count` pagination.
  KAYA’s public client requests 50 ascents per page. Betabook requests **100**:
  verified against consecutive bouldering pages (offsets 0 and 100, no overlapping
  IDs) and the Routes query. This reduces the example’s ascent-page requests
  from 19 to 10.
- `webFilterDistributionForAscents`, with the same discipline and Outdoor
  filter, returns grade buckets with `ascent_count`. Their sum is checked
  against the entire downloaded discipline, including the final short page.
- The example returned **872 outdoor boulders and 24 outdoor routes**, all 896
  accepted by the real adapter. The first was Pixie Direct on August 20, 2026.

This is a website API rather than a documented third-party integration. KAYA's
GraphQL endpoint is `https://kaya-beta.kayaclimb.com/graphql`. Requests from the
Betabook browser origin were rejected with 403, while the public website's
Origin and Referer headers succeeded. A signed-in, uncached Betabook route makes
fixed public queries with those headers. It never forwards cookies, tokens,
caller-supplied URLs, user IDs, or GraphQL. Private and missing profiles are
rejected before fetching ascents. Each discipline checks the profile once and
pages in the same request. Public page requests are spaced two seconds apart;
rapid requests produced intermittent upstream errors during verification.

The route bounds response bytes, page sizes and totals, uses per-request
timeouts, and forwards cancellation. The browser bounds the combined import and
checks identity, duplicate ascent IDs, values, and totals. A failed second
discipline discards the first too. No partial history reaches the wizard.

## Waiting, retries, and streamed progress

The form explains before starting that large histories can take a few seconds.
During download it shows the current discipline, loaded/total counts, a progress
bar, and a reminder to keep the page open. Cancel remains available throughout.

Each discipline uses a streaming NDJSON response. A profile event establishes
identity, page events deliver at most 100 records at a time, retry events describe
why and how long to wait, and a required completion event confirms the total.
Errors after streaming begins arrive as error events. The browser validates
frames incrementally and keeps all rows in memory until both disciplines finish;
a lost stream or terminal error discards the incomplete import.

KAYA 429 responses use exponential backoff (5, 10, then 20 seconds, plus up to
one second of jitter), with at most three retries per failed request. Both
seconds and HTTP-date forms of Retry-After are respected as a minimum. A wait
longer than two minutes stops automatic retries and asks the user to try later;
the importer never shortens KAYA's requested wait. Network failures, per-request
timeouts, HTTP 408/500/502/503/504, and known transient GraphQL errors also retry.
Forbidden requests, incompatible schemas, and invalid data do not retry.

A retry notice shows a live countdown and attempt number. Heartbeats every
15 seconds keep the stream active during backoff. A 45-second inactivity timeout
catches broken connections without the old two-minute total download limit;
each server-side discipline request has a ten-minute overall deadline. Cancel
aborts the upstream request or backoff timer and clears heartbeat timers.

## Repeated-date review

The shared import wizard checks normalized calendar dates for every source,
including CSV uploads and direct profile imports. A day is flagged when at least
20 sends and 25% of dated rows share it. Undated and invalid rows do not inflate
the denominator, and small sessions do not trigger the callout.

Verified against the public profile
<https://kaya-app.kayaclimb.com/user/Chichiaventurero>: **49 of 60 outdoor sends
(82%) are dated September 3, 2025**. The remaining sends are dated March 18, 2026
(9) and March 14, 2026 (2), using the same local calendar dates as KAYA's website.

The warning appears in both matching and final review, including imports that
skip column mapping. It identifies each flagged day and explains the impact on
activity and grade-progression charts. Flagged dates remain unchanged by default.
An optional checkbox imports sends on a selected day without dates, while retaining
climbs, grades, ratings, notes, and manual matching choices. Changes are reversible
before saving, require no new climb lookup, and reset when a new file or mapping
is loaded. Controls are disabled during the final write. Existing CSV placeholder
timestamp handling remains separate from this review of concentrated dates.

## Mapping and limitations

Both the API filter and each returned climb's metadata enforce outdoor-only
imports: gym and board climbs are excluded, a destination or area is required,
and only Bouldering and Routes are supported. Exclusions are counted in a
visible warning. Deleted climbs are excluded too.

Personal and posted grades stay separate. Matching prefers the posted grade,
falling back to the climber’s logged grade when no posted grade is present. The
climber’s grade is still saved as the send’s suggested grade. Verified V/YDS labels are normalized,
unknown grades stop the import, and KAYA's explicit ungraded labels remain
available for the wizard's normal validation warnings. Null/zero ratings remain
unrated; stiffness -1/0/1 becomes soft/fair/stiff. Null dates and the existing
KAYA January 1, 1970 placeholder become undated. Other timestamps use the
browser's local calendar date, matching KAYA's web display, including timestamps
at midnight UTC. Comments use the wizard's existing HTML entity decoding.

The verified public web ascent fields do **not** include each ascent's style.
The Flash + Onsight pyramid is driven by aggregate counts per grade; for
example the profile returns 118 V5 ascents, comprising 97 redpoints, 20 flashes,
and 1 onsight. Those counts do not identify the style of individual ascents. The form
and matching screen explicitly warn that these sends use redpoint, and direct
users to CSV if they need to preserve flash/onsight. The CSV importer is unchanged.

KAYA groups all rope climbing as Routes. The import-specific route hint permits
sport and trad matches without choosing one prematurely or matching boulders,
even when the grade is missing. Location and destination are hints rather than
exact area constraints because the databases organize areas differently.

The Journal tour remains accurate: this adds an entry point to the separate
account import wizard and does not change journal logging.

## Validation

The focused adapter tests were observed failing before implementation, then
passing. Workers coverage exercises the real API route with only session
acquisition and upstream transport replaced. It checks sign-in, public-profile
restrictions, fixed queries, pagination, totals and failures. Mounted component
tests cover cancellation, retry, empty/reset state, competing source controls,
and direct navigation through matching to review without writing sends. The
source picker shows one form at a time, disables switching during a download,
and provides a direct CSV shortcut from KAYA's style notice. Its interaction
test was verified against a deliberate broken shortcut before restoring green.

The retry and streaming regression command was observed failing before the
change, then passing after implementation:

```bash
pnpm test --project=workers lib/kaya-api.test.ts app/api/import/kaya/route.test.ts -t 'honors Retry-After|returns a streaming response'
```

Additional tests cover retry exhaustion, HTTP-date delays, retrying the same
page, cancellation during backoff, heartbeats beyond two minutes, Unicode
across chunk boundaries, missing completion markers, and the countdown UI.

Repeated-date detection was verified red–green with
`pnpm test --project=workers lib/import-date-review.test.ts`. Mounted wizard
tests cover default date preservation, targeted undated imports, manual-skip
retention, CSV timestamps sharing one calendar day, and reset on a new file.
