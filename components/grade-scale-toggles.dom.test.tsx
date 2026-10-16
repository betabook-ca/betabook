import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { setGradePreferences } from "@/actions";

import { GradeScaleToggles } from "./grade-scale-toggles";

vi.mock("@/actions", () => ({
  setGradePreferences: vi.fn<(scales: { boulder: string; rope: string }) => Promise<unknown>>(),
}));

const save = vi.mocked(setGradePreferences);

afterEach(() => {
  save.mockReset();
});

it("shows each switch's state and example from the saved preferences", () => {
  render(<GradeScaleToggles initial={{ boulder: "font", rope: "yds" }} />);
  const boulder = screen.getByRole("switch", { name: "Fontainebleau" });
  const rope = screen.getByRole("switch", { name: "French" });
  expect(boulder).toBeChecked();
  expect(boulder).toHaveAccessibleDescription("V4 shows as 6B.");
  expect(rope).not.toBeChecked();
  expect(rope).toHaveAccessibleDescription("YDS, as the catalog grades them.");
});

it("saves both systems together when one switch flips, keeping the other as it was", async () => {
  const user = userEvent.setup();
  save.mockResolvedValue({ ok: true, value: undefined });
  render(<GradeScaleToggles initial={{ boulder: "hueco", rope: "yds" }} />);

  await user.click(screen.getByRole("switch", { name: "French" }));

  expect(save).toHaveBeenCalledWith({ boulder: "hueco", rope: "french" });
  const rope = screen.getByRole("switch", { name: "French" });
  await waitFor(() => expect(rope).toBeEnabled());
  expect(rope).toBeChecked();
  expect(rope).toHaveAccessibleDescription("5.11d shows as 7a.");

  await user.click(screen.getByRole("switch", { name: "Fontainebleau" }));
  expect(save).toHaveBeenLastCalledWith({ boulder: "font", rope: "french" });
});

it("flips back and shows the action's message when the save is refused", async () => {
  const user = userEvent.setup();
  save.mockResolvedValue({ ok: false, error: "Invalid grading system" });
  render(<GradeScaleToggles initial={{ boulder: "hueco", rope: "yds" }} />);

  await user.click(screen.getByRole("switch", { name: "Fontainebleau" }));

  const boulder = screen.getByRole("switch", { name: "Fontainebleau" });
  await waitFor(() => expect(boulder).not.toBeChecked());
  expect(screen.getByText("Invalid grading system")).toBeInTheDocument();
  expect(boulder).toHaveAccessibleDescription("Hueco (V-scale), as the catalog grades them.");
});

it("flips back with a generic message when the request itself fails", async () => {
  const user = userEvent.setup();
  save.mockRejectedValue(new Error("offline"));
  render(<GradeScaleToggles initial={{ boulder: "hueco", rope: "french" }} />);

  await user.click(screen.getByRole("switch", { name: "French" }));

  const rope = screen.getByRole("switch", { name: "French" });
  await waitFor(() => expect(rope).toBeChecked());
  expect(screen.getByText("Couldn't save your grading systems. Try again.")).toBeInTheDocument();
});

it("disables both switches while a save is pending", async () => {
  const user = userEvent.setup();
  let settle: (value: { ok: true; value: undefined }) => void = () => {};
  save.mockReturnValue(new Promise((resolve) => (settle = resolve)));
  render(<GradeScaleToggles initial={{ boulder: "hueco", rope: "yds" }} />);

  await user.click(screen.getByRole("switch", { name: "French" }));

  await waitFor(() => expect(screen.getByRole("switch", { name: "French" })).toBeDisabled());
  expect(screen.getByRole("switch", { name: "Fontainebleau" })).toBeDisabled();
  settle({ ok: true, value: undefined });
  await waitFor(() => expect(screen.getByRole("switch", { name: "French" })).toBeEnabled());
  expect(save).toHaveBeenCalledTimes(1);
});
