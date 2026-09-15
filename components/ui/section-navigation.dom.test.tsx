import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import { SectionNavigation } from "./section-navigation";

function goalViews(historyCount: number) {
  return (
    <SectionNavigation
      label="Goal views"
      appearance="pills"
      tabs={[
        { id: "active", label: "Active (2/5)", current: false, onSelect: () => {} },
        { id: "history", label: `History (${historyCount})`, current: true, onSelect: () => {} },
      ]}
    />
  );
}

it("preserves the focused button when a count changes its label", async () => {
  const user = userEvent.setup();
  const { rerender } = render(goalViews(20));
  const history = screen.getByRole("button", { name: "History (20)" });
  await user.tab();
  await user.tab();
  expect(history).toHaveFocus();

  rerender(goalViews(21));

  expect(screen.getByRole("button", { name: "History (21)" })).toBe(history);
  expect(history).toHaveFocus();
});
