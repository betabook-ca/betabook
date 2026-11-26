import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { WizardSteps, type Step } from "./wizard-steps";

it("only allows jumping to completed steps and reports their identities", async () => {
  const user = userEvent.setup();
  const onJump = vi.fn<(step: Step) => void>();
  const { rerender } = render(<WizardSteps step="match" onJump={onJump} />);
  expect(screen.getAllByRole("button").map((el) => el.textContent)).toEqual([
    "1 Upload",
    "2 Columns",
    "3 Values",
  ]);
  expect(screen.getByText("4 Climbs")).toHaveAttribute("aria-current", "step");
  expect(screen.queryByRole("button", { name: "5 Review" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "2 Columns" }));
  expect(onJump).toHaveBeenCalledExactlyOnceWith("columns");
  rerender(<WizardSteps step="review" onJump={onJump} />);
  await user.click(screen.getByRole("button", { name: "4 Climbs" }));
  expect(onJump).toHaveBeenLastCalledWith("match");
  rerender(<WizardSteps step="result" onJump={null} />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(5);
});
