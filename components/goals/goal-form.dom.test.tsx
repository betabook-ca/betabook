import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { GoalForm } from "./goal-form";

it("keeps the volume target when switching to a one-climb grade goal", async () => {
  const user = userEvent.setup();
  const save = vi.fn<(draft: unknown) => Promise<void>>().mockResolvedValue(undefined);
  render(
    <GoalForm
      initialCategory="climbing"
      nextGrades={{ boulder: 6 }}
      today="2026-09-11"
      onSave={save}
    />,
  );
  await user.clear(screen.getByRole("spinbutton"));
  await user.type(screen.getByRole("spinbutton"), "7");
  await user.click(screen.getByRole("button", { name: "Reach a new grade" }));
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("checkbox", { name: "Make this a recurring goal" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Create goal" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ goal: "grade", amount: "1", grade: "6" }),
    ),
  );
  await user.click(screen.getByRole("button", { name: "Send a number of climbs" }));
  expect(screen.getByRole("spinbutton")).toHaveValue(7);
});
it("keeps entered data and allows retry when saving fails", async () => {
  const user = userEvent.setup();
  const save = vi
    .fn<(draft: unknown) => Promise<void>>()
    .mockRejectedValueOnce(new Error("Try again"))
    .mockResolvedValue(undefined);
  render(<GoalForm initialCategory="training" today="2026-09-11" onSave={save} />);
  await user.click(screen.getByRole("button", { name: /Timeframe/ }));
  await user.click(screen.getByRole("option", { name: /^this week$/ }));
  await user.click(screen.getByRole("checkbox", { name: "Make this a recurring goal" }));
  await user.click(screen.getByRole("button", { name: "Create goal" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Try again");
  expect(screen.getByRole("spinbutton")).toHaveValue(8);
  await user.click(screen.getByRole("button", { name: "Create goal" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ repeat: "week", amount: "8" }));
});

it("submits both seasonal dates, including a start before today", async () => {
  const user = userEvent.setup();
  const save = vi.fn<(draft: unknown) => Promise<void>>().mockResolvedValue(undefined);
  render(
    <GoalForm
      initialCategory="training"
      initialCustomDate
      initialStartDate="2026-06-01"
      initialEndDate="2026-11-30"
      today="2026-09-11"
      onSave={save}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Create goal" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: "2026-06-01",
        endDate: "2026-11-30",
        period: "custom",
      }),
    ),
  );
});

it("submits the minimum-grade rule and resets it for a grade milestone", async () => {
  const save = vi.fn<(draft: unknown) => Promise<void>>().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(
    <GoalForm
      initialDraft={{
        category: "climbing",
        goal: "volume",
        discipline: "boulder",
        grade: "5",
        gradeMatch: "exact",
        amount: "8",
        period: "year",
        endDate: "2026-12-31",
        repeat: "none",
      }}
      today="2026-09-11"
      nextGrades={{ boulder: 6 }}
      onSave={save}
    />,
  );
  await user.click(screen.getByRole("checkbox", { name: "or harder" }));
  expect(screen.queryByText("Send 8 climbs at V4 or harder")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ gradeMatch: "at-least" })),
  );
  await user.click(screen.getByRole("button", { name: "Reach a new grade" }));
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ gradeMatch: "exact", goal: "grade" }),
    ),
  );
});

it("returns new goals to category selection instead of closing the modal", async () => {
  const cancel = vi.fn<() => void>();
  render(<GoalForm initialCategory="training" today="2026-09-11" onCancel={cancel} />);
  await userEvent.setup().click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("heading", { name: "What do you want to work on?" })).toBeVisible();
  expect(cancel).not.toHaveBeenCalled();
});

it.each([
  ["this week", "every week", "week"],
  ["this month", "every month", "month"],
  ["this year", "every year", "year"],
])("maps %s to %s and restores the deadline", async (deadline, cadence, repeat) => {
  const user = userEvent.setup();
  const save = vi.fn<(draft: unknown) => void>();
  render(<GoalForm initialCategory="climbing" onSave={save} today="2026-09-11" />);
  await user.click(screen.getByRole("button", { name: /Timeframe/ }));
  await user.click(screen.getByRole("option", { name: deadline }));
  await user.click(screen.getByRole("checkbox", { name: "Make this a recurring goal" }));
  expect(screen.getByRole("button", { name: /Timeframe/ })).toHaveTextContent(cadence);
  await user.click(screen.getByRole("button", { name: "Create goal" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ repeat })));
  await user.click(screen.getByRole("button", { name: "Reach a new grade" }));
  expect(
    screen.queryByRole("checkbox", { name: "Make this a recurring goal" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Timeframe/ })).toHaveTextContent(deadline);
  await user.click(screen.getByRole("button", { name: "Create goal" }));
  await waitFor(() =>
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ repeat: "none", amount: "1" })),
  );
});

it("excludes yearly training and preserves custom dates across recurrence toggles", async () => {
  const user = userEvent.setup();
  const save = vi.fn<(draft: unknown) => void>();
  render(
    <GoalForm
      initialCategory="training"
      initialCustomDate
      initialStartDate="2026-05-01"
      initialEndDate="2026-11-30"
      today="2026-09-11"
      onSave={save}
    />,
  );
  await user.click(screen.getByRole("button", { name: /Timeframe/ }));
  expect(screen.queryByRole("option", { name: "this year" })).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("checkbox", { name: "Make this a recurring goal" }));
  await user.click(screen.getByRole("button", { name: /Timeframe/ }));
  expect(screen.queryByRole("option", { name: "every year" })).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("checkbox", { name: "Make this a recurring goal" }));
  await user.click(screen.getByRole("button", { name: "Create goal" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        period: "custom",
        startDate: "2026-05-01",
        endDate: "2026-11-30",
        repeat: "none",
      }),
    ),
  );
});

it("preserves Any grade when changing climbing discipline", async () => {
  const user = userEvent.setup();
  const save = vi.fn<(draft: unknown) => void>();
  render(
    <GoalForm
      initialCategory="climbing"
      today="2026-09-11"
      nextGrades={{ sport: 6 }}
      onSave={save}
    />,
  );
  await user.click(screen.getByRole("radio", { name: "Sport" }));
  await user.click(screen.getByRole("button", { name: "Create goal" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ grade: "any", discipline: "sport" }),
    ),
  );
});
