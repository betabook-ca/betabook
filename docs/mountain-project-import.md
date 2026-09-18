# Mountain Project import

Account → Import sends → Mountain Project accepts a numeric user ID or a profile
link such as <https://www.mountainproject.com/user/200226064/eric-bonilla/ticks>.
The importer downloads the profile's tick export and hands it to the existing
matching and review wizard. Nothing is written until the user completes that
wizard. The ID stays in form state and is not saved to browser storage or the
database. No Mountain Project login is used.

## Verified public behavior

Verified signed out on September 16, 2026 against the supplied profile
[eric-bonilla](https://www.mountainproject.com/user/200226064/eric-bonilla/ticks).

- `GET /user/<id>/<slug>/tick-export` returns `200 text/csv; charset=UTF-8` with
  `Content-Disposition: attachment; filename=ticks.csv`. The example returned
  1,318 ticks in 352 KB.
- The slug is not checked: `/user/200226064/x/tick-export` returns the same file.
  Betabook therefore never puts a caller-supplied slug in the path.
- Omitting the slug redirects to the profile page and returns HTML, so the path
  always carries one.
- `GET /user/<id>` answers `301` with `Location: /user/<id>/<slug>`, which is how
  the display name is resolved without downloading the profile page.
- An unknown user ID returns `404` on both paths.
- The export is served without a `User-Agent` and to an unfamiliar one.
- No `Access-Control-Allow-Origin` header is returned, including for a request
  carrying Betabook's `Origin`. A browser cannot read the response, so the
  download is proxied by a signed-in, uncached route, as KAYA's is.

This is Mountain Project's website export rather than a documented integration.
The route sends no cookies, tokens, caller-supplied URLs or headers; only the
numeric ID varies. Response validation, per-request timeouts, byte caps,
cancellation, and errors that point at the CSV upload protect against changes.

## Mapping

The download is the same CSV the site hands a signed-in member, so the existing
Mountain Project column presets do the mapping: `Rating` is the route's grade,
`Your Rating` the climber's, `Your Stars` the rating (`-1` is unrated), `Location`
is the full area path used as hints from the wall up, and the derived
`Lead Style or Style` column supplies the ascent style. Protection suffixes such
as PG13, R and X are stripped from grades. The direct import duplicates no
parsing; it reuses `parseCsvText` and `deriveSourceColumns`.

Mountain Project's personal rating stops at 4 stars where Betabook's is 5, and
allows half stars. The rating step spreads the scale rather than compressing it
(4 → 5, 3 → 4, 2 → 2, 1 → 1, halves rounded, -1 unrated) and lists every star
value in the file so the climber can move any of them. Five-star sources keep
their own numbers. Any value that does not become a rating is reported, whether
it is unreadable or simply off the source's own scale; only an explicit unrated
marker (zero or negative) is silent.

Ticks are not all sends. `Send`, `Flash`, `Onsight`, `Redpoint`, `Pinkpoint` and
`Lead` map to ascent styles; `TR`, `Follow`, `Solo`, `Attempt`, `Fell` and `Hung`
do not, and rows carrying them are reported as unmapped until the user maps them
in the ascent style step. Because a recognized export skips straight to matching,
the adapter raises a warning naming the styles that would otherwise be skipped
silently. Combined route types such as `Trad, Alpine` resolve to their first
recognized discipline.

## Matching across two catalogs

Mountain Project and Betabook name and nest areas differently, so nothing
requires the two hierarchies to agree. A tick's `Location` path becomes area
_hints_, never the area itself: hints match anywhere in a candidate's ancestor
path, at any depth, leaf first, and only ever break ties between same-named
climbs. Area names are compared on a lossy key that ignores punctuation and
decoration, because Mountain Project ships names such as `**Bouldering at
Exit 38`, `(g) Black Dyke` and `Central-East Cascades, Wenatchee, &
Leavenworth` — 74 such segments in the verified profile alone.

Climb names are still looked up exactly, through the indexed
`LOWER(TRIM(name))` query. A name that finds nothing gets one more pass under
close spellings — leading `The`/`A`, apostrophe characters, separators,
punctuation and accents — which are looked up through that same indexed query
rather than by widening it. A candidate found that way is only accepted when the
row's area column or one of its _specific_ hints agrees — at most the three
most specific segments of a path, never its broadest, since a state or country
would confirm almost anything, and a chosen preferred area can be that broad
too. Such a match always lands in review naming both spellings; without
agreement it is offered for manual choice instead. Each recovered spelling keeps
its own server-side total, so a capped list is never mistaken for a complete
one. Rows whose name matches directly never consult these candidates, so exact
sources are unaffected. The pass is bounded at 500 names, each costing at most
eight extra lookups, deduplicated across names.

## Limits and failures

The proxy stops at the shared 10 MB import limit, both on an advertised
`Content-Length` and while streaming, and the browser applies the same cap plus
the 50,000-row limit. Each upstream request has its own timeout (15s for the name
lookup, 45s for the export) covering the body rather than only the headers,
which in Workers is where a fetch resolves; the route adds a two-minute deadline,
and cancelling in the form aborts the download in progress. A missing profile, a
rate limit, a non-CSV body, an export that redirects, and an empty file each
produce a distinct message and carry their own status, so a mistyped profile
answers 404 rather than reading as an upstream outage. Format failures tell the
user to upload Mountain Project's CSV export instead of contacting support first.

The repeated-date review, duplicate handling, broken-climb rule, batch receipts
and atomic send/journal writes are the shared ones. A tick on a climb that has
been marked broken imports only when it is dated before the break; undated or
later ticks are reported as unable to import, naming the climb and the date it
broke. No attempt is made to find the post-break climb for them. If such a row
still reaches the server, it is reported per row rather than failing the batch. The Journal tour remains accurate: this adds an
entry point to the separate account import wizard.

## Validation

```bash
pnpm test --project=workers lib/mountain-project-import.test.ts lib/mountain-project-api.test.ts app/api/import/mountain-project/route.test.ts
pnpm test:components components/import/mountain-project-import-form.dom.test.tsx components/import/import-wizard.dom.test.tsx
pnpm test --project=workers lib/import-matching.test.ts lib/sends-import.test.ts
```

Workers coverage exercises the real route with only session acquisition and
upstream transport replaced: sign-in, the fixed upstream paths, rejected IDs,
byte caps, and each upstream failure. The wizard test carries a two-row export
through matching to review, confirming the redpoint imports and the top-rope
tick is reported rather than written.
