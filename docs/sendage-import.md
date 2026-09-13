# Sendage import

The account import page accepts a public Sendage username or a
`https://sendage.com/user/<username>` link. The username stays in form state for
the current import. It is not saved in browser storage or the database, and a
new import starts with an empty field. No Sendage login is needed.

## Verified API behavior

Verified in Chrome on September 8, 2026 using
[the profile page](https://sendage.com/profile?tab=sends) and
[the supplied public profile](https://sendage.com/user/crislink?tab=sends).

- `GET /api/v2/user.getProfile` with `input={"json":{"username":"…"}}`
  returns `result.data.json.profile`, including `id`, `slug`, `isPrivate`, and
  `totalSends`.
- `GET /api/v2/climb.search` takes a profile `userId`,
  `includeUserClimb: true`, the redpoint/flash/onsight filter, discipline filters,
  and a numeric page `cursor`. It returns `result.data.json.items` and
  `nextCursor`. Each item contains `climb` and `userSend`. Betabook has no
  boulder onsights, so a Sendage boulder onsight is saved as a flash.
- The public client limits search cursors to 0–20 (20 rows per observed page).
  The importer respects this limit and rejects incomplete results, including a
  missing final cursor when fewer sends were returned than the profile count.
  It does not split searches to bypass the limit.

This is Sendage's website API, not a documented third-party integration contract.
Response validation, bounded pagination, cancellation, per-request timeouts, and
clear fallback errors protect against changes. The browser fetches directly from
the fixed Sendage origin; no arbitrary URL proxy or stored credentials are used.

## Mapping

The adapter creates in-memory source columns for the existing import wizard; it
does not generate, download, or upload a CSV. Sendage's grade IDs use their own
scale. `lib/sendage-import.ts` converts the North American ID ranges verified
against [Sendage's public client](https://sendage.com/webapp-assets/index-D30Z5_34.js).
The table contains contiguous IDs 1–140 with North American and French labels
for each discipline; boulder labels exist only through ID 96. For example,
route ID 62 is `5.12a` in North American and `7a+` in French. Sport and trad share
the route labels. The compact range lookup was compared against all 140 route
entries and all 96 boulder entries with no differences on September 8, 2026.

The source grade IDs do not change with the viewer's display setting. No grading
preference is requested, imported, or stored. Recognized IDs become V/YDS labels;
unknown, malformed, or unsupported discipline/grade combinations abort the entire
download, including when encountered on a later page. Personal and posted grades
are checked independently. Personal and posted grades stay separate. Matching prefers the posted grade,
falling back to the climber’s grade when the posted grade is absent; the climber’s
grade remains the send’s suggested grade. Zero
stars means unrated, null day means undated, and difficulty -1/0/1 maps to
soft/fair/stiff. The existing parser handles HTML entities and validates dates.

Beta, attempts, and first-ascent fields have no equivalent send fields in Betabook.
A visible warning explains that they remain source columns and can be mapped to
Comment. The existing review, duplicate handling, batch receipts, and atomic
send/journal writes are reused.

The Journal product tour remains accurate; this adds an entry point to the
separate account import wizard and does not change the logging tutorial.
