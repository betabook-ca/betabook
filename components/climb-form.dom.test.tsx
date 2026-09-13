import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { nativeGradeArray } from "@/lib/grades";

import { ClimbForm } from "./climb-form";

vi.mock("@/actions", () => ({
  createClimb: vi.fn<typeof import("@/actions").createClimb>(),
  updateClimb: vi.fn<typeof import("@/actions").updateClimb>(),
}));

it("selects exactly one discipline and resets the grade when it changes", async () => {
  const user = userEvent.setup();
  render(<ClimbForm areaId={1} />);
  expect(screen.getByRole("radio", { name: "Boulder" })).toBeChecked();
  await user.click(screen.getByRole("radio", { name: "Sport" }));
  expect(screen.getByRole("radio", { name: "Sport" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Boulder" })).not.toBeChecked();
  expect(screen.getByRole("radio", { name: "Trad" })).not.toBeChecked();
  await user.click(screen.getByRole("button", { name: /Grade$/ }));
  await user.click(screen.getByRole("option", { name: nativeGradeArray("sport")[3] }));
  await user.click(screen.getByRole("radio", { name: "Boulder" }));
  expect(screen.getByRole("button", { name: /Grade$/ })).toHaveTextContent(
    nativeGradeArray("boulder")[0],
  );
  expect(screen.getAllByRole("radio", { checked: true })).toHaveLength(1);
});

it("announces a failed save as an alert and preserves the form for retry", async () => {
  const { createClimb } = await import("@/actions");
  vi.mocked(createClimb).mockResolvedValue({ ok: false, error: "Could not save this climb" });
  const user = userEvent.setup();
  render(<ClimbForm areaId={1} />);
  await user.type(screen.getByRole("textbox", { name: "Name" }), "Cedar Arete");
  await user.click(screen.getByRole("button", { name: "Add climb" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save this climb");
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Cedar Arete");
});
