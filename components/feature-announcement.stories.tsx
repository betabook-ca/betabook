import { Button } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
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
          "Load getPageFeatureAnnouncements(db, session.user, { page, availableFeatureIds }) in the signed-in page loader. It filters the central registry against the viewer’s signup date and current UTC time, then reads dismissal IDs in one query. Wrap the page in FeatureAnnouncementScope with that ordered result and the viewer ID/page; wrap each available target in FeatureAnnouncement using its featureId. The scope shows the oldest eligible release and never advances within a visit, including after server refreshes. X permanently dismisses it; opening its workflow only temporarily hides it. Register immutable launchedAt timestamps and stable IDs; editing copy never resets eligibility or dismissal. Stories replace only the save transport. See Patterns / Feature announcements for five releases across signup dates. Existing tutorials stay unchanged because the underlying workflows are unchanged.",
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
