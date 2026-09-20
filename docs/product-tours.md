# In-page product tours

Tours run at `/tutorial/[tourId]/[stepId]` inside the app shell. The page uses Alex Morgan's sample data and the same workspace tabs, sidebar layouts, list rows, and charts as the app. A spotlight outlines one control and dims the surrounding demo content. The short guide has its own column at the app's desktop breakpoint and its own row below the demo on smaller screens. It must never cover the demo; spotlight dimming must stay inside the demo pane.

## Add a step or feature

1. Add a step to `PRODUCT_TOUR_STEPS` in `lib/product-tour-navigation.ts`: a stable `id`, `section`, `title`, short `description`, `target`, and `introducedInVersion`. Keep each callout to one explanation. Do not repeat its text inside the demo.
2. Add `data-tour-target="your-target"` to the relevant control or small group in the feature view. Avoid targeting a whole page or a long list. Targets must be visible and unique within the view; do not select them by CSS classes or translated text.
3. Render the section in the feature's page component. `ProductTourPageProps` supplies its section, the active `steps`, and `href(stepId)` for links that preserve the replay destination. Reuse the app's layouts and display components. Keep demo controls local and never pass sample IDs to real links or mutation components.
4. For a separate tour, register its metadata in `lib/product-tour.ts`, steps in `PRODUCT_TOUR_STEPS`, and a lazy page loader in `components/product-tours/registry.ts`. The existing route layout handles the rest. An optional quick action beside the invitation belongs in `quick-actions.tsx`.

The Journal tour covers Log, journal filters, Sends sorting, project history, Analytics, climber discovery, friend requests, Feed, and privacy. The sample Log control is a visual reference in the full tour, in a header row above the sample workspace as Log sits beside Search in the app, with no click action or popover. First-time invitations include an ordinary Log button. Update invitations and update demos omit both Log controls.

Owner lessons use the app's task-first workspace frame, which leads with prominent subpage tabs instead of a repeated workspace title. The accessible heading names the selected subpage and workspace. The journal demo shares the entry layout with the app and retains the established entry-type filter pills. Notes run below the entry header; journal text search remains directly visible. These presentation changes use shared components without adding or renaming lessons or targets. Logbook groups Journal
and Sends; Progress groups Goals, Projects, and Analytics; the existing project and analytics lessons retain their step IDs. The large climber
profile header is reserved for viewing another climber. Community groups Feed
and Friends. Account settings contains identity, sharing, and account controls. Demo links
stay within the tutorial. Lesson order and stable step IDs remain in the catalog.
Discovery uses a separate Search surface, with the same All / Climbs / Areas / Climbers categories and result rows as the app. Search is
not a profile tab. The lesson starts in Climbers; category changes, search
submission, sample results, and friend requests stay local. Its View your feed link
opens the feed lesson while preserving full/update mode and the exit destination.
Find climbs is its own section over the same surface, mirroring the app's `/search`
page: it opens in Climbs with Pine Canyon preselected and the nameless list already
populated from `TOUR_DEMO_CLIMBS`. The area lookup, discipline chips, grade ranges,
rating, min ascents, and sort all narrow the sample list locally with the catalog's
own semantics; result rows have no links and selections stay on the page. The
`climb-filters` target wraps the filter bar through the controller's
`filtersTourTarget` prop, which the app never sets. The example sidebar and menu
carry the app's Find climbs row, opening this lesson; the header search control
still opens the Climbers lesson.

Tutorial content uses the app's sort dropdown and direction control, project card and session timeline presentation, journal grades/status, and settings panel framing. The project example loads additional local notes with the standard Load more control. Display-only project components contain no fetches or real links for sample data.

The contained preview uses the same primary navigation links, sidebar interaction frame, mobile tab links, and search control as the app. It adapts to the preview's available width, with Logbook, Progress, and Community in the primary navigation. Account settings stays at the bottom of the desktop sidebar and is available from the example mobile hamburger menu, outside the three bottom tabs. While typing hides those tabs, the example menu also includes the primary destinations. All preview destinations point to tutorial routes; primary area changes open the corresponding full-tour lesson while preserving the exit context. Community exposes Feed/Friends subpage links and the example request count stays consistent across those lessons. The example search control opens the search lesson and does not advertise the real app's global keyboard shortcut. At desktop preview widths, header controls are 40px high and both the sidebar navigation and lesson content begin 8px below the 56px header; narrower previews retain 44px controls and 16px content padding. Goals lesson content remains outside this tour. Existing lesson IDs, targets, and versioning are preserved.
Next, Back, and the lesson chooser connect Search with the workspace lessons.
The Friends lesson uses the shared section navigation and request badge for its
Friends / Requests controls. Demo selections use local callbacks, with no URLs
or writes. Accepting or declining the sample request clears both sample badges;
the signed-in account's real count remains separate.

The sample request buttons use `FriendshipActionButton`, including the same
confirmation dialogs as real cancellation, decline, and removal. Their callbacks
only change demo state. In the app, Community in the desktop sidebar and phone tab bar shows incoming
request counts. The mobile menu repeats Logbook, Progress, and Community only while the
phone tabs are unavailable, including during tutorials; its Community link then
shows the same count. The mobile hamburger opens secondary navigation and has no duplicate request badge.
Account settings is always available in the mobile menu and contains sign-out. The desktop sidebar also keeps a
sign-out shortcut.

## Navigation and overlays

