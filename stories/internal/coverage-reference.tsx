import { Button } from "@heroui/react";
import { useState } from "react";

import { StoryPage } from "@/stories/fixtures/story-layout";

declare const STORYBOOK_COMPONENT_FILES: string[];
/** Module → first story of its colocated `*.stories.tsx`, built in main.ts. */
declare const STORYBOOK_COLOCATED_STORIES: Record<string, string>;
// Modules shown by a pattern story or another module's file; a colocated
// `*.stories.tsx` needs no entry. Keys are source modules; values point to an
// example using their real exports. A discovery aid, not a claim that one
// story covers every state.
const examples: Record<string, string> = {
  "area-picker.tsx": "components-search-area-lookup--selection",
  "auth-form-parts.tsx": "components-auth-sign-in--unverified-email",
  "trips/trip-tabs.tsx": "components-trips-trip-header--journal",
  "trips/trip-share-controls.tsx": "components-trips-trip-header--shared-live",
  "filters/discipline-chips.tsx": "components-filters-toolbar--filters",
  "filters/discipline-grade-sliders.tsx": "components-filters-toolbar--filters",
  "climb-list-sort-control.tsx": "components-filters-climb-controls--filters",
  "filters/active-filter-values.ts": "components-filters-sends-toolbar--active-collapsed",
  "ui/card.ts": "patterns-layout-and-feedback--surface-treatments",
  "ui/choice-pill.tsx": "patterns-control-comparisons--choices",
  "ui/segment-pills.ts": "components-search-categories--categories",
  "ui/field.ts": "patterns-fields-standard-widths--comparison",
  "ui/layout.ts": "patterns-layout-and-feedback--panels",
  "ascent-style.tsx": "patterns-climbing-data--labels-and-grades",
  "area-breadcrumb.tsx": "patterns-navigation--area-navigation",
  "breadcrumbs.tsx": "patterns-navigation--area-navigation",
  "friend-request-badge.tsx": "patterns-navigation--navigation",
  "import/text-button.ts": "components-import-import-result--stopped",
  "subarea-rail.tsx": "patterns-navigation--area-navigation",
  "terms/versions/2026-09-09.tsx": "components-auth-terms-of-service--default",
};
const nonvisual = new Set([
  "search/search-types.ts",
  "ui/json-ld.tsx",
  "friend-requests-provider.tsx",
  "import/use-import-profile.ts",
  "journal/fetch-journal-page.ts",
  "viewer-boundary.tsx",
  "product-tours/registry.ts",
  "product-tours/types.ts",
  "product-tours/use-tour-frame.ts",
  "product-tours/use-tour-target.ts",
]);
const linked: Record<string, string> = { ...STORYBOOK_COLOCATED_STORIES, ...examples };
export function CoveragePage() {
  const [gapsOnly, setGapsOnly] = useState(false);
  const files = STORYBOOK_COMPONENT_FILES;
  const covered = files.filter((file) => linked[file]);
  const gaps = files.filter((file) => !linked[file] && !nonvisual.has(file));
  return (
    <StoryPage
      title="Component coverage"
      description="This inventory is generated from the components directory when Storybook starts or builds. A new source file appears as needing a story until it has a colocated stories file or is linked here. Restart the dev server after adding files."
    >
      <p>
        {covered.length} modules have examples · {gaps.length} need examples ·{" "}
        {files.filter((file) => nonvisual.has(file)).length} nonvisual modules.
      </p>
      <p className="text-sm text-muted">
        An example is not exhaustive workflow coverage. Profile navigation, for example, covers the
        presentation export, not authenticated request loading. Account actions, drawers,
        moderation, full import and journal workflows still need fixtures at their service
        boundaries. Their existing application tests remain necessary.
      </p>
      <Button variant="outline" aria-pressed={gapsOnly} onPress={() => setGapsOnly(!gapsOnly)}>
        {gapsOnly ? "Show all components" : "Show missing examples"}
      </Button>
      <ul className="divide-y divide-separator">
        {files
          .filter((file) => !gapsOnly || gaps.includes(file))
          .map((file) => (
            <li key={file} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <code className="text-xs break-all">{file}</code>
              {linked[file] ? (
                <a className="link text-sm" href={`./?path=/story/${linked[file]}`} target="_top">
                  View example
                </a>
              ) : (
                <span className="text-xs text-muted">
                  {nonvisual.has(file) ? "Nonvisual" : "Needs a story"}
                </span>
              )}
            </li>
          ))}
      </ul>
    </StoryPage>
  );
}
