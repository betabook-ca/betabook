import { Button } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { FeatureAnnouncement, FeatureAnnouncementScope } from "./feature-announcement";

const example = {
  featureId: "journal-tags",
  launchedAt: "2026-01-01T00:00:00Z",
  page: "/journal",
  title: "Your journal, organized",
  description:
    "Add tags to your sessions and training. Find the days you want to revisit with a quick filter.",
};
function renderExample(
  args: ComponentProps<typeof FeatureAnnouncement>,
  { dismissed = false, fails = false } = {},
) {
  return (
    <FeatureAnnouncementScope
      userId="story-viewer"
      page={example.page}
      announcements={dismissed ? [] : [example]}
      dismissAction={async () =>
        fails
          ? { ok: false, error: "Couldn’t save your dismissal." }
          : { ok: true, value: undefined }
      }
    >
      <FeatureAnnouncement {...args} />
    </FeatureAnnouncementScope>
  );
}
const meta = {
  title: "Components/Feature announcement",
  component: FeatureAnnouncement,
  args: {
    featureId: example.featureId,
    children: <Button variant="secondary">Journal tags</Button>,
  },
  render: (args) => renderExample(args),
  decorators: [
    (Story) => (
      <StoryPage title="Feature announcement">
        <div className="min-h-96 pt-6">
          <Story />
        </div>
      </StoryPage>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "The analytics route selects announcements using the viewer’s signup date, current time and saved dismissals. Wrap eligible announcements in FeatureAnnouncementScope with the viewer ID and page, then mark each available target with its featureId. The oldest eligible release appears first. Closing an announcement permanently dismisses it. Opening its workflow hides it for this visit. Keep IDs and launch timestamps stable across copy edits. See Patterns / Feature announcements for examples across signup dates.",
      },
    },
  },
} satisfies Meta<typeof FeatureAnnouncement>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Undismissed: Story = {};
export const PreviouslyDismissed: Story = {
  render: (args) => renderExample(args, { dismissed: true }),
};
export const DismissalFails: Story = { render: (args) => renderExample(args, { fails: true }) };
