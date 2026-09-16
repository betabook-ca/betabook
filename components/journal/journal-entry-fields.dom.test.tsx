import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import type { JournalEntry } from "@/db/queries";
import { GENERIC_ERROR_MESSAGE, type ActionResult } from "@/lib/action-result";

import { JournalEntryFields, type JournalEntryFieldsProps } from "./journal-entry-fields";

const climb = { id: 17, areaId: 3, name: "Cedar Arete", type: "boulder" as const, grade: 5 };
const savedEntry: JournalEntry = {
  id: 41,
  climbId: climb.id,
  kind: "session",
  sent: false,
  entryDate: "2026-09-01",
  body: "Worked the top out.",
  tags: [],
  companions: [],
  climbName: climb.name,
  climbType: climb.type,
  climbGrade: climb.grade,
  areaId: climb.areaId,
  areaName: "Cedar Block",
  isAscent: false,
  isSendComment: false,
};
const success: ActionResult = { ok: true, value: undefined };
function setup(props: Partial<JournalEntryFieldsProps> = {}) {
  const onSave = vi.fn<JournalEntryFieldsProps["onSave"]>().mockResolvedValue(success);
  const onDone = vi.fn<() => void>();
  const onPendingChange = vi.fn<(pending: boolean) => void>();
  const user = userEvent.setup();
  render(
    <JournalEntryFields
      today="2026-09-06"
      kind="session"
      climb={climb}
      companionFetcher={async () => [{ id: "sam", name: "Sam Rivera" }]}
      onSave={onSave}
      onDone={onDone}
      onPendingChange={onPendingChange}
      {...props}
    />,
  );
  return { user, onSave, onDone, onPendingChange };
}
function detailsTrigger() {
  return screen.getByRole("button", { name: "Add details" });
}
async function openDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.click(detailsTrigger());
  expect(detailsTrigger()).toHaveAttribute("aria-expanded", "true");
}
async function addFriend(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole("combobox", { name: "Find a friend to tag" }), "Sam");
  await user.click(await screen.findByRole("option", { name: "Sam Rivera" }));
  expect(screen.getByRole("button", { name: "Remove friend Sam Rivera" })).toBeInTheDocument();
}
async function fillNotes(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole("textbox", { name: "Notes" }), "Kept the high foot.");
  await user.type(screen.getByRole("combobox", { name: "Tags" }), "technique{Enter}");
}

