import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { updateSend } from "@/actions";
import type { EditableSend, SendableClimb } from "@/db/queries";
import type { ActionResult } from "@/lib/action-result";

import { SendForm } from "./send-form";

vi.mock("@/actions", () => ({
  updateSend: vi.fn<(id: number, formData: FormData) => Promise<ActionResult>>(),
}));

const climb: SendableClimb = { id: 17, areaId: 3, type: "boulder", grade: 5, brokenOn: null };
const send: EditableSend = {
  id: 91,
  ascentStyle: "redpoint",
  dateSent: "2026-08-30",
  comment: null,
  rating: null,
  suggestedGrade: null,
  gradeFeel: "solid",
  videos: null,
};

function setup(overrides: Partial<EditableSend> = {}) {
  const save = vi.mocked(updateSend).mockResolvedValue({ ok: true, value: undefined });
  save.mockClear();
  const onDone = vi.fn<() => void>();
  render(<SendForm climb={climb} existingSend={{ ...send, ...overrides }} onDone={onDone} />);
  return { user: userEvent.setup(), save, onDone };
}

it("shows the opinion fields and submits the climb's grade for a send without a suggestion", async () => {
  const { user, save, onDone } = setup();
  expect(screen.getByRole("button", { name: /Suggested grade/ })).toBeVisible();
  expect(screen.getByRole("radiogroup", { name: "Rating" })).toBeVisible();
  // A boulder never offers Onsight.
  expect(
    within(screen.getByRole("radiogroup", { name: "Ascent style" }))
      .getAllByRole("radio")
      .map((radio) => radio.textContent),
  ).toEqual(["Redpoint", "Flash"]);
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  expect(save).toHaveBeenCalledOnce();
  const [id, form] = save.mock.calls[0];
  expect(id).toBe(91);
  expect(form.get("ascentStyle")).toBe("redpoint");
  expect(form.get("dateSent")).toBe("2026-08-30");
  expect(form.get("rating")).toBe("");
  expect(form.get("suggestedGrade")).toBe("5");
  expect(form.get("gradeFeel")).toBe("solid");
});

it("clears the sent date to make the send undated", async () => {
  const { user, save } = setup();
  await user.click(screen.getByRole("checkbox", { name: "I don't know" }));
  expect(screen.getByRole("checkbox", { name: "I don't know" })).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0][1].get("dateSent")).toBe("");
});

it("withholds the undated option on a broken climb and explains the date cap", () => {
  vi.mocked(updateSend).mockResolvedValue({ ok: true, value: undefined });
  render(
    <SendForm
      climb={{ ...climb, brokenOn: "2026-03-05" }}
      existingSend={{ ...send, dateSent: "2026-02-01" }}
    />,
  );
  expect(screen.queryByRole("checkbox", { name: "I don't know" })).not.toBeInTheDocument();
  expect(
    screen.getByText("This climb broke on 2026-03-05; only earlier dates can be logged."),
  ).toBeVisible();
});

it("submits edits to a recorded opinion", async () => {
  const { user, save } = setup({ rating: 4, suggestedGrade: 6, gradeFeel: "high" });
  expect(screen.getByRole("radio", { name: "4 stars" })).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Low end" }));
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  const [, form] = save.mock.calls[0];
  expect(form.get("rating")).toBe("4");
  expect(form.get("suggestedGrade")).toBe("6");
  expect(form.get("gradeFeel")).toBe("low");
});

