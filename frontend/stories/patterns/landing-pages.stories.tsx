import type { Meta, StoryObj } from "@storybook/react-vite";

import InfoRouteView from "@/spa/routes/info-routes";

const meta = {
  title: "Patterns/Landing pages",
  component: InfoRouteView,
  args: { kind: "climbing-logbook" },
} satisfies Meta<typeof InfoRouteView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ClimbingLogbook: Story = {};
