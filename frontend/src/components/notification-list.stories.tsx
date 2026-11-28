import type { Meta, StoryObj } from "@storybook/react-vite";

import type { SendAlert } from "@/lib/community-types";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { NotificationList } from "./notification-list";

const boulder = (id: number, name: string, grade: number) => ({
  id,
  name,
  type: "boulder" as const,
  grade,
});

const alerts: SendAlert[] = [
  {
    userId: "sam",
    name: "Sam Okafor",
    image: null,
    date: "2026-11-21",
    sends: 5,
    climbs: [
      boulder(1, "Iron Man Traverse", 6),
      boulder(2, "Bubba Lobotomy", 4),
      boulder(3, "Stem Gem", 3),
    ],
    updatedAt: 3,
    unread: true,
  },
  {
    userId: "mia",
    name: "Mia Chen",
    image: null,
    date: "2026-11-20",
    sends: 1,
    climbs: [{ id: 4, name: "Serenity Crack", type: "trad", grade: 21 }],
    updatedAt: 2,
    unread: false,
  },
];

const meta = {
  title: "Components/Community/Notification list",
  component: NotificationList,
  parameters: {
    docs: {
      description: {
        component:
          "One row per friend per send date. A single send names its climb; a session names its three newest sends and counts the rest. The dot marks alerts that arrived since the last visit.",
      },
    },
  },
  args: { alerts },
  decorators: [
    (Story) => (
      <StoryPage title="Notifications">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof NotificationList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Alerts: Story = {};
export const Empty: Story = { args: { alerts: [] } };
export const Loading: Story = { args: { alerts: undefined } };