The URL owns the current step. `parseProductTourNavigation` applies the same allowlist and duplicate-parameter rules to server and client inputs. Build links with named options, for example `productTourPath(tour.id, { stepId, from: "journal", mode: "updates" })`. `resolveProductTour` owns invitation eligibility, the active steps, and the fallback from an acknowledged update to full replay; use it for both invitations and playback. Invitation copy is selected by `getProductTourInvitationCopy`. Next, Back, profile tabs, the All tutorials menu, refresh, and browser history all resolve through the same step catalog. The persistent route layout loads the feature once and suspends the mobile installation helper while mounted. Individual content controls reset when their preview unmounts; the example friendship state persists across navigation for the duration of the open tour.

The guide and demo are separate, nonmodal regions. The demo scrolls independently and has a tab stop for keyboard scrolling. The step heading receives focus, Escape exits, and the close button is always available. Each step shows its explanation directly. Back, Next, and All tutorials stay outside the guide's scrolling text area.

The frame fits below the app header and responds to changes in the visual viewport. Preview navigation remains outside the lesson's inner scroll region. New targets scroll into view with space for nearby results. Expanded controls are revealed with the smallest necessary scroll. The target outline and dimming follow the target's scroll region and stay clipped inside it, so they cannot draw over the guide or app navigation. The spotlight does not intercept clicks. Missing or offscreen targets hide the spotlight while the guide stays usable.

Exit returns to Account for Account replay and otherwise to the user's Journal. These destinations are derived from the authenticated account, not arbitrary return URLs. Finishing saves completion and opens the user's Journal. The route is authenticated, rejects unknown tour/step IDs, and is not indexable.

## Sample account

`lib/product-tour-demo.ts` defines Alex Morgan's browser-only fixtures. Journal entries are the source for sends, projects, and analytics; analytics use the production calculation. No database demo account is needed. Negative sample IDs must never enter entity links, real forms, or actions. The only tour mutation is saving the authenticated user's dismissal/completion status. `PrivacyFields` is shared with Account: its Send commentary selector offers Only me, Friends, Members, and Everyone, its Journal entries selector offers the first three, and all fields use local state callbacks in the tutorial, while `PrivacyControls` owns real saving and error handling. The privacy lesson demonstrates member commentary with a Friends-only journal. A private profile disables both selectors and shows the effective Only me audience; switching back restores the saved choices. The commentary audience also protects the mirrored original-ascent note inside a visible journal. Its signed-in member summary lists the audiences separately. Keep the shared fields free of actions.

## Progress and replay

`user_product_tours` stores a version and dismissed/completed status for each user and tour. Existing atomic updates prevent stale tabs from downgrading completed or newer progress. An invitation appears on the owner's Journal when that version has not been dismissed or completed. Account always offers replay; replay does not clear saved progress. Closing a tour does not mark it complete. Loading and completion failures have retry controls.

To add lessons after release, bump the tour's `version` and set each new step's `introducedInVersion` to that version. For a substantial change to an existing lesson, set its `updatedInVersion` to the new version while keeping its ID and introduction version. Copy edits do not need a bump.

The journal tour is currently version 5. Version 1 introduced Journal, Sends, Projects, Analytics, and Account privacy. Version 2 added `find-climbers`, `friend-requests`, and `feed`, and substantially updated the existing `account` lesson for independent commentary and journal audiences. Version 3 adds `find-projects`, the Find climbs lesson, placed before `find-climbers` in catalog order. Version 4 substantially updates `projects`: the tab now lists climbs the climber pinned rather than every unsent climb with a session, and sent pins move to the Sent sub-tab under Projects. Version 5 updates the same lesson again for project share links, which make the sentence about the list being private only half true. Version 4 progress produces a single update lesson, and so does version 3; version 2 produces two and version 1 produces six, because the revised `projects` lesson re-enters every subset older than version 5; first-time visits and Account replay include all ten. `climber-search-preview.tsx` and `social-tour-previews.tsx` use local search, request, acceptance, removal, and feed filter state with fictional people from `lib/product-tour-demo.ts`. They use shared display components without linking sample profiles or calling actions.

An account that completed or dismissed an older version gets a **What's new** invitation containing only lessons introduced or substantially updated since that saved version. Users who missed several releases see all the additions in catalog order. First-time users see the full tour, including existing accounts that have no tour progress. A version bump without any changed lessons does not produce an invitation.

Update links use `?mode=updates`. The authenticated user's saved version selects the lessons; it is never taken from the URL. Next, Back, the step chooser, counters, and demo section links use that subset. Demo pages should derive section navigation from the supplied `steps`, using the first active step in each section. Refresh and sign-in preserve update mode. A link to an old step in update mode moves to the first eligible step. Already-acknowledged update links fall back to full replay.

**Full tour** switches to all lessons, and Account replay always shows the complete tour. Finishing or dismissing the update saves the current tour version using the existing progress action. Exiting partway through does not acknowledge the update or track individual steps. Adding a separate tour ID tracks progress independently and needs no schema change.

## Verify changes

- Check invitations, Account replay, Exit, Finish, direct links, refresh, and browser Back/Forward.
- Check each target at desktop and phone widths in both themes, including scroll, keyboard focus, Escape, and short viewports. The guide and demo must not overlap, including when the step chooser or a demo disclosure is open.
- Exercise filters, sorting, project disclosure, chart explanation, and privacy toggles. Check that no sample data or settings reach the real account.
- Test first-time, completed, dismissed, skipped-version, revised-step, and single-step update cases. Check that guide and step navigation stay within the update subset, while primary preview links open full-tour lessons with the same exit context and Account replay includes every lesson.
- Test step/route validation and positioning logic. Keep the existing persistence tests. Run `pnpm check` and the Cloudflare production build before updating the PR.
