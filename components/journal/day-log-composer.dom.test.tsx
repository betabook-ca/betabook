import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";

import type { LookupFetcher } from "@/hooks/use-search-lookup";
import type { ActionResult } from "@/lib/action-result";
import type { CompanionOption } from "@/lib/journal-companions";
import { readDayEntries } from "@/lib/journal-day";
import { SEND_VIDEO_INVALID_MESSAGE } from "@/lib/send-video";
import { createSearchFixtureFetcher } from "@/stories/fixtures/app-search-demo";

import { DayLogComposer } from "./day-log-composer";
import { newDayLogRow, type DaySeed } from "./day-log-entry";

vi.mock("@/actions", () => ({ createDayEntries: vi.fn<() => Promise<ActionResult>>() }));

const VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const alex = { id: "alex", name: "Alex Rivera", image: null };

type Save = (formData: FormData) => Promise<ActionResult>;

const noop = () => {};
const companionFetcher: LookupFetcher<CompanionOption> = async () => [alex];

function Example({
  save,
  onDone = noop,
  seed,
}: {
  save: Save;
  onDone?: () => void;
  seed?: DaySeed;
}) {
  const [climbFetcher] = useState(() => createSearchFixtureFetcher());
  return (
    <DayLogComposer
      seed={seed}
      today="2026-09-12"
      onBack={noop}
      onDone={onDone}
      onSave={save}
      climbFetcher={climbFetcher}
      companionFetcher={companionFetcher}
    />
  );
}

const CRACK = "Cedar Crack, North Woods / Upper Wall";
const CORNER = "Cedar Corner, North Woods / Cedar Grove";
const ARETE = "Cedar Arete, North Woods / Cedar Grove";
const short = (result: string) => result.split(",")[0];

async function openPicker(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Add climb" }));
  await user.type(screen.getByRole("searchbox", { name: "Choose a climb" }), "cedar");
}

/** Picks a climb and returns its dialog, not yet added to the day. */
async function pickClimb(user: UserEvent, result: string) {
  await openPicker(user);
  await user.click(await screen.findByRole("button", { name: `Choose ${result}` }));
  return screen.findByRole("dialog", { name: short(result) });
}

async function closeDialog(user: UserEvent, dialog: HTMLElement, button: string) {
  await user.click(within(dialog).getByRole("button", { name: button }));
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
}

/** Picks a climb and adds it as it comes, returning its line in the day. */
async function addClimb(user: UserEvent, result: string) {
  await closeDialog(user, await pickClimb(user, result), "Add to day");
  return screen.getByRole("listitem", { name: short(result) });
}

async function editClimb(user: UserEvent, name: string) {
  await user.click(screen.getByRole("button", { name: `Edit ${name}` }));
  return screen.findByRole("dialog", { name });
}

async function addTag(user: UserEvent, field: HTMLElement, tag: string) {
  await user.type(field, `${tag}{Enter}`);
}

/** Links are pasted, as a climber would; typing one a key at a time costs
 * about a second a link under CI's slower jsdom. */
async function pasteInto(user: UserEvent, field: HTMLElement, text: string) {
  await user.click(field);
  await user.paste(text);
}

function posted(save: ReturnType<typeof vi.fn<Save>>) {
  expect(save).toHaveBeenCalledTimes(1);
  return readDayEntries(save.mock.calls[0][0]);
}

