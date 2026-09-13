import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";

import { AnalyticsYearFilter } from "@/components/analytics-year-filter";
import { FeatureAnnouncementScope } from "@/components/feature-announcement";
import { AnalyticsHashtagFilter } from "@/components/filters/analytics-hashtag-filter";
import { choicePillClass } from "@/components/ui/choice-pill";
import { DISCIPLINE_CHIP_CLASSNAME, DISCIPLINE_LABELS } from "@/components/ui/discipline-chip";
import type { AnalyticsSendRow } from "@/db/queries";
import { buildAnalyticsHighlights, type HighlightSession } from "@/lib/analytics-highlights";
import {
  ANALYTICS_CARD_IDS,
  DEFAULT_ANALYTICS_LAYOUT,
  parseAnalyticsLayout,
} from "@/lib/analytics-layout";
import {
  ANALYTICS_CUSTOMIZE_ANNOUNCEMENT,
  getAnnouncementCandidates,
} from "@/lib/feature-announcements";
import type { ClimbType } from "@/lib/grades";
import { buildUserAnalytics } from "@/lib/user-analytics";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { AnalyticsDashboard } from "./analytics-dashboard";

const meta = {
  title: "Components/Charts/Analytics dashboard",
  component: AnalyticsDashboard,
  parameters: {
    nextjs: { navigation: { pathname: "/users/sample/analytics", query: {} } },
    docs: {
      description: {
        component:
          "New dashboards start with Sends, Hardest, Days out, Flash, and Best year. Customize placeholders appear when a section has hidden items and open the same layout editor; Save layout persists the selection. Existing saved layouts remain unchanged. All cards and charts follow the selected years. The laptop grid fits six stat slots. Grade pyramid, Breakthroughs, and Flash rate use half-width slots, while time charts span the row. Volume and Flash rate are optional smooth Recharts charts with floating tooltips; all calendars fit without horizontal scrolling. Customization changes only the owner’s view.",
      },
    },
  },
} satisfies Meta<typeof AnalyticsDashboard>;
export default meta;
type Story = StoryObj;

const sends: AnalyticsSendRow[] = [
  ["2024-04-03", 6, "First high point"],
  ["2025-01-01", 3, "Winter warmup"],
  ["2025-08-15", 4, "Summer slab"],
  ["2026-04-02", 7, "New high point"],
  [null, 8, "An undated ascent"],
].map(([dateSent, suggestedGrade, climbName], index) => ({
  climbId: index + 1,
  climbName: String(climbName),
  climbType: "boulder",
  suggestedGrade: Number(suggestedGrade),
  dateSent: dateSent == null ? null : String(dateSent),
  areaId: 1,
  areaName: "Forestland",
  ascentStyle: index === 2 ? "flash" : "redpoint",
}));

const sessions: HighlightSession[] = [
  {
    id: 1,
    entryDate: "2025-01-01",
    climbId: 2,
    climbName: "Winter warmup",
    climbType: "boulder",
    sent: false,
    isAscent: false,
    companions: [{ id: "sample-partner", name: "Alex" }],
  },
  {
    id: 2,
    entryDate: "2025-01-08",
    climbId: 2,
    climbName: "Winter warmup",
    climbType: "boulder",
    sent: false,
    isAscent: false,
    companions: [{ id: "sample-partner", name: "Alex" }],
  },
  {
    id: 3,
    entryDate: "2025-01-15",
    climbId: 2,
    climbName: "Winter warmup",
    climbType: "boulder",
    sent: true,
    isAscent: true,
    companions: [],
  },
  {
    id: 4,
    entryDate: "2025-01-22",
    climbId: 2,
    climbName: "Winter warmup",
    climbType: "boulder",
    sent: true,
    isAscent: false,
    companions: [{ id: "sample-partner", name: "Alex" }],
  },
];

const ALL_YEARS: number[] = [];

