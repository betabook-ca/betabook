import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { cardClass } from "@/components/ui/card";
import { StoryPage } from "@/stories/fixtures/story-layout";
import { TRIP_NOTES } from "@/stories/fixtures/trips";

import { Markdown } from "./markdown";

const meta = {
  title: "Components/Data display/Markdown",
  component: Markdown,
  // Headings start at h2, right under the story title. In the app they start
  // one level deeper.
  args: { children: TRIP_NOTES, headingLevel: 2 },
  decorators: [
    (Story) => (
      <StoryPage title="Markdown">
        <div className={`max-w-xl ${cardClass("md")}`}>
          <Story />
        </div>
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof Markdown>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TripNotes: Story = {};

/** Plain text written before Markdown was supported. Paragraphs and line breaks
 * are kept. */
export const PlainText: Story = {
  args: {
    children:
      "Buttermilks and the Happies.\nWent with Sam and Priya.\n\nTwo rest days for the storm.",
  },
};

/** HTML, script URLs and remote images are rendered as text or links. Nothing is
 * fetched or executed. */
export const UntrustedInput: Story = {
  args: {
    children: [
      '<script>alert("hi")</script>',
      '<img src="https://example.com/pixel.gif" onerror="alert(1)">',
      "[A script address](javascript:alert(1))",
      "[A path on this site](/account)",
      "![A remote image](https://example.com/topo.jpg)",
    ].join("\n\n"),
  },
};

export const EverythingElse: Story = {
  args: {
    children: [
      "# Tick list",
      "- [x] Moon Slab\n- [ ] Evilution\n  - from the sit\n  - from the stand",
      "| Day | Area | Sends |\n| --- | --- | ---: |\n| 1 | Buttermilks | 3 |\n| 2 | Happies | 5 |",
      "Beta in `code`, ~~a plan we dropped~~, and a rule:",
      "---",
      "https://www.example.com/a-very-long-address-that-has-to-wrap-inside-a-narrow-card-without-pushing-it-wider",
    ].join("\n\n"),
  },
};
