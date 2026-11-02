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

vi.mock("@/actions", () => ({ createDayEntries: vi.fn<() => Promise<ActionResult>>() }));

const VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const alex = { id: "alex", name: "Alex Rivera", image: null };

type Save = (formData: FormData) => Promise<ActionResult>;

const noop = () => {};
const companionFetcher: LookupFetcher<CompanionOption> = async () => [alex];

function Example({ save, onDone = noop }: { save: Save; onDone?: () => void }) {
  const [climbFetcher] = useState(() => createSearchFixtureFetcher());
  return (
    <DayLogComposer
      today="2026-09-12"
      onBack={noop}
      onDone={onDone}
      onSave={save}
      climbFetcher={climbFetcher}
      companionFetcher={companionFetcher}
    />
  );
}

async function addClimb(user: UserEvent, name: string) {
  await openPicker(user);
  await user.click(await screen.findByRole("button", { name: `Choose ${name}` }));
  return screen.getByRole("listitem", { name: name.split(",")[0] });
}

async function openPicker(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Add climb" }));
  await user.type(screen.getByRole("searchbox", { name: "Choose a climb" }), "cedar");
}

async function openDetails(user: UserEvent, row: HTMLElement) {
  await user.click(within(row).getByRole("button", { name: "Add details" }));
}

async function addTag(user: UserEvent, field: HTMLElement, tag: string) {
  await user.type(field, `${tag}{Enter}`);
}

function posted(save: ReturnType<typeof vi.fn<Save>>) {
  expect(save).toHaveBeenCalledTimes(1);
  return readDayEntries(save.mock.calls[0][0]);
}

const CRACK = "Cedar Crack, North Woods / Upper Wall";
const CORNER = "Cedar Corner, North Woods / Cedar Grove";
const ARETE = "Cedar Arete, North Woods / Cedar Grove";

it("posts the date and friends once and each climb's own style, note and videos", async () => {
  const user = userEvent.setup();
  const save = vi.fn<Save>().mockResolvedValue({ ok: true, value: undefined });
  const onDone = vi.fn<() => void>();
  render(<Example save={save} onDone={onDone} />);

  const friends = screen.getByRole("group", { name: "Tagged friends" });
  await user.type(within(friends).getByRole("combobox"), "Alex");
  await user.click(await screen.findByRole("option", { name: "Alex Rivera" }));

  const crack = await addClimb(user, CRACK);
  await user.click(within(crack).getByRole("radio", { name: "Redpoint" }));
  await user.type(within(crack).getByRole("textbox", { name: "Notes" }), "Finally.");
  await openDetails(user, crack);
  await user.type(within(crack).getByRole("textbox", { name: /Video link/ }), VIDEO);

  const arete = await addClimb(user, ARETE);
  expect(within(arete).getByRole("radio", { name: "Repeat" })).toBeInTheDocument();
  await user.click(within(arete).getByRole("radio", { name: "Repeat" }));

  await user.click(screen.getByRole("button", { name: "Save 2 entries" }));

  const { shared, entries } = posted(save);
  expect(shared.get("entryDate")).toBe("2026-09-12");
  expect(shared.getAll("companion")).toEqual(["alex"]);
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
    sent: "true",
    body: "",
  });
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
});

it("copies day tags onto every climb, lets one climb decline them and keeps its own tags", async () => {
  const user = userEvent.setup();
  const save = vi.fn<Save>().mockResolvedValue({ ok: true, value: undefined });
  render(<Example save={save} />);

  await addClimb(user, CRACK);
  await addTag(user, screen.getByRole("combobox", { name: "Tags for every climb" }), "cold");
  // A climb queued after the day tag starts with it too.
  const corner = await addClimb(user, CORNER);
  const crack = screen.getByRole("listitem", { name: "Cedar Crack" });

  await openDetails(user, crack);
  await user.click(within(crack).getByRole("button", { name: "Remove tag cold" }));
  await openDetails(user, corner);
  const cornerTags = within(corner).getByRole("combobox", { name: "Tags" });
  expect(within(corner).getByRole("button", { name: "Remove tag cold" })).toBeInTheDocument();
  await addTag(user, cornerTags, "crimpy");

  // Taking the day tag off clears it everywhere; putting it back skips the
  // climb that declined it.
  const dayTags = screen.getByRole("combobox", { name: "Tags for every climb" });
  const dayField = screen.getByRole("group", { name: "Day tags" });
  await user.click(within(dayField).getByRole("button", { name: "Remove tag cold" }));
  expect(within(corner).queryByRole("button", { name: "Remove tag cold" })).not.toBeInTheDocument();
  await addTag(user, dayTags, "cold");

  await user.click(screen.getByRole("button", { name: "Save 2 entries" }));
  const { entries } = posted(save);
  expect(entries.map((entry) => entry.getAll("tag"))).toEqual([[], ["crimpy", "cold"]]);
});

it("flags a bad video link on its own climb and saves nothing", async () => {
  const user = userEvent.setup();
  const save = vi.fn<Save>();
  render(<Example save={save} />);

  await addClimb(user, CORNER);
  const crack = await addClimb(user, CRACK);
  await user.click(within(crack).getByRole("radio", { name: "Redpoint" }));
  await openDetails(user, crack);
  await user.type(
    within(crack).getByRole("textbox", { name: /Video link/ }),
    "https://example.com/x",
  );
  await user.click(screen.getByRole("button", { name: "Save 2 entries" }));

  expect(save).not.toHaveBeenCalled();
  expect(within(crack).getByText(SEND_VIDEO_INVALID_MESSAGE)).toBeInTheDocument();
  const corner = screen.getByRole("listitem", { name: "Cedar Corner" });
  expect(within(corner).queryByText(SEND_VIDEO_INVALID_MESSAGE)).not.toBeInTheDocument();
});

it("leaves a climb's rating and videos out once it's switched back to a session", async () => {
  const user = userEvent.setup();
  const save = vi.fn<Save>().mockResolvedValue({ ok: true, value: undefined });
  render(<Example save={save} />);

  const crack = await addClimb(user, CRACK);
  await user.click(within(crack).getByRole("radio", { name: "Redpoint" }));
  await openDetails(user, crack);
  await user.type(within(crack).getByRole("textbox", { name: /Video link/ }), VIDEO);
  await user.click(within(crack).getByRole("radio", { name: "Session" }));
  expect(within(crack).queryByRole("textbox", { name: /Video link/ })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Save 1 entry" }));
  const { entries } = posted(save);
  expect(Object.fromEntries(entries[0].entries())).toEqual({ climbId: "102", body: "" });
});

it("won't queue a climb twice, and removes one from the day", async () => {
  const user = userEvent.setup();
  render(<Example save={vi.fn<Save>()} />);

  await addClimb(user, CRACK);
  await openPicker(user);
  expect(await screen.findByRole("button", { name: `Choose ${CRACK}` })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Back to the day" }));

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

  const crack = await addClimb(user, CRACK);
  await user.type(within(crack).getByRole("textbox", { name: "Notes" }), "Kept.");
  await user.click(screen.getByRole("button", { name: "Save 1 entry" }));
  expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Save 1 entry" }));
  expect(save).toHaveBeenCalledTimes(1);

  finish({ ok: false, error: "Cedar Crack: A repeat can't be earlier than the recorded ascent" });
  expect(
    await screen.findByText("Cedar Crack: A repeat can't be earlier than the recorded ascent"),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("listitem", { name: "Cedar Crack" })).getByRole("textbox", {
      name: "Notes",
    }),
  ).toHaveValue("Kept.");
});
