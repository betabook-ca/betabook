import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { setGradePreferences } from "@/actions";

import { GradeScaleControls } from "./grade-scale-controls";

vi.mock("@/actions", () => ({
  setGradePreferences: vi.fn<(scales: { boulder: string; rope: string }) => Promise<unknown>>(),
}));

const save = vi.mocked(setGradePreferences);

afterEach(() => {
  save.mockReset();
});

const segment = (name: RegExp) => screen.getByRole("button", { name });

it("shows both systems per discipline with an example grade, the saved one pressed", () => {
  render(<GradeScaleControls initial={{ boulder: "font", rope: "yds" }} />);
  const boulder = screen.getByRole("group", { name: "Boulder grading system" });
  const rope = screen.getByRole("group", { name: "Route grading system" });
  expect(boulder).toHaveTextContent("Hueco(V4)Font(6B)");
  expect(rope).toHaveTextContent("YDS(5.11d)French(7a)");
  expect(segment(/^Font/)).toHaveAttribute("aria-pressed", "true");
  expect(segment(/^Hueco/)).toHaveAttribute("aria-pressed", "false");
  expect(segment(/^YDS/)).toHaveAttribute("aria-pressed", "true");
  expect(segment(/^French/)).toHaveAttribute("aria-pressed", "false");
});

it("saves both systems together when one changes, keeping the other as it was", async () => {
  const user = userEvent.setup();
  save.mockResolvedValue({ ok: true, value: undefined });
  render(<GradeScaleControls initial={{ boulder: "hueco", rope: "yds" }} />);

  await user.click(segment(/^French/));

  expect(save).toHaveBeenCalledWith({ boulder: "hueco", rope: "french" });
  await waitFor(() => expect(segment(/^French/)).toBeEnabled());
  expect(segment(/^French/)).toHaveAttribute("aria-pressed", "true");
  expect(segment(/^YDS/)).toHaveAttribute("aria-pressed", "false");

  await user.click(segment(/^Font/));
  expect(save).toHaveBeenLastCalledWith({ boulder: "font", rope: "french" });
});

it("ignores a press on the segment that is already chosen", async () => {
  const user = userEvent.setup();
  render(<GradeScaleControls initial={{ boulder: "hueco", rope: "yds" }} />);
  await user.click(segment(/^Hueco/));
  expect(save).not.toHaveBeenCalled();
  expect(segment(/^Hueco/)).toHaveAttribute("aria-pressed", "true");
});

it("reverts and shows the action's message when the save is refused", async () => {
  const user = userEvent.setup();
  save.mockResolvedValue({ ok: false, error: "Invalid grading system" });
  render(<GradeScaleControls initial={{ boulder: "hueco", rope: "yds" }} />);

  await user.click(segment(/^Font/));

  await waitFor(() => expect(segment(/^Hueco/)).toHaveAttribute("aria-pressed", "true"));
  expect(segment(/^Font/)).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByText("Invalid grading system")).toBeInTheDocument();
});

it("reverts with a generic message when the request itself fails", async () => {
  const user = userEvent.setup();
  save.mockRejectedValue(new Error("offline"));
  render(<GradeScaleControls initial={{ boulder: "hueco", rope: "french" }} />);

  await user.click(segment(/^YDS/));

  await waitFor(() => expect(segment(/^French/)).toHaveAttribute("aria-pressed", "true"));
  expect(screen.getByText("Couldn't save your grading systems. Try again.")).toBeInTheDocument();
});

it("disables both controls while a save is pending", async () => {
  const user = userEvent.setup();
  let settle: (value: { ok: true; value: undefined }) => void = () => {};
  save.mockReturnValue(new Promise((resolve) => (settle = resolve)));
  render(<GradeScaleControls initial={{ boulder: "hueco", rope: "yds" }} />);

  await user.click(segment(/^French/));

  await waitFor(() => expect(segment(/^French/)).toBeDisabled());
  expect(segment(/^Font/)).toBeDisabled();
  expect(segment(/^Hueco/)).toBeDisabled();
  settle({ ok: true, value: undefined });
  await waitFor(() => expect(segment(/^French/)).toBeEnabled());
  expect(save).toHaveBeenCalledTimes(1);
});