it("starts from a handed-over session: its date, friends, tags and climb, then takes more climbs", async () => {
  const user = userEvent.setup();
  const save = vi.fn<Save>().mockResolvedValue({ ok: true, value: undefined });
  const arete = {
    id: 17,
    areaId: 3,
    name: "Cedar Arete",
    type: "boulder" as const,
    grade: 5,
    brokenOn: null,
  };
  const seed: DaySeed = {
    entryDate: "2026-09-08",
    companions: [alex],
    tags: ["cold"],
    row: {
      ...newDayLogRow({ ...arete, areaName: "Cedar Block" }, false, ["cold"], [alex]),
      choice: "flash",
    },
  };
  render(<Example save={save} seed={seed} />);

  expect(screen.getByRole("button", { name: "Remove friend Alex Rivera" })).toBeInTheDocument();
  const dayField = screen.getByRole("group", { name: "Day tags" });
  expect(within(dayField).getByRole("button", { name: "Remove tag cold" })).toBeInTheDocument();
  const first = screen.getByRole("listitem", { name: "Cedar Arete" });
  expect(within(first).getByText("Flash · #cold")).toBeInTheDocument();

  expect(within(first).getByText("With Alex Rivera")).toBeInTheDocument();

  const crack = await pickClimb(user, CRACK);
  expect(within(crack).getByRole("button", { name: "Remove tag cold" })).toBeInTheDocument();
  expect(
    within(crack).getByRole("button", { name: "Remove friend Alex Rivera" }),
  ).toBeInTheDocument();
  await closeDialog(user, crack, "Add to day");
  await user.click(screen.getByRole("button", { name: "Save 2 entries" }));

  const { shared, entries } = posted(save);
  expect([...shared.entries()]).toEqual([["entryDate", "2026-09-08"]]);
  expect(
    entries.map((entry) => [entry.get("climbId"), entry.getAll("tag"), entry.getAll("companion")]),
  ).toEqual([
    ["17", ["cold"], ["alex"]],
    ["102", ["cold"], ["alex"]],
  ]);
  expect(entries[0].get("ascentStyle")).toBe("flash");
});

it("pre-fills each climb with the day's friends and saves each climb with only its own", async () => {
  const user = userEvent.setup();
  const save = vi.fn<Save>().mockResolvedValue({ ok: true, value: undefined });
  const onDone = vi.fn<() => void>();
  render(<Example save={save} onDone={onDone} />);

  const friends = screen.getByRole("group", { name: "Tagged friends" });
  await user.type(within(friends).getByRole("combobox"), "Alex");
  await user.click(await screen.findByRole("option", { name: "Alex Rivera" }));
  const crackLine = await addClimb(user, CRACK);
  expect(within(crackLine).getByText("With Alex Rivera")).toBeInTheDocument();

  // A climb's own dialog starts with the day's friend and can drop them.
  const corner = await pickClimb(user, CORNER);
  await user.click(within(corner).getByRole("button", { name: "Remove friend Alex Rivera" }));
  await closeDialog(user, corner, "Add to day");
  const cornerLine = screen.getByRole("listitem", { name: "Cedar Corner" });
  expect(within(cornerLine).queryByText(/^With /)).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Save 2 entries" }));

  const { shared, entries } = posted(save);
  expect([...shared.entries()]).toEqual([["entryDate", "2026-09-12"]]);
  expect(Object.fromEntries(entries[0].entries())).toEqual({
    climbId: "102",
    body: "",
    companionsChanged: "true",
    companion: "alex",
  });
  expect(entries[1].get("companionsChanged")).toBe("true");
  expect(entries[1].getAll("companion")).toEqual([]);
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
});

it("sets each climb's style, note and videos in its own dialog and posts them", async () => {
  const user = userEvent.setup();
  const save = vi.fn<Save>().mockResolvedValue({ ok: true, value: undefined });
  render(<Example save={save} />);

  const crack = await pickClimb(user, CRACK);
  await user.click(within(crack).getByRole("radio", { name: "Redpoint" }));
  await user.type(within(crack).getByRole("textbox", { name: "Notes" }), "Finally.");
  await pasteInto(user, within(crack).getByRole("textbox", { name: /Video link/ }), VIDEO);
  await closeDialog(user, crack, "Add to day");
  const line = screen.getByRole("listitem", { name: "Cedar Crack" });
  expect(within(line).getByText("Redpoint · 1 video")).toBeInTheDocument();
  expect(within(line).getByText("Finally.")).toBeInTheDocument();

  const arete = await pickClimb(user, ARETE);
  await user.click(within(arete).getByRole("radio", { name: "Repeat" }));
  await closeDialog(user, arete, "Add to day");

  await user.click(screen.getByRole("button", { name: "Save 2 entries" }));

  const { entries } = posted(save);
  expect(Object.fromEntries(entries[0].entries())).toMatchObject({
    climbId: "102",
    sent: "true",
    body: "Finally.",
    ascentStyle: "redpoint",
    videosChanged: "true",
    video: VIDEO,
  });
  expect(Object.fromEntries(entries[1].entries())).toEqual({
    climbId: "101",
    companionsChanged: "true",
    sent: "true",
    body: "",
  });
});

