import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { PageTitle } from "./typography";
import { SectionHeading } from "./typography";
const meta = {
  title: "Components/Data display/Typography",
  component: PageTitle,
  args: { children: "North Woods" },
} satisfies Meta<typeof PageTitle>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PageHeading: Story = {};
export const ClimberName: Story = {
  args: { children: "Alexandra Rivera", size: "lg" },
};
export const DialogTitle: Story = {
  args: { children: "Cedar Arete", size: "sm" },
};
export const WithSection: Story = {
  render: (args) => (
    <div className="flex flex-col gap-6">
      <PageTitle {...args} />
      <SectionHeading>Climbs</SectionHeading>
      <p>Supporting text uses the body font.</p>
    </div>
  ),
};