it.each(["outdoor", "repeat", "training"])(
  "submits %s friend identity, note, date and tags",
  async (kind) => {
    const { user, onSave, onDone } = setup({
      kind: kind === "training" ? "training" : "session",
      climb: kind === "training" ? null : climb,
      hasPriorSend: kind === "repeat",
    });
    await openDetails(user);
    await addFriend(user);
    await fillNotes(user);
    if (kind !== "training")
      await user.click(
        screen.getByRole("radio", { name: kind === "repeat" ? "Repeat" : "Redpoint" }),
      );
    else expect(screen.queryByRole("radio", { name: "Session" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save entry" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledOnce();
    const [form, undated] = onSave.mock.calls[0];
    expect(undated).toBe(false);
    expect(Array.from(form.entries())).toEqual([
      ["kind", kind === "training" ? "training" : "session"],
      ["entryDate", "2026-09-06"],
      ["body", "Kept the high foot."],
      ...(kind === "training"
        ? []
        : [
            ["climbId", "17"],
            ["sent", "true"],
          ]),
      ["tag", "technique"],
      ["companionsChanged", "true"],
      ["companion", "sam"],
      ...(kind === "outdoor"
        ? [
            ["ascentStyle", "redpoint"],
            ["rating", ""],
            ["suggestedGrade", "5"],
            ["gradeFeel", "solid"],
          ]
        : []),
    ]);
  },
);

it("blocks an undated send with friends and preserves their identities on recovery", async () => {
  const { user, onSave } = setup();
  await openDetails(user);
  await addFriend(user);
  await user.click(screen.getByRole("radio", { name: "Redpoint" }));
  await user.click(screen.getByRole("checkbox", { name: "I don't know" }));
  await user.click(screen.getByRole("button", { name: "Save send" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Add a date to keep tagged friends.");
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Remove friend Sam Rivera" })).toBeInTheDocument();
  await user.click(screen.getByRole("spinbutton", { name: /month, Date/ }));
  await user.keyboard("09062026");
  await user.click(screen.getByRole("button", { name: "Save entry" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(onSave).toHaveBeenCalledOnce();
  expect(onSave.mock.calls[0][1]).toBe(false);
  expect(onSave.mock.calls[0][0].get("entryDate")).toBe("2026-09-06");
  expect(onSave.mock.calls[0][0].getAll("companion")).toEqual(["sam"]);
});

it("preserves undated commentary and omits journal-only tags", async () => {
  const { user, onSave } = setup();
  await openDetails(user);
  await fillNotes(user);
  await user.click(screen.getByRole("radio", { name: "Redpoint" }));
  await user.click(screen.getByRole("checkbox", { name: "I don't know" }));
  expect(screen.getByRole("checkbox", { name: "I don't know" })).toBeChecked();
  expect(screen.queryByRole("combobox", { name: "Tags" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save send" }));
  expect(onSave).toHaveBeenCalledOnce();
  const [form, undated] = onSave.mock.calls[0];
  expect(undated).toBe(true);
  expect(form.get("dateSent")).toBe("");
  expect(form.get("comment")).toBe("Kept the high foot.");
  expect(form.get("climbId")).toBe("17");
  expect(form.getAll("tag")).toEqual([]);
  expect(form.getAll("companion")).toEqual([]);
});

it.each(["rejection", "exception"])(
  "retains entered data after a save %s and retries the same payload",
  async (failure) => {
    const { user, onSave, onDone, onPendingChange } = setup();
    if (failure === "exception") onSave.mockRejectedValueOnce(new Error("Private service details"));
    else onSave.mockResolvedValueOnce({ ok: false, error: "Couldn't save the entry. Try again." });
    await openDetails(user);
    await addFriend(user);
    await fillNotes(user);
    const save = screen.getByRole("button", { name: "Save entry" });
    await user.click(save);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      failure === "exception" ? GENERIC_ERROR_MESSAGE : "Couldn't save the entry. Try again.",
    );
    expect(onDone).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledOnce();
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue("Kept the high foot.");
    expect(screen.getByRole("button", { name: "Remove tag technique" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove friend Sam Rivera" })).toBeInTheDocument();
    await user.click(save);
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(Array.from(onSave.mock.calls[1][0].entries())).toEqual(
      Array.from(onSave.mock.calls[0][0].entries()),
    );
    expect(onPendingChange.mock.calls).toEqual([[true], [false], [true], [false]]);
  },
);

it("locks the submitted values and prevents another submission until the pending save completes", async () => {
  const { user, onSave, onDone, onPendingChange } = setup();
  let finish!: (result: ActionResult) => void;
  onSave.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await openDetails(user);
  await addFriend(user);
  await fillNotes(user);
  await user.click(screen.getByRole("radio", { name: "Flash" }));
  const save = screen.getByRole("button", { name: "Save entry" });
  await user.click(save);
  expect(save).toBeDisabled();
  const notes = screen.getByRole("textbox", { name: "Notes" });
  expect(notes).toBeDisabled();
  await user.type(notes, " This must not be lost.");
  expect(notes).toHaveValue("Kept the high foot.");
  const day = screen.getByRole("spinbutton", { name: /day, Date/ });
  await user.click(day);
  await user.keyboard("{ArrowDown}");
  expect(day).toHaveTextContent("06");
  await user.click(screen.getByRole("radio", { name: "Session" }));
  expect(screen.getByRole("radio", { name: "Flash" })).toHaveAttribute("aria-checked", "true");
  await user.click(screen.getByRole("button", { name: "Remove tag technique" }));
  expect(screen.getByRole("button", { name: "Remove tag technique" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Remove friend Sam Rivera" })).toBeDisabled();
  await user.click(save);
  // A submit event can also arrive without a button click (for example,
  // requestSubmit). Exercise the form's pending guard as well as its button.
  fireEvent.submit(save.closest("form")!);
  expect(onSave).toHaveBeenCalledOnce();
  expect(onDone).not.toHaveBeenCalled();
  expect(onPendingChange.mock.calls).toEqual([[true]]);
  await act(async () => finish(success));
  expect(save).toBeEnabled();
  expect(onDone).toHaveBeenCalledOnce();
  expect(onPendingChange.mock.calls).toEqual([[true], [false]]);
});

it("keeps optional fields behind a collapsed Add details section", async () => {
  const { user } = setup();
  expect(detailsTrigger()).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("combobox", { name: "Find a friend to tag" })).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "Tags" })).not.toBeInTheDocument();
  const picker = screen.getByRole("radiogroup", { name: "Session or send" });
  expect(picker).toBeVisible();
  expect(screen.getByRole("radio", { name: "Session" })).toHaveAttribute("aria-checked", "true");
  expect(screen.queryByRole("button", { name: /Suggested grade/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("radio", { name: "Flash" }));
  // The ascent opinion is part of the visible send record, not Add details.
  expect(screen.getByRole("button", { name: /Suggested grade/ })).toBeVisible();
  expect(screen.getByRole("radiogroup", { name: "Rating" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Solid" })).toBeVisible();
  expect(detailsTrigger()).toHaveAttribute("aria-expanded", "false");
  await openDetails(user);
  expect(screen.getByRole("combobox", { name: "Find a friend to tag" })).toBeVisible();
  expect(screen.getByRole("combobox", { name: "Tags" })).toBeVisible();
});

it("submits the default ascent opinion without opening Add details", async () => {
  const { user, onSave, onDone } = setup();
  expect(detailsTrigger()).toHaveAttribute("aria-expanded", "false");
  await user.click(screen.getByRole("radio", { name: "Redpoint" }));
  await user.click(screen.getByRole("button", { name: "Save entry" }));
  await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  const [form, undated] = onSave.mock.calls[0];
  expect(undated).toBe(false);
  expect(form.get("ascentStyle")).toBe("redpoint");
  expect(form.get("rating")).toBe("");
  expect(form.get("suggestedGrade")).toBe("5");
  expect(form.get("gradeFeel")).toBe("solid");
});

it("offers Redpoint and Flash for a boulder, and adds Onsight for a rope climb", () => {
  setup();
  expect(screen.getByRole("radiogroup", { name: "Session or send" })).toBeVisible();
  expect(screen.getByRole("radio", { name: "Redpoint" })).toBeVisible();
  expect(screen.getByRole("radio", { name: "Flash" })).toBeVisible();
  expect(screen.queryByRole("radio", { name: "Onsight" })).not.toBeInTheDocument();
  cleanup();
  setup({ climb: { ...climb, type: "sport" } });
  expect(screen.getByRole("radio", { name: "Onsight" })).toBeVisible();
});

it("offers Session or Repeat, without styles or opinion fields, for a sent climb", async () => {
  const { user, onSave, onDone } = setup({ hasPriorSend: true });
  expect(screen.getByRole("radiogroup", { name: "Session or repeat" })).toBeVisible();
  for (const style of ["Redpoint", "Flash", "Onsight"]) {
    expect(screen.queryByRole("radio", { name: style })).not.toBeInTheDocument();
  }
  await user.click(screen.getByRole("radio", { name: "Repeat" }));
  expect(screen.queryByRole("button", { name: /Suggested grade/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("radiogroup", { name: "Rating" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save entry" }));
  await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  const [form, undated] = onSave.mock.calls[0];
  expect(undated).toBe(false);
  expect(form.get("sent")).toBe("true");
  expect(form.get("ascentStyle")).toBeNull();
});

it("hides I don't know for a repeat, which always needs a date", async () => {
  const { user } = setup({ hasPriorSend: true });
  await user.click(screen.getByRole("radio", { name: "Repeat" }));
  expect(screen.queryByText(/need a date/)).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "I don't know" })).not.toBeInTheDocument();
});

it("requires a date once a cleared send is unchecked back to a session", async () => {
  const { user, onSave } = setup();
  expect(screen.queryByRole("checkbox", { name: "I don't know" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("radio", { name: "Redpoint" }));
  await user.click(screen.getByRole("checkbox", { name: "I don't know" }));
  await user.click(screen.getByRole("radio", { name: "Session" }));
  await user.click(screen.getByRole("button", { name: "Save entry" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Add a date to save this entry.");
  expect(onSave).not.toHaveBeenCalled();
});

it("reopens Add details when a hidden friend blocks an undated send", async () => {
  const { user, onSave } = setup();
  await openDetails(user);
  await addFriend(user);
  await user.click(screen.getByRole("radio", { name: "Redpoint" }));
  await user.click(screen.getByRole("checkbox", { name: "I don't know" }));
  await user.click(detailsTrigger());
  expect(detailsTrigger()).toHaveAttribute("aria-expanded", "false");
  await user.click(screen.getByRole("button", { name: "Save send" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Add a date to keep tagged friends.");
  expect(onSave).not.toHaveBeenCalled();
  expect(detailsTrigger()).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: "Remove friend Sam Rivera" })).toBeVisible();
});

it("opens Add details when editing an entry that already has companions or tags", () => {
  setup({
    existingEntry: {
      ...savedEntry,
      tags: ["technique"],
      companions: [{ id: "sam", name: "Sam Rivera", isSelf: false }],
    },
  });
  expect(detailsTrigger()).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: "Remove tag technique" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Remove friend Sam Rivera" })).toBeVisible();
});

it("adds no summary to training, which the chosen-entry strip already names", () => {
  setup({ kind: "training", climb: null });
  expect(screen.queryByText(/^Logging/)).not.toBeInTheDocument();
});

it("keeps Add details collapsed when editing an entry without optional values", () => {
  setup({ existingEntry: savedEntry });
  expect(detailsTrigger()).toHaveAttribute("aria-expanded", "false");
});
