import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ProductTour } from "./product-tour";

const meta = {
  title: "Components/Product tour/Invitation",
  component: ProductTour,
  args: { initialState: { returning: false, progress: [] } },
  parameters: { nextjs: { navigation: { pathname: "/users/demo/journal" } } },
} satisfies Meta<typeof ProductTour>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FirstVisit: Story = {};
/** An account from before the tour launched, with no tour progress. */
export const ReturningAccount: Story = {
  args: { initialState: { returning: true, progress: [] } },
};
/** Took the previous version: only the lesson that changed since. */
export const WhatsNew: Story = {
  args: {
    initialState: {
      returning: false,
      progress: [{ tourId: "journal", version: 4, status: "completed" }],
    },
  },
};
/** Dismissed the first version and missed several releases. */
export const WhatsNewAfterSeveralReleases: Story = {
  args: {
    initialState: {
      returning: true,
      progress: [{ tourId: "journal", version: 1, status: "dismissed" }],
    },
  },
};
