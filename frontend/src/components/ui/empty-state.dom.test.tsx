import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { EmptyState } from "./empty-state";

it("renders the supplied message and exposes its recovery action", async () => {
  const user = userEvent.setup();
  const recover = vi.fn<() => void>();
  render(
    <EmptyState
      message="No matching sessions."
      cta={
        <button type="button" onClick={recover}>
          Clear filters
        </button>
      }
    />,
  );
  expect(screen.getByText("No matching sessions.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(recover).toHaveBeenCalledOnce();
});