it("edits the original journal details with the send and keeps its date required", async () => {
  const save = vi.mocked(updateSend).mockResolvedValue({ ok: true, value: undefined });
  save.mockClear();
  const user = userEvent.setup();
  render(
    <SendForm
      climb={climb}
      existingSend={send}
      existingEntry={{
        id: 42,
        tags: ["beta"],
        companions: [{ id: "sam", name: "Sam", image: null, isSelf: false }],
      }}
    />,
  );
  expect(screen.queryByRole("checkbox", { name: "I don't know" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Remove friend Sam" })).toBeVisible();
  await user.type(screen.getByRole("combobox", { name: "Tags" }), "footwork{Enter}");
  await user.click(screen.getByRole("button", { name: "Remove friend Sam" }));
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  const form = save.mock.calls[0][1];
  expect(form.getAll("tag")).toEqual(["beta", "footwork"]);
  expect(form.get("tagsChanged")).toBe("true");
  expect(form.get("companionsChanged")).toBe("true");
  expect(form.getAll("companion")).toEqual([]);
  expect(form.get("journalEntryId")).toBe("42");
});

it("locks every field while the save is in flight", async () => {
  const { user, save, onDone } = setup();
  let finish: (result: ActionResult) => void = () => {};
  save.mockReturnValueOnce(
    new Promise<ActionResult>((resolve) => {
      finish = resolve;
    }),
  );
  await user.type(screen.getByRole("textbox", { name: "Notes" }), "Keep this beta");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(screen.getByRole("textbox", { name: "Notes" })).toBeDisabled();
  expect(screen.getByRole("radio", { name: "Redpoint" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  expect(onDone).not.toHaveBeenCalled();
  finish({ ok: true, value: undefined });
  await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
});

it("preserves journal edits after a rejected save and retries", async () => {
  const { user, save, onDone } = setup();
  save.mockResolvedValueOnce({
    ok: false,
    error: "The ascent date can't be later than a logged repeat",
  });
  await user.type(screen.getByRole("textbox", { name: "Notes" }), "Keep this beta");
  await user.click(screen.getByRole("button", { name: "Add details" }));
  await user.type(screen.getByRole("combobox", { name: "Tags" }), "footwork{Enter}");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("later than a logged repeat");
  expect(onDone).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue("Keep this beta");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  expect(save.mock.calls[1][1].getAll("tag")).toEqual(["footwork"]);
});

const YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const REEL_TYPED = "instagram.com/some.climber/reel/C9Xq3uGxJ5R/?igsh=x";
const INVALID = "Paste a link to a YouTube video or an Instagram reel or post.";

it("keeps the send's videos, adds another and previews each", async () => {
  const { user, save } = setup({ videos: [YOUTUBE] });
  expect(screen.getByRole("group", { name: "Videos" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Video link 1" })).toHaveValue(YOUTUBE);
  expect(screen.getByText("YouTube video linked")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Add another video" }));
  // The next link goes in the new empty field; no third until it's filled.
  expect(screen.queryByRole("button", { name: "Add another video" })).not.toBeInTheDocument();
  await user.type(screen.getByRole("textbox", { name: "Video link 2" }), REEL_TYPED);
  expect(screen.getByText("Instagram reel linked")).toBeVisible();
  expect(screen.getByRole("link", { name: "Open on Instagram" })).toHaveAttribute(
    "href",
    "https://www.instagram.com/reel/C9Xq3uGxJ5R/",
  );
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  const form = save.mock.calls[0][1];
  expect(form.get("videosChanged")).toBe("true");
  // The server stores canonical links; the form sends what was typed.
  expect(form.getAll("video")).toEqual([YOUTUBE, REEL_TYPED]);
});

it("removes a video, keeping the others in order", async () => {
  const { user, save } = setup({ videos: [YOUTUBE, "https://www.instagram.com/p/C9Xq3uGxJ5R/"] });
  await user.click(screen.getByRole("button", { name: "Remove video link 1" }));
  expect(screen.getByRole("textbox", { name: "Video link 1" })).toHaveValue(
    "https://www.instagram.com/p/C9Xq3uGxJ5R/",
  );
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0][1].getAll("video")).toEqual([
    "https://www.instagram.com/p/C9Xq3uGxJ5R/",
  ]);
});

it("sends an empty list to remove every video", async () => {
  const { user, save } = setup({ videos: [YOUTUBE] });
  await user.click(screen.getByRole("button", { name: "Remove video link 1" }));
  // The field stays, empty, ready for a new link.
  expect(screen.getByRole("textbox", { name: "Video link 1" })).toHaveValue("");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  const form = save.mock.calls[0][1];
  expect(form.get("videosChanged")).toBe("true");
  expect(form.getAll("video")).toEqual([]);
});

it("stops offering another field at five videos", async () => {
  const links = ["AAAAAAAAAAA", "BBBBBBBBBBB", "CCCCCCCCCCC", "DDDDDDDDDDD"].map(
    (id) => `https://www.youtube.com/watch?v=${id}`,
  );
  const { user } = setup({ videos: links });
  await user.click(screen.getByRole("button", { name: "Add another video" }));
  await user.type(
    screen.getByRole("textbox", { name: "Video link 5" }),
    "https://youtu.be/EEEEEEEEEEE",
  );
  expect(screen.queryByRole("button", { name: "Add another video" })).not.toBeInTheDocument();
});

it("flags an unsupported link once the field is left, and won't save it", async () => {
  const { user, save, onDone } = setup();
  const field = screen.getByRole("textbox", { name: "Video link 1" });
  await user.type(field, "https://vimeo.com/123");
  // Not while typing: a half-pasted link isn't a mistake yet.
  expect(field).not.toHaveAttribute("aria-invalid", "true");

  await user.tab();
  expect(field).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("alert")).toHaveTextContent(INVALID);

  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(save).not.toHaveBeenCalled();
  expect(onDone).not.toHaveBeenCalled();
  expect(field).toHaveValue("https://vimeo.com/123");
});

it("says once, at the field, why a link submitted with Enter can't be saved", async () => {
  const { user, save } = setup();
  const field = screen.getByRole("textbox", { name: "Video link 1" });
  await user.type(field, "https://vimeo.com/123{Enter}");

  expect(save).not.toHaveBeenCalled();
  expect(field).toHaveAttribute("aria-invalid", "true");
  expect(screen.getAllByText(INVALID)).toHaveLength(1);
});
