import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import AccountLoading from "@/app/account/loading";
import FeedLoading from "@/app/feed/loading";
import { cardClass, FORM_CARD_CLASS, SURFACE_CARD_CLASS } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PAGE_MAX_WIDTH_CLASS } from "@/components/ui/layout";
import { SidebarLayout } from "@/components/ui/page-shell";
import { StoryPage } from "@/stories/fixtures/story-layout";

const meta = { title: "Patterns/Layout and feedback", component: StoryPage } satisfies Meta<
  typeof StoryPage
>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;
export const Panels: Story = {
  render: () => (
    <StoryPage title="Panel compositions">
      <div className={FORM_CARD_CLASS}>Centered form card</div>
      <div className={SURFACE_CARD_CLASS}>Full-width form surface</div>
      <div className={PAGE_MAX_WIDTH_CLASS}>
        <SidebarLayout
          sidebar={<div className={cardClass("sm")}>Sidebar content comes first on mobile.</div>}
        >
          <div className={cardClass("fluid")}>Primary content</div>
        </SidebarLayout>
      </div>
    </StoryPage>
  ),
};
export const FeedPlaceholder: Story = {
  render: () => (
    <StoryPage title="Loading the feed">
      <FeedLoading />
    </StoryPage>
  ),
};

export const AccountPlaceholder: Story = {
  render: () => (
    <StoryPage title="Loading account settings">
      <AccountLoading />
    </StoryPage>
  ),
};

export const SurfaceTreatments: Story = {
  render: () => (
    <StoryPage
      title="Surface treatments"
      description="Use quiet panels for grouping, bordered panels for bounded content, insets within panels, and elevation only for floating content."
    >
      <section aria-label="Quiet panel" className={cardClass("fluid")}>
        <p>Quiet · 16px on mobile, 24px on desktop</p>
        <div aria-label="Nested content" className={`mt-4 ${cardClass("sm", "inset")}`}>
          Inset · 16px, opaque fill, no border or shadow
        </div>
      </section>
      <section aria-label="Bordered panel" className={cardClass("sm", "bordered")}>
        Bordered · 16px, one boundary, no shadow
      </section>
      <section aria-label="Floating panel" className={cardClass("sm", "floating")}>
        Floating · overlay fill, one border and shadow
      </section>
      <EmptyState message="Empty and upload areas keep dashed boundaries and extra vertical breathing room." />
    </StoryPage>
  ),
};
