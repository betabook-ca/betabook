import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it } from "vitest";

import { GoalSection } from "./goal-section";

function Example() {
  const [expanded, setExpanded] = useState(true);
  return (
    <GoalSection
      title="Your goals"
      expanded={expanded}
      onExpandedChange={setExpanded}
      hasGoals
      activeCount={1}
      action={<button type="button">Set goal</button>}
    >
      <p>Send 3 climbs</p>
    </GoalSection>
  );
}

it("keeps Set goal inside the collapsible content", async () => {
  const user = userEvent.setup();
  render(<Example />);
  expect(screen.getByRole("button", { name: "Set goal" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Your goals" }));
  expect(screen.queryByRole("button", { name: "Set goal" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Your goals/ }));
  expect(screen.getByRole("button", { name: "Set goal" })).toBeVisible();
});
