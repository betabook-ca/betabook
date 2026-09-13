import { Button } from "@heroui/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { InlineAlert } from "./inline-alert";

it.each(["warning", "success", "accent"] as const)("announces %s feedback politely", (status) => {
  render(<InlineAlert status={status}>Saved feedback</InlineAlert>);
  expect(screen.getByRole("status")).toHaveTextContent("Saved feedback");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("announces an error and exposes its recovery action", async () => {
  const onRetry = vi.fn<() => void>();
  render(
    <InlineAlert
      id="save-error"
      title="Could not save"
      action={<Button onPress={onRetry}>Try again</Button>}
    >
      Your notes are still here.
    </InlineAlert>,
  );
  const alert = screen.getByRole("alert");
  expect(alert).toHaveAttribute("id", "save-error");
  expect(alert).toHaveTextContent("Could not save");
  expect(alert).toHaveTextContent("Your notes are still here.");
  await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
  expect(onRetry).toHaveBeenCalledOnce();
});
