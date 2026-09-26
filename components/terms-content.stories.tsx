import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { READING_MAX_WIDTH_CLASS } from "@/components/ui/layout";

import { TermsContent } from "./terms-content";

const meta = {
  title: "Components/Auth/Terms of Service",
  component: TermsContent,
  // The terms pages own the reading column, not the article.
  decorators: [
    (Story) => (
      <div className={`mx-auto flex w-full ${READING_MAX_WIDTH_CLASS} flex-col`}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TermsContent>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
