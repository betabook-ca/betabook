import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MapPin } from "lucide-react";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { Eyebrow } from "./eyebrow";
const meta = {
  title: "Components/Data display/Eyebrow",
  component: Eyebrow,
  args: { children: "North Woods" },
  decorators: [
    (Story) => (
      <StoryPage title="Eyebrow">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof Eyebrow>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Text: Story = {};
export const WithIcon: Story = { args: { icon: MapPin } };
