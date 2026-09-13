import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { TermsContent } from "./terms-content";

const meta = {
  title: "Components/Auth/Terms of Service",
  component: TermsContent,
} satisfies Meta<typeof TermsContent>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
