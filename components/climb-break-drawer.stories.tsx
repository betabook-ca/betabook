import { Button, useOverlayState } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { mocked } from "storybook/test";

import { requestClimbBreak } from "@/actions";
import { BrokenChip } from "@/components/ui/broken-chip";
import { DisciplineChip } from "@/components/ui/discipline-chip";
import { Grade } from "@/components/ui/grade";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ClimbBreakDrawer } from "./climb-break-drawer";

const meta = {
  title: "Components/Forms/Climb break report",
  component: ClimbBreakDrawer,
  beforeEach: () => {
    mocked(requestClimbBreak).mockResolvedValue({ ok: true, value: { status: "pending" } });
    return () => mocked(requestClimbBreak).mockReset();
  },
} satisfies Meta<typeof ClimbBreakDrawer>;
export default meta;

const climb = {
  id: -1,
  areaId: -1,
  name: "Cedar Arete",
  type: "boulder" as const,
  grade: 5,
  description: "A clean arete with a committing top-out.",
  brokenOn: null,
  sendCount: 37,
  ratingSum: 155,
  ratingCount: 37,
  avgRating: 4.2,
  latitude: null,
  longitude: null,
};

/** The report form, with the successor name and both description texts
 * previewed as the reporter types — that exact text is what the request
 * carries and what a moderator approves. */
export const Report: StoryObj = {
  render: function Example() {
    const state = useOverlayState();
    return (
      <StoryPage title="Report a broken climb">
        <Button onPress={state.open}>Report climb as broken</Button>
        <ClimbBreakDrawer state={state} climb={climb} />
      </StoryPage>
    );
  },
};

/** The refusal an admin sees when logged activity contradicts the date. */
export const RefusedByLaterSends: StoryObj = {
  beforeEach: () => {
    mocked(requestClimbBreak).mockResolvedValue({
      ok: false,
      error:
        "2 send(s) on this climb are dated on or after 2026-03-05 — check the date or ask the climbers to fix their logs",
    });
  },
  render: function Example() {
    const state = useOverlayState({ defaultOpen: true });
    return (
      <StoryPage title="Report a broken climb">
        <Button onPress={state.open}>Report climb as broken</Button>
        <ClimbBreakDrawer state={state} climb={climb} />
      </StoryPage>
    );
  },
};

/** How a broken climb reads once the report lands: the chip sits beside the
 * grade and discipline wherever the climb is named. */
export const BrokenChipBesideGrade: StoryObj = {
  render: () => (
    <StoryPage title="Cedar Arete">
      <div className="flex items-center gap-2">
        <Grade size="md">V4</Grade>
        <DisciplineChip type="boulder" />
        <BrokenChip brokenOn="2026-03-05" />
      </div>
      <p className="text-muted">
        A clean arete with a committing top-out.
        {"\n\n"}This climb broke on 2026-03-05. The crux flake came off. Ascents from before that
        date can still be logged. The post-break version is listed as Cedar Arete - post break
        (2026).
      </p>
    </StoryPage>
  ),
};
