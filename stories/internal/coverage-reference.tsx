import { Button } from "@heroui/react";
import { useState } from "react";

import { StoryPage } from "@/stories/fixtures/story-layout";

declare const STORYBOOK_COMPONENT_FILES: string[];
// Keys are source modules; values point to an example using their real exports.
// This is a discovery aid, not a claim that one story covers every state.
const examples: Record<string, string> = {
  "filters/filter-input.tsx": "components-filters-text-filter--filter-list",
  "filters/sends-filter-toolbar.tsx": "components-filters-sends-toolbar--date-and-hashtag",
  "ui/query-input.tsx": "components-inputs-query-field--character-limit",
  "search/search-controller.tsx": "components-search-controller--journey",
  "filters/climb-filter-controls.tsx": "components-filters-climb-controls--filters",
  "search/area-lookup.tsx": "components-search-area-lookup--selection",
  "climb-picker.tsx": "components-search-app-climb-picker--logging",
  "area-picker.tsx": "components-search-area-lookup--selection",
  "search/search-input.tsx": "components-search-input--input",
  "search/search-categories.tsx": "components-search-categories--categories",
  "search/search-results.tsx": "components-search-results--results",
  "search/search-selection-field.tsx": "components-search-selection-field--area",
  "filters/climb-filters.tsx": "components-filters-climb-filters--filters",
  "search/search-surface.tsx": "components-search-surface--full-results",
  "search/search-picker.tsx": "components-search-climb-picker--logging",
  "brand.tsx": "components-navigation-brand--navigation",
  "mobile-app-helper-panel.tsx": "components-feedback-mobile-app-helper--instructions",
  "send-fields.tsx": "components-journal-suggested-grade--boulder",
  "filters/date-filter.tsx": "components-filters-date-filter--date-range",
  "filters/filter-toolbar.tsx": "components-filters-toolbar--filters",
  "filters/discipline-chips.tsx": "components-filters-toolbar--filters",
  "filters/discipline-grade-sliders.tsx": "components-filters-toolbar--filters",
  "filters/climb-stats-filter-fields.tsx": "components-filters-climb-statistics--default",
  "filters/analytics-hashtag-filter.tsx": "components-filters-analytics-tags--default",
  "climb-list-sort-control.tsx": "components-filters-climb-controls--filters",
  "filters/active-filter-summary.tsx": "components-filters-active-filters--removable",
  "filters/active-filter-values.ts": "components-filters-sends-toolbar--active-collapsed",
  "filters/min-rating-filter.tsx": "components-filters-minimum-rating--any",
  "grade-histogram.tsx": "components-charts-grade-histogram--area-histogram",
  "ui/actions-menu.tsx": "components-navigation-actions-menu--actions",
  "ui/app-link.tsx": "components-navigation-app-link--default",
  "ui/card.ts": "patterns-layout-and-feedback--surface-treatments",
  "ui/choice-pill.tsx": "patterns-control-comparisons--choices",
  "ui/clamped-comment.tsx": "components-data-display-clamped-comment--long",
  "ui/collapsible-section.tsx": "components-layout-collapsible-section--responsive-section",
  "ui/confirm-delete-dialog.tsx": "components-feedback-confirm-delete-dialog--delete-confirmation",
  "ui/date-picker-field.tsx": "components-inputs-date-picker-field--dates",
  "ui/discipline-chip.tsx": "components-data-display-discipline-chip--boulder",
  "ui/empty-state.tsx": "components-feedback-empty-state--no-results",
  "ui/eyebrow.tsx": "components-data-display-eyebrow--with-icon",
  "ui/field.ts": "patterns-fields-standard-widths--comparison",
  "ui/grade.tsx": "components-data-display-grade--boulder",
  "ui/index-select.tsx": "components-inputs-index-select--range",
  "ui/layout.ts": "patterns-layout-and-feedback--panels",
  "ui/list-row.tsx": "components-data-display-list-row--default",
  "ui/load-more-button.tsx": "components-feedback-load-more-button--retry",
  "ui/not-found-message.tsx": "components-feedback-not-found-message--not-found",
  "ui/option-select.tsx": "components-inputs-option-select--default",
  "ui/page-shell.tsx": "components-layout-sidebar-layout--right",
  "ui/progress-bar.tsx": "components-feedback-progress-bar--progress",
  "ui/tags-field.tsx": "components-inputs-tags--existing-tags",
  "ui/rating-field.tsx": "components-inputs-rating-field--rated",
  "filters/area-climbs-toolbar.tsx": "components-filters-area-climbs-toolbar--default",
  "ui/rating-stars.tsx": "components-data-display-rating-stars--ratings",
  "filters/hashtag-filter.tsx": "components-filters-hashtag-filter--default",
  "ui/segmented-buttons.tsx": "components-inputs-segmented-buttons--default",
  "ui/settings.tsx": "components-layout-settings--sections",
  "ui/skeleton.tsx": "components-feedback-skeleton--default",
  "ui/sort-select.tsx": "components-inputs-sort-select--default",
  "ui/stat-strip.tsx": "components-data-display-stat-strip--statistics",
  "ui/typography.tsx": "components-data-display-typography--page-heading",
  "ui/user-avatar.tsx": "components-data-display-user-avatar--avatars",
  "ui/user-avatar-stack.tsx": "components-data-display-user-avatar-stack--authors",
  "ascent-style.tsx": "patterns-climbing-data--labels-and-grades",
  "analytics-calendar.tsx": "components-charts-analytics-calendar--multiple-years",
  "analytics-workspace.tsx": "components-charts-analytics-workspace--customize",
  "analytics-dashboard.tsx": "components-charts-analytics-dashboard--all-time",
  "analytics-year-filter.tsx": "components-inputs-analytics-years--selection",
  "analytics-grade-pyramid.tsx": "components-charts-grade-pyramid--grade-pyramid",
  "analytics-stat-tiles.tsx": "components-data-display-analytics-stats--summary",
  "area-breadcrumb.tsx": "patterns-navigation--area-navigation",
  "breadcrumbs.tsx": "patterns-navigation--area-navigation",
  "climbing-calendar.tsx": "components-charts-climbing-calendar--calendar",
  "feed-day-card.tsx": "components-journal-feed-day-card--activity-feed",
  "feed-card-content.tsx": "components-journal-feed-card-header--authors",
  "ui/help-tooltip.tsx": "components-forms-help-tooltip--field-help",
  "feed-group-card.tsx": "components-journal-feed-group-card--shared-climb",
  "friend-request-badge.tsx": "patterns-navigation--navigation",
  "import/wizard-steps.tsx": "components-import-wizard-steps--import-steps",
  "journal/companion-picker.tsx": "components-journal-companion-picker--selection",
  "journal/companion-list.tsx": "components-journal-companion-list--companions",
  "journal/project-board.tsx": "components-journal-project-board--projects",
  "journal/project-card.tsx": "components-journal-project-card--project",
  "journal/project-session-notes.tsx": "components-journal-project-sessions--sessions",
  "journal/journal-entry-fields.tsx": "components-journal-entry-fields--outdoor",
  "journal/tag-input.tsx": "components-journal-tag-input--journal-tags",
  "filters/journal-filter-toolbar.tsx": "components-filters-journal-toolbar--default",
  "journal/journal-entry-date-fields.tsx": "components-journal-entry-date--session",
  "product-tours/social-tour-previews.tsx": "components-tutorials-social-previews--feed",
  "logged-grade-histogram.tsx": "components-charts-logged-grade-histogram--logged-grades",
  "privacy-fields.tsx": "components-account-privacy-fields--privacy",
  "account-settings.tsx": "components-account-settings-page--member",
  "profile-heading.tsx": "patterns-profile-overview--profile",
  "profile-tabs.tsx": "patterns-navigation--navigation",
  "progression-chart.tsx": "components-charts-progression-chart--progression",
  "subarea-rail.tsx": "patterns-navigation--area-navigation",
};
const nonvisual = new Set([
  "search/search-types.ts",
  "ui/json-ld.tsx",
  "friend-requests-provider.tsx",
  "viewer-boundary.tsx",
  "product-tours/registry.ts",
  "product-tours/types.ts",
  "product-tours/use-tour-frame.ts",
  "product-tours/use-tour-target.ts",
]);
export function CoveragePage() {
  const [gapsOnly, setGapsOnly] = useState(false);
  const files = STORYBOOK_COMPONENT_FILES;
  const covered = files.filter((file) => examples[file]);
  const gaps = files.filter((file) => !examples[file] && !nonvisual.has(file));
  return (
    <StoryPage
      title="Component coverage"
      description="This inventory is generated from the components directory when Storybook starts or builds. A new source file appears as needing a story until linked here. Restart the dev server after adding files."
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
              {examples[file] ? (
                <a className="link text-sm" href={`./?path=/story/${examples[file]}`} target="_top">
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
