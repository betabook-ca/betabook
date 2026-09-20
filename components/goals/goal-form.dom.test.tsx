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

it("hides tag filters for first-grade, climbing-day, and new-area goals", async () => {
  const user = userEvent.setup();
  const save = vi.fn<(draft: unknown) => void>();
  const { unmount } = render(
    <GoalForm
      initialCategory="climbing"
      availableTags={["outdoor"]}
      today="2026-09-11"
      onSave={save}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Tags (optional)" }));
  expect(screen.getByText("Count climbs with all these tags:")).toBeVisible();
  await user.type(screen.getByRole("combobox", { name: "Tags" }), "outdoor{Enter}");
  await user.click(screen.getByRole("button", { name: "Reach a new grade" }));
  expect(screen.queryByRole("combobox", { name: "Tags" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Create goal" }));
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ goal: "grade", tags: [] }));

  unmount();
  render(<GoalForm initialCategory="explore" today="2026-09-11" onSave={save} />);
  expect(screen.queryByRole("combobox", { name: "Tags" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Visit new areas" }));
  expect(screen.queryByRole("combobox", { name: "Tags" })).not.toBeInTheDocument();
});

it.each(["training", "climbing"] as const)(
  "hides the entire tag section for a new %s goal without existing tags",
  (category) => {
    render(<GoalForm initialCategory={category} today="2026-09-11" />);
    expect(screen.queryByRole("button", { name: /Tags \(optional\)/ })).not.toBeInTheDocument();
  },
);

it("keeps an existing tagged training goal's section available for editing", () => {
  render(
    <GoalForm
      today="2026-09-11"
      initialDraft={{
        category: "training",
        goal: "training",
        discipline: "boulder",
        grade: "any",
        amount: "3",
        period: "month",
        endDate: "2026-09-30",
        repeat: "none",
        tags: ["hangboard"],
      }}
    />,
  );
  expect(screen.getByRole("button", { name: "Tags (1 active)" })).toBeVisible();
});

it("keeps a saved tag filter on an older goal whose editor no longer offers tags", async () => {
  const save = vi.fn<(draft: unknown) => void>();
  render(
    <GoalForm
      today="2026-09-11"
      onSave={save}
      initialDraft={{
        category: "explore",
        goal: "days",
        discipline: "boulder",
        grade: "any",
        amount: "3",
        period: "month",
        endDate: "2026-09-30",
        repeat: "none",
        tags: ["outdoor"],
      }}
    />,
  );
  expect(screen.queryByRole("combobox", { name: "Tags" })).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole("button", { name: "Save changes" }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ goal: "days", tags: ["outdoor"] }));
});
it("keeps entered data and allows retry when saving fails", async () => {
  const user = userEvent.setup();
  const save = vi
    .fn<(draft: unknown) => Promise<void>>()
    .mockRejectedValueOnce(new Error("Try again"))
    .mockResolvedValue(undefined);
  render(
    <GoalForm
      initialCategory="training"
      availableTags={["hangboard"]}
      today="2026-09-11"
      onSave={save}
    />,
  );
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
  expect(screen.getByText("until")).toBeVisible();
  expect(screen.getByRole("button", { name: /No end date/ })).toBeVisible();
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

it("submits hashtag filters and keeps them after a failed save", async () => {
  const user = userEvent.setup();
  const save = vi
    .fn<(draft: unknown) => Promise<void>>()
    .mockRejectedValueOnce(new Error("Try again"))
    .mockResolvedValue(undefined);
  render(
    <GoalForm
      initialCategory="training"
      availableTags={["hangboard"]}
      today="2026-09-11"
      onSave={save}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Tags (optional)" }));
  await user.type(screen.getByRole("combobox", { name: "Tags" }), "hangboard{Enter}");
  await user.click(screen.getByRole("button", { name: "Create goal" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Try again");
  expect(screen.getByRole("button", { name: "Remove tag hangboard" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Create goal" }));
  await waitFor(() =>
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ tags: ["hangboard"] })),
  );
});

it("starts recurring training with no end date and allows an explicit date", async () => {
  const save = vi.fn<(draft: unknown) => Promise<void>>().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(
    <GoalForm initialCategory="training" initialRepeat="month" today="2026-09-11" onSave={save} />,
  );
  expect(screen.getByText("until")).toBeVisible();
  expect(screen.getByRole("button", { name: /No end date/ })).toBeVisible();
  expect(screen.queryByRole("spinbutton", { name: "day, End date" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Create goal" }));
  expect(save).toHaveBeenLastCalledWith(
    expect.objectContaining({ repeat: "month", recurringEndDate: null }),
  );
  await user.click(screen.getByRole("button", { name: /Recurrence end/ }));
  await user.click(screen.getByRole("option", { name: "Custom date" }));
  expect(screen.getByRole("spinbutton", { name: "day, End date" })).toHaveTextContent("dd");
  await user.click(screen.getByRole("button", { name: "Create goal" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Choose an end date.");
  expect(save).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: /Recurrence end/ }));
  await user.click(screen.getByRole("option", { name: "No end date" }));
  await user.click(screen.getByRole("checkbox", { name: "Make this a recurring goal" }));
  expect(screen.queryByRole("spinbutton", { name: "day, End date" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Create goal" }));
  expect(save).toHaveBeenLastCalledWith(
    expect.objectContaining({ repeat: "none", recurringEndDate: null }),
  );
});

it("loads an existing recurring end date and lets the owner remove it", async () => {
  const save = vi.fn<(draft: unknown) => Promise<void>>().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(
    <GoalForm
      today="2026-09-11"
      onSave={save}
      initialDraft={{
        category: "training",
        goal: "training",
        discipline: "boulder",
        grade: "any",
        amount: "3",
        period: "week",
        repeat: "week",
        endDate: "2026-09-13",
        recurringEndDate: "2026-09-20",
      }}
    />,
  );
  expect(screen.getByRole("spinbutton", { name: "day, End date" })).toHaveTextContent("20");
  await user.click(screen.getByRole("button", { name: /Recurrence end/ }));
  await user.click(screen.getByRole("option", { name: "No end date" }));
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ recurringEndDate: null }));
});

it("keeps tags optional and requires a hashtag when the filter is added", async () => {
  const save = vi.fn<(draft: unknown) => void>();
  const user = userEvent.setup();
  render(
    <GoalForm
      initialCategory="training"
      availableTags={["hangboard"]}
      today="2026-09-11"
      onSave={save}
    />,
  );
  expect(screen.queryByText(/Only entries with every selected hashtag/)).not.toBeInTheDocument();
  expect(screen.queryByText("Count sessions with all these tags:")).not.toBeInTheDocument();
  const disclosure = screen.getByRole("button", { name: "Tags (optional)" });
  expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await user.click(disclosure);
  expect(disclosure).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("Count sessions with all these tags:")).toBeVisible();
  expect(screen.queryByText("Tags", { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText("Enter, Space, or comma to add.")).not.toBeInTheDocument();
  expect(screen.queryByText("#technical, #moonboard...")).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Tags" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Create goal" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Add a hashtag or remove the tag filter.",
  );
  expect(save).not.toHaveBeenCalled();
  await user.click(disclosure);
  expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await user.click(screen.getByRole("button", { name: "Create goal" }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ tags: [] }));
});

it("keeps selected training tags active when their section is collapsed", async () => {
  const user = userEvent.setup();
  const save = vi.fn<(draft: unknown) => void>();
  render(
    <GoalForm
      initialCategory="training"
      availableTags={["hangboard"]}
      today="2026-09-11"
      onSave={save}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Tags (optional)" }));
  await user.type(screen.getByRole("combobox", { name: "Tags" }), "hangboard{Enter}");
  const disclosure = screen.getByRole("button", { name: "Tags (1 active)" });
  await user.click(disclosure);
  expect(disclosure).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("combobox", { name: "Tags" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Create goal" }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ tags: ["hangboard"] }));
});

it("suggests the owner's existing tags in a new training goal", async () => {
  const user = userEvent.setup();
  const save = vi.fn<(draft: unknown) => void>();
  render(
    <GoalForm
      initialCategory="training"
      availableTags={["hangboard", "strength"]}
      today="2026-09-11"
      onSave={save}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Tags (optional)" }));
  const tagInput = screen.getByRole("combobox", { name: "Tags" });
  await user.click(tagInput);
  await user.click(await screen.findByRole("option", { name: "#hangboard" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Tags (1 active)" })).toHaveFocus(),
  );
  expect(tagInput).not.toHaveFocus();
  expect(screen.queryByRole("listbox", { name: /Suggestions/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Remove tag hangboard" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Create goal" }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ tags: ["hangboard"] }));
});

it("rejects a recurring end date before the goal's current date", async () => {
  const save = vi.fn<(draft: unknown) => Promise<void>>().mockResolvedValue(undefined);
  render(
    <GoalForm
      today="2026-09-11"
      onSave={save}
      initialValues={{
        category: "training",
        goal: "training",
        discipline: "boulder",
        grade: "any",
        amount: "3",
        period: "week",
        repeat: "week",
        endDate: "2026-09-13",
        recurringEndDate: "2026-09-10",
      }}
    />,
  );
  await userEvent.setup().click(screen.getByRole("button", { name: "Create goal" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("End date must be today or later.");
  expect(save).not.toHaveBeenCalled();
});
