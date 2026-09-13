import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { PROFILE_LAYOUT_CLASS } from "@/app/users/[id]/profile-layout";
import { ProfileHeading } from "@/components/profile-heading";
import { ProfileSectionNav } from "@/components/profile-tabs";
import { Grade } from "@/components/ui/grade";
import { ListRow } from "@/components/ui/list-row";
import { STORY_CLIMBER_OVERVIEW } from "@/stories/fixtures/climber-overview";
import { StoryPage } from "@/stories/fixtures/story-layout";

const meta = { title: "Patterns/Profile overview", component: StoryPage } satisfies Meta<
  typeof StoryPage
>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;

const ROWS = [
  { name: "Quiet Arete", area: "Pine Canyon", grade: "V4", date: "Sep 1, 2026" },
  { name: "Moss Ladder", area: "Pine Canyon", grade: "V3", date: "Aug 29, 2026" },
  { name: "The Long Way", area: "Cedar Grove", grade: "5.12b", date: "Aug 22, 2026" },
];

function ProfileExample() {
  const [tab, setTab] = useState("Journal");
  return (
    <div className={PROFILE_LAYOUT_CLASS}>
      <aside aria-label="Climber summary" className="xl:sticky xl:top-6 xl:row-span-2">
        <ProfileHeading name="Alexandra Rivera" overview={STORY_CLIMBER_OVERVIEW} />
      </aside>
      <ProfileSectionNav
        tabs={["Journal", "Sends", "Projects", "Analytics"].map((label) => ({
          label,
          current: label === tab,
          onSelect: () => setTab(label),
        }))}
      />
      <div className="flex flex-col divide-y divide-separator">
        {ROWS.map((row) => (
          <ListRow
            key={row.name}
            title={row.name}
            subtitle={row.area}
            trailing={
              <div className="flex flex-col items-end gap-1 text-sm">
                <Grade>{row.grade}</Grade>
                <span className="text-xs text-muted">{row.date}</span>
              </div>
            }
          />
        ))}
      </div>
    </div>
  );
}

export const Profile: Story = { render: () => <ProfileExample /> };
