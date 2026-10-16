import { render, screen, waitFor } from "@testing-library/react";
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

it("locks every field while the save is in flight", async () => {
  const { createClimb } = await import("@/actions");
  let finish: (result: Awaited<ReturnType<typeof createClimb>>) => void = () => {};
  vi.mocked(createClimb).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const onDone = vi.fn<(climbId: number, climbName: string) => void>();
  const user = userEvent.setup();
  render(<ClimbForm areaId={1} onDone={onDone} />);
  await user.type(screen.getByRole("textbox", { name: "Name" }), "Cedar Arete");
  await user.click(screen.getByRole("button", { name: "Add climb" }));
  expect(screen.getByRole("textbox", { name: "Name" })).toBeDisabled();
  expect(screen.getByRole("radio", { name: "Sport" })).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "Description" })).toBeDisabled();
  expect(onDone).not.toHaveBeenCalled();
  finish({ ok: true, value: 5 });
  await waitFor(() => expect(onDone).toHaveBeenCalledWith(5, "Cedar Arete"));
  expect(screen.getByRole("textbox", { name: "Name" })).toBeEnabled();
});

it("offers French route grades and submits the larger ordinal for a shared label", async () => {
  const { createClimb } = await import("@/actions");
  const { GradePreferencesProvider } = await import("@/components/ui/grade-preferences");
  vi.mocked(createClimb).mockResolvedValue({ ok: true, value: 9 });
  const user = userEvent.setup();
  render(
    <GradePreferencesProvider value={{ boulder: "hueco", rope: "french" }}>
      <ClimbForm areaId={1} />
    </GradePreferencesProvider>,
  );
  // Boulders stay in Hueco while only routes are switched.
  expect(screen.getByRole("button", { name: /Grade$/ })).toHaveTextContent("VB");
  await user.click(screen.getByRole("radio", { name: "Sport" }));
  expect(screen.getByRole("button", { name: /Grade$/ })).toHaveTextContent("1");
  await user.click(screen.getByRole("button", { name: /Grade$/ }));
  const labels = screen.getAllByRole("option").map((option) => option.textContent);
  expect(labels.filter((label) => label === "2")).toHaveLength(1);
  expect(labels.filter((label) => label === "3")).toHaveLength(1);
  await user.click(screen.getByRole("option", { name: "3" }));
  expect(screen.getByRole("button", { name: /Grade$/ })).toHaveTextContent("3");
  await user.type(screen.getByRole("textbox", { name: "Name" }), "Petit Dièdre");
  await user.click(screen.getByRole("button", { name: "Add climb" }));
  await waitFor(() => expect(createClimb).toHaveBeenCalled());
  const [, formData] = vi.mocked(createClimb).mock.calls[0];
  expect(formData.get("type")).toBe("sport");
  expect(formData.get("grade")).toBe("4");
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
