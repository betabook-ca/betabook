import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { UserSendRow } from "@/db/queries";

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
    comment: null,
  },
];

const meta = {
  title: "Components/Auth/Shared profile",
  component: SharedProfile,
  parameters: { fullWidth: true },
  args: {
    owner: { name: "Alex Rivera", image: null, createdAt: new Date("2021-05-01T12:00:00Z") },
    summary: {
      sendCount: 128,
      areaCount: 14,
      peakGrade: "V7",
      mostLoggedDiscipline: { type: "boulder", count: 86 },
      latestSendDate: "2026-08-30",
    },
    sends: SENDS,
    areaBreadcrumbs: {
      11: [{ id: 1, name: "Squamish" }],
      12: [{ id: 1, name: "Squamish" }],
    },
    next: "/users/Qm7c2VdN4pX8rT1yK6hB9wLs3JfZ0aEu?share=4f9c2a7e1b8d6035c9e4a1f7b2d80e36",
  },
} satisfies Meta<typeof SharedProfile>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Preview: Story = {};
export const NoSendsYet: Story = {
  args: {
    summary: {
      sendCount: 0,
      areaCount: 0,
      peakGrade: null,
      mostLoggedDiscipline: null,
      latestSendDate: null,
    },
    sends: [],
    areaBreadcrumbs: {},
  },
};