function getDemoAnnouncements(
  announcement: boolean,
  announcementDismissed: boolean,
  announcementNewUser: boolean,
) {
  return announcement && !announcementDismissed
    ? getAnnouncementCandidates([ANALYTICS_CUSTOMIZE_ANNOUNCEMENT], {
        page: ANALYTICS_CUSTOMIZE_ANNOUNCEMENT.page,
        availableFeatureIds: [ANALYTICS_CUSTOMIZE_ANNOUNCEMENT.featureId],
        userCreatedAt: new Date(
          announcementNewUser ? "2026-09-10T00:00:00Z" : "2026-01-01T00:00:00Z",
        ),
        now: new Date("2026-09-10T12:00:00Z"),
      })
    : [];
}

function DashboardExample({
  initialPeriod = ALL_YEARS,
  undatedOnly = false,
  persistent = false,
  visitor = false,
  saveFails = false,
  showHighlights = false,
  hiddenCharts = false,
  showFilters = false,
  announcement = false,
  announcementDismissed = false,
  announcementNewUser = false,
}: {
  initialPeriod?: number[];
  undatedOnly?: boolean;
  persistent?: boolean;
  visitor?: boolean;
  saveFails?: boolean;
  showHighlights?: boolean;
  hiddenCharts?: boolean;
  showFilters?: boolean;
  announcement?: boolean;
  announcementDismissed?: boolean;
  announcementNewUser?: boolean;
}) {
  const [scope, setScope] = useState<ClimbType>("boulder");
  const [period, setPeriod] = useState<number[]>(initialPeriod);
  const rows = undatedOnly ? sends.filter((send) => send.dateSent == null) : sends;
  const lifetime = buildUserAnalytics(rows, scope);
  const analytics = buildUserAnalytics(rows, scope, undefined, period);
  const content = (
    <StoryPage title="Analytics">
      <AnalyticsDashboard
        sends={rows}
        canCustomize={!visitor}
        initialLayout={
          showHighlights
            ? {
                ...DEFAULT_ANALYTICS_LAYOUT,
                cards: [
                  ...DEFAULT_ANALYTICS_LAYOUT.cards,
                  "partner",
                  "biggestProject",
                  "persistence",
                  "favoriteRepeat",
                ],
                charts: [...DEFAULT_ANALYTICS_LAYOUT.charts, "volume", "flashRate"],
              }
            : hiddenCharts
              ? {
                  ...DEFAULT_ANALYTICS_LAYOUT,
                  charts: DEFAULT_ANALYTICS_LAYOUT.charts.filter((id) => id !== "calendar"),
                }
              : persistent
                ? parseAnalyticsLayout({
                    ...DEFAULT_ANALYTICS_LAYOUT,
                    cards: [
                      "hardest",
                      ...ANALYTICS_CARD_IDS.slice(0, 10).filter(
                        (id) => id !== "hardest" && id !== "areas",
                      ),
                    ],
                  })
                : undefined
        }
        onSave={async () =>
          saveFails
            ? { ok: false, error: "Your layout couldn’t be saved. Please try again." }
            : { ok: true, value: undefined }
        }
        highlights={buildAnalyticsHighlights(undatedOnly ? [] : sessions, scope, period)}
        analytics={analytics}
        undatedCount={lifetime.datelessCount}
        scope={scope}
        journalVisible={false}
        selectedYears={period}
        periodPicker={
          showFilters ? (
            <>
              <nav aria-label="Discipline" className="flex flex-wrap gap-2">
                {(["boulder", "sport", "trad"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={scope === type}
                    className={choicePillClass(scope === type, DISCIPLINE_CHIP_CLASSNAME[type])}
                    onClick={() => setScope(type)}
                  >
                    {DISCIPLINE_LABELS[type]}
                  </button>
                ))}
              </nav>
              <AnalyticsHashtagFilter
                selectedTags={[]}
                tags={["trip", "project"]}
                controls={
                  <div className="min-w-0 flex-1">
                    <AnalyticsYearFilter
                      years={[2023, 2024, 2025, 2026]}
                      selected={period}
                      onChange={setPeriod}
                    />
                  </div>
                }
              />
            </>
          ) : (
            <AnalyticsYearFilter
              years={undatedOnly ? [] : [2023, 2024, 2025, 2026]}
              selected={period}
              onChange={setPeriod}
            />
          )
        }
      />
    </StoryPage>
  );
  return (
    <FeatureAnnouncementScope
      userId="sample"
      page={ANALYTICS_CUSTOMIZE_ANNOUNCEMENT.page}
      announcements={getDemoAnnouncements(announcement, announcementDismissed, announcementNewUser)}
      dismissAction={async () => ({ ok: true, value: undefined })}
    >
      {content}
    </FeatureAnnouncementScope>
  );
}

