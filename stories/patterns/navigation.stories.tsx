import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { AreaBreadcrumb } from "@/components/area-breadcrumb";
import { AreaBreadcrumbs } from "@/components/breadcrumbs";
import { FriendRequestBadge, FriendRequestDot } from "@/components/friend-request-badge";
import { ProfileSectionNav } from "@/components/profile-tabs";
import { SearchCategories } from "@/components/search/search-categories";
import { SubareaRail } from "@/components/subarea-rail";
import type { SearchCategory } from "@/lib/search";
import { Example, StoryPage } from "@/stories/fixtures/story-layout";

const meta = { title: "Patterns/Navigation", component: StoryPage } satisfies Meta<
  typeof StoryPage
>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;
function NavigationExample() {
  const [mode, setMode] = useState<SearchCategory>("climb");
  const [tab, setTab] = useState("Journal");
  return (
    <StoryPage title="Search and profile navigation">
      <SearchCategories value={mode} onChange={setMode} />
      <ProfileSectionNav
        tabs={["Journal", "Sends", "Projects", "Analytics"].map((label) => ({
          label,
          current: label === tab,
          onSelect: () => setTab(label),
        }))}
      />
      <Example title="Request indicators">
        <div className="flex items-center gap-3">
          <FriendRequestDot />
          <span>Pending requests</span>
          <FriendRequestBadge count={120} />
        </div>
      </Example>
    </StoryPage>
  );
}
export const Navigation: Story = { render: () => <NavigationExample /> };
const areas = [
  { id: 1, name: "World" },
  { id: 2, name: "California" },
  { id: 3, name: "North Woods" },
];
export const AreaNavigation: Story = {
  render: () => (
    <StoryPage title="Area navigation">
      <AreaBreadcrumbs ancestors={areas} current={{ id: 4, name: "Cedar Grove" }} />
      <Example title="Compact row breadcrumb">
        <AreaBreadcrumb ancestors={areas} areaId={4} areaName="Cedar Grove" />
      </Example>
      <SubareaRail
        subareas={[
          { id: 5, name: "Upper boulders" },
          { id: 6, name: "Lower walls" },
          { id: 7, name: "A very long subarea name along the eastern ridge" },
        ]}
      />
    </StoryPage>
  ),
};