it("leaves a picked climb out of the day when its dialog is closed, and keeps an edit only when saved", async () => {
  const user = userEvent.setup();
  render(<Example save={vi.fn<Save>()} />);

  await closeDialog(user, await pickClimb(user, CORNER), "Close");
  expect(screen.queryByRole("listitem", { name: "Cedar Corner" })).not.toBeInTheDocument();
  expect(screen.getByText("Climbs (0)")).toBeInTheDocument();

  await addClimb(user, CRACK);
  let crack = await editClimb(user, "Cedar Crack");
  await user.type(within(crack).getByRole("textbox", { name: "Notes" }), "Discarded.");
  await closeDialog(user, crack, "Close");
  const line = screen.getByRole("listitem", { name: "Cedar Crack" });
  expect(within(line).queryByText("Discarded.")).not.toBeInTheDocument();

  crack = await editClimb(user, "Cedar Crack");
  expect(within(crack).getByRole("textbox", { name: "Notes" })).toHaveValue("");
  await user.type(within(crack).getByRole("textbox", { name: "Notes" }), "Kept.");
  await closeDialog(user, crack, "Save climb");
  expect(within(line).getByText("Kept.")).toBeInTheDocument();
});

it("applies a change to the day's friends and tags only to climbs added after it", async () => {
  const user = userEvent.setup();
  const save = vi.fn<Save>().mockResolvedValue({ ok: true, value: undefined });
  render(<Example save={save} />);
  const dayTags = () => screen.getByRole("combobox", { name: "Tags for climbs you add" });
  const dayField = () => screen.getByRole("group", { name: "Day tags" });

  // Already in the day: a change to the day's friends and tags leaves it as it is.
  const crackLine = await addClimb(user, CRACK);
  const friends = screen.getByRole("group", { name: "Tagged friends" });
  await user.type(within(friends).getByRole("combobox"), "Alex");
  await user.click(await screen.findByRole("option", { name: "Alex Rivera" }));
  await addTag(user, dayTags(), "cold");
  expect(within(crackLine).getByText("Session")).toBeInTheDocument();
  expect(within(crackLine).queryByText(/^With /)).not.toBeInTheDocument();

  // Added after: it starts with them, and adds its own.
  const corner = await pickClimb(user, CORNER);
  expect(within(corner).getByRole("button", { name: "Remove tag cold" })).toBeInTheDocument();
  expect(
    within(corner).getByRole("button", { name: "Remove friend Alex Rivera" }),
  ).toBeInTheDocument();
  await addTag(user, within(corner).getByRole("combobox", { name: "Tags" }), "crimpy");
  await closeDialog(user, corner, "Add to day");

  // Taking them off the day afterwards leaves that climb's copy alone.
  await user.click(within(dayField()).getByRole("button", { name: "Remove tag cold" }));
  await user.click(screen.getByRole("button", { name: "Remove friend Alex Rivera" }));
  const cornerLine = screen.getByRole("listitem", { name: "Cedar Corner" });
  expect(within(cornerLine).getByText("Session · #cold · #crimpy")).toBeInTheDocument();
  expect(within(cornerLine).getByText("With Alex Rivera")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Save 2 entries" }));
  const { entries } = posted(save);
  expect(entries.map((entry) => [entry.getAll("tag"), entry.getAll("companion")])).toEqual([
    [[], []],
    [["cold", "crimpy"], ["alex"]],
  ]);
});

it("keeps a climb's dialog open over a bad video link and adds nothing", async () => {
  const user = userEvent.setup();
  render(<Example save={vi.fn<Save>()} />);

  const crack = await pickClimb(user, CRACK);
  await user.click(within(crack).getByRole("radio", { name: "Redpoint" }));
  await pasteInto(
    user,
    within(crack).getByRole("textbox", { name: /Video link/ }),
    "https://example.com/x",
  );
  await user.click(within(crack).getByRole("button", { name: "Add to day" }));

  expect(crack).toBeInTheDocument();
  expect(within(crack).getByText(SEND_VIDEO_INVALID_MESSAGE)).toBeInTheDocument();
  expect(screen.getByText("Climbs (0)")).toBeInTheDocument();
});

it("leaves a climb's rating and videos out once it's switched back to a session", async () => {
  const user = userEvent.setup();
  const save = vi.fn<Save>().mockResolvedValue({ ok: true, value: undefined });
  render(<Example save={save} />);

  const crack = await pickClimb(user, CRACK);
  await user.click(within(crack).getByRole("radio", { name: "Redpoint" }));
  await pasteInto(user, within(crack).getByRole("textbox", { name: /Video link/ }), VIDEO);
  await user.click(within(crack).getByRole("radio", { name: "Session" }));
  expect(within(crack).queryByRole("textbox", { name: /Video link/ })).not.toBeInTheDocument();
  await closeDialog(user, crack, "Add to day");

  await user.click(screen.getByRole("button", { name: "Save 1 entry" }));
  const { entries } = posted(save);
  expect(Object.fromEntries(entries[0].entries())).toEqual({
    climbId: "102",
    body: "",
    companionsChanged: "true",
  });
});

it("won't queue a climb twice, and removes one from the day", async () => {
  const user = userEvent.setup();
  render(<Example save={vi.fn<Save>()} />);

  await addClimb(user, CRACK);
  await openPicker(user);
  expect(await screen.findByRole("button", { name: `Choose ${CRACK}` })).toBeDisabled();
  await closeDialog(user, screen.getByRole("dialog", { name: "Add a climb" }), "Close");

  await user.click(screen.getByRole("button", { name: "Remove Cedar Crack" }));
  expect(screen.queryByRole("listitem", { name: "Cedar Crack" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save day" })).toBeInTheDocument();
});

it("asks for a climb before saving an empty day", async () => {
  const user = userEvent.setup();
  const save = vi.fn<Save>();
  render(<Example save={save} />);

  await user.click(screen.getByRole("button", { name: "Save day" }));

  expect(screen.getByText("Add a climb to log this day.")).toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();

  // Adding the climb answers the error, so it doesn't linger above the save.
  await addClimb(user, CRACK);
  expect(screen.queryByText("Add a climb to log this day.")).not.toBeInTheDocument();
});

it("keeps the day after a refused save and saves once while pending", async () => {
  const user = userEvent.setup();
  let finish: (result: ActionResult) => void = () => {};
  const save = vi.fn<Save>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<Example save={save} />);

  const crack = await pickClimb(user, CRACK);
  await user.type(within(crack).getByRole("textbox", { name: "Notes" }), "Kept.");
  await closeDialog(user, crack, "Add to day");
  await user.click(screen.getByRole("button", { name: "Save 1 entry" }));
  expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Save 1 entry" }));
  expect(save).toHaveBeenCalledTimes(1);

  finish({ ok: false, error: "Cedar Crack: A repeat can't be earlier than the recorded ascent" });
  expect(
    await screen.findByText("Cedar Crack: A repeat can't be earlier than the recorded ascent"),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("listitem", { name: "Cedar Crack" })).getByText("Kept."),
  ).toBeInTheDocument();
});