export const AllTime: Story = { render: () => <DashboardExample /> };
export const SelectedYear: Story = { render: () => <DashboardExample initialPeriod={[2025]} /> };
export const EmptyYear: Story = { render: () => <DashboardExample initialPeriod={[2023]} /> };
export const UndatedOnly: Story = { render: () => <DashboardExample undatedOnly /> };

export const MultipleYears: Story = {
  render: () => <DashboardExample initialPeriod={[2024, 2025]} />,
};

export const SavedLayout: Story = {
  render: () => <DashboardExample persistent initialPeriod={[2024, 2025]} />,
};

export const AnotherProfile: Story = { render: () => <DashboardExample visitor /> };
export const SaveFailure: Story = {
  render: () => <DashboardExample saveFails initialPeriod={[2024, 2025]} />,
};

export const AddCards: Story = {
  render: () => <DashboardExample initialPeriod={[2024, 2025]} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Customize cards" }));
  },
};

export const Highlights: Story = {
  render: () => <DashboardExample showHighlights initialPeriod={[2025]} />,
};
export const HiddenChart: Story = { render: () => <DashboardExample hiddenCharts /> };

export const Filters: Story = { render: () => <DashboardExample showFilters /> };

export const OptionalCharts: Story = {
  render: () => <DashboardExample initialPeriod={[2024, 2025]} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Customize charts" }));
    await userEvent.click(canvas.getByRole("button", { name: "Add Volume over time" }));
    await userEvent.click(canvas.getByRole("button", { name: "Add Flash rate by grade" }));
    await userEvent.click(
      within(canvas.getByRole("group", { name: "Dashboard actions" })).getByRole("button", {
        name: "Save layout",
      }),
    );
  },
};
export const FloatingSave: Story = {
  render: () => <DashboardExample initialPeriod={[2024, 2025]} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Customize dashboard" }));
    canvas
      .getByRole("button", { name: "Hide Sending calendar" })
      .scrollIntoView({ block: "center", behavior: "instant" });
    await canvas.findByRole("group", { name: "Save layout reminder" }, { timeout: 5000 });
  },
};
export const SaveErrorVisible: Story = {
  render: () => <DashboardExample saveFails />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Customize dashboard" }));
    await userEvent.click(
      within(canvas.getByRole("group", { name: "Dashboard actions" })).getByRole("button", {
        name: "Save layout",
      }),
    );
    await canvas.findByRole("alert");
  },
};
export const ExpandedFilters: Story = {
  render: () => <DashboardExample showFilters />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Expand filters" }));
  },
};

/** Real dashboard and announcement; only dismissal transport is local to Storybook. */
export const CustomizeAnnouncement: Story = {
  render: () => <DashboardExample announcement showFilters />,
};
export const CustomizeAnnouncementDismissed: Story = {
  render: () => <DashboardExample announcement announcementDismissed showFilters />,
};

export const CustomizeNewAccount: Story = {
  render: () => <DashboardExample announcement announcementNewUser showFilters />,
};
