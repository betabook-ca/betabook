import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { DEFAULT_USER_SENDS_FILTER } from "@/lib/filters/user-sends-filter";
import { searchAreaFetcher } from "@/stories/fixtures/app-search-demo";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { UserSendsFilterToolbar } from "./sends-filter-toolbar";
const meta = {
  title: "Components/Filters/Sends toolbar",
  component: UserSendsFilterToolbar,
  args: {
    filter: DEFAULT_USER_SENDS_FILTER,
    basePath: "/users/sample/sends",
    tags: ["power", "trip"],
    areaFetcher: searchAreaFetcher,
  },
  decorators: [
    (Story) => (
      <StoryPage title="Sends filters">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof UserSendsFilterToolbar>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
export const Responsive: StoryObj<typeof meta> = {
  parameters: {
    fullWidth: true,
    docs: {
      description: {
        story:
          "Labels align to the first control’s vertical center across date, tag, area, rating, and ascent-style rows. Helper text stays below the control.",
      },
    },
  },
};
export const DateAndHashtag: StoryObj<typeof meta> = {
  name: "Date and tags",
  args: {
    filter: {
      ...DEFAULT_USER_SENDS_FILTER,
      dateFrom: "2026-09-01",
      dateTo: "2026-09-07",
      tags: ["trip"],
    },
  },
};

export const Expanded: StoryObj<typeof meta> = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Expand filters" }));
    await expect(canvas.getByRole("combobox", { name: "Tags" })).toBeVisible();
  },
};

export const AscentTags: StoryObj<typeof meta> = {
  args: {
    filter: {
      ...DEFAULT_USER_SENDS_FILTER,
      ascentStyles: ["flash", "onsight"],
      disciplines: ["boulder"],
    },
  },
  play: Expanded.play,
};

export const GradeRanges: StoryObj<typeof meta> = {
  args: { filter: { ...DEFAULT_USER_SENDS_FILTER, disciplines: ["boulder", "sport", "trad"] } },
  play: Expanded.play,
};

export const ActiveCollapsed: StoryObj<typeof meta> = {
  args: {
    filter: {
      ...DEFAULT_USER_SENDS_FILTER,
      disciplines: ["boulder"],
      boulderRange: [4, 9],
      tags: ["trip"],
      ascentStyles: ["flash"],
      minRating: 3,
      maxRating: 4,
    },
  },
};

export const SingleDay: StoryObj<typeof meta> = {
  args: { filter: { ...DEFAULT_USER_SENDS_FILTER, date: "2025-06-01" } },
};
export const DateRange: StoryObj<typeof meta> = {
  args: { filter: { ...DEFAULT_USER_SENDS_FILTER, dateFrom: "2025-06-01", dateTo: "2025-08-31" } },
};
