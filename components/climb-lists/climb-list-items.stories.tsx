import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { DEFAULT_CLIMB_FILTER } from "@/lib/filters/climb-filter";
import {
  climbListBreadcrumbs,
  climbListItemSamples,
  climbListSamples,
} from "@/stories/fixtures/climb-lists";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ClimbListHeader } from "./climb-list-header";
import { ClimbListItems } from "./climb-list-items";

const meta = {
  title: "Components/Climb lists/List climbs",
  component: ClimbListItems,
  args: {
    items: climbListItemSamples,
    totalCount: climbListItemSamples.length,
    areaBreadcrumbs: climbListBreadcrumbs,
    view: { sort: "position_asc", filter: DEFAULT_CLIMB_FILTER },
    signedIn: true,
    listId: 1,
    canEdit: true,
  },
  render: (args) => (
    <StoryPage title="List">
      <div className="flex flex-col gap-5">
        <ClimbListHeader list={climbListSamples[0]} back="/users/alex/lists" />
        <ClimbListItems {...args} />
      </div>
    </StoryPage>
  ),
} satisfies Meta<typeof ClimbListItems>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The owner's order: numbered, with Remove on every row. */
export const ListOrder: Story = {};

/** Sorted by grade, hardest first. Each row keeps a muted "#n" for its place
 * in the owner's order, and reordering waits for list order. */
export const SortedByGrade: Story = {
  args: {
    view: { sort: "grade_desc", filter: DEFAULT_CLIMB_FILTER },
    items: [...climbListItemSamples].sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0)),
  },
};

/** Exclude sent: the reader's sent climbs drop out, and the numbers skip them. */
export const ExcludeSent: Story = {
  args: {
    view: { sort: "position_asc", filter: { ...DEFAULT_CLIMB_FILTER, excludeSent: true } },
    items: climbListItemSamples.filter((item) => !item.sent),
  },
};

export const FilterMatchesNothing: Story = {
  args: {
    view: { sort: "position_asc", filter: { ...DEFAULT_CLIMB_FILTER, excludeSent: true } },
    items: [],
  },
};

/** Someone else's list: no Remove buttons. */
export const Visitor: Story = { args: { canEdit: false } };

/** Through a share link while signed out: the filters, but no sent state and
 * no Exclude sent. */
export const SignedOut: Story = {
  args: {
    canEdit: false,
    signedIn: false,
    items: climbListItemSamples.map((item) => ({ ...item, sent: null })),
  },
};
