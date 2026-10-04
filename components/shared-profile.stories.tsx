import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { UserSendRow } from "@/db/queries";
import { SHARED_OWNER, SharedProfileFrame } from "@/stories/fixtures/shared-profile-frame";

import { SharedProfile } from "./shared-profile";

const SENDS: UserSendRow[] = [
  {
    id: 1,
    climbId: 101,
    climbName: "Granite Staircase",
    climbType: "boulder",
    climbGrade: 7,
    areaId: 11,
    areaName: "Riverside Boulders",
    ascentStyle: "redpoint",
    dateSent: "2026-08-30",
    rating: 5,
    suggestedGrade: null,
    gradeFeel: "solid",
    videos: null,
    comment: "Finally stuck the heel hook on the last move.",
  },
  {
    id: 2,
    climbId: 102,
    climbName: "Sidepull Sonata",
    climbType: "sport",
    climbGrade: 12,
    areaId: 12,
    areaName: "Sunset Wall",
    ascentStyle: "onsight",
    dateSent: "2026-08-24",
    rating: 4,
    suggestedGrade: 11,
    gradeFeel: "low",
    videos: null,
    comment: null,
  },
  {
    id: 3,
    climbId: 103,
    climbName: "Morning Glory Arête",
    climbType: "trad",
    climbGrade: 9,
    areaId: 12,
    areaName: "Sunset Wall",
    ascentStyle: "flash",
    dateSent: "2026-08-17",
    rating: 3,
    suggestedGrade: null,
    gradeFeel: "high",
    videos: null,
    comment: null,
  },
  {
    id: 4,
    climbId: 104,
    climbName: "Lichen Parade",
    climbType: "boulder",
    climbGrade: 4,
    areaId: 11,
    areaName: "Riverside Boulders",
    ascentStyle: "flash",
    dateSent: "2026-08-09",
    rating: null,
    suggestedGrade: null,
    gradeFeel: "solid",
    videos: null,
    comment: null,
  },
  {
    id: 5,
    climbId: 105,
    climbName: "Crux Café",
    climbType: "sport",
    climbGrade: 10,
    areaId: 12,
    areaName: "Sunset Wall",
    ascentStyle: "redpoint",
    dateSent: null,
    rating: 4,
    suggestedGrade: null,
    gradeFeel: "solid",
    videos: null,
    comment: null,
  },
];

const NEXT = `/users/${SHARED_OWNER.id}?share=${SHARED_OWNER.token}`;

const meta = {
  title: "Components/Auth/Shared profile",
  component: SharedProfile,
  parameters: {
    fullWidth: true,
    nextjs: { navigation: { pathname: `/users/${SHARED_OWNER.id}` } },
  },
  args: {
    owner: SHARED_OWNER,
    sendCount: 128,
    sends: SENDS,
    areaBreadcrumbs: {
      11: [{ id: 1, name: "Squamish" }],
      12: [{ id: 1, name: "Squamish" }],
    },
    next: NEXT,
  },
  // Wraps the story in the profile header the page renders around it.
  decorators: [
    (Story) => (
      <SharedProfileFrame next={NEXT}>
        <Story />
      </SharedProfileFrame>
    ),
  ],
} satisfies Meta<typeof SharedProfile>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Preview: Story = {};

export const NoSendsYet: Story = {
  args: { sendCount: 0, sends: [], areaBreadcrumbs: {} },
};
