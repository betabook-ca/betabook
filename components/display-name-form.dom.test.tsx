import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { updateDisplayName } from "@/actions";
import { GENERIC_ERROR_MESSAGE, type ActionResult } from "@/lib/action-result";

import { DisplayNameForm } from "./display-name-form";

vi.mock("@/actions", () => ({ updateDisplayName: vi.fn<() => Promise<ActionResult>>() }));

const update = vi.mocked(updateDisplayName);

beforeEach(() => {
  update.mockReset();
});

it("keeps the edited name and explains a save that threw", async () => {
  update.mockRejectedValue(new Error("offline"));
  const user = userEvent.setup();
  render(<DisplayNameForm initialName="Alex" />);

  const input = screen.getByRole("textbox", { name: "Display name" });
  await user.clear(input);
  await user.type(input, "Alex Honnold");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText(GENERIC_ERROR_MESSAGE)).toBeVisible();
  expect(update).toHaveBeenCalledOnce();
  expect(input).toHaveValue("Alex Honnold");
  expect(screen.queryByText("Display name updated.")).toBeNull();
  await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
});
