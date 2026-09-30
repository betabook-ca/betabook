import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { saveTripNotes } from "@/actions";
import type { ActionResult } from "@/lib/action-result";
import { watchOverlayKinds } from "@/test/overlay-kinds";
import { stubViewport } from "@/test/viewport";

import { TripNotes } from "./trip-notes";

vi.mock("@/actions", () => ({ saveTripNotes: vi.fn<() => Promise<ActionResult>>() }));

const refresh = vi.fn<() => void>();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const TRIP = 7;
const STORED = "# Day one\n\n**Sent** the project.";

function Example({ notes = STORED, canEdit = true }: { notes?: string | null; canEdit?: boolean }) {
  return (
    <TripNotes tripId={TRIP} notes={notes} canEdit={canEdit}>
      {notes && <p>Rendered on the server.</p>}
    </TripNotes>
  );
}

const editor = () => screen.getByRole("dialog", { name: "Edit trip notes" });
const field = () => within(editor()).getByRole("textbox", { name: /trip notes/i });
const closed = () => waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  vi.mocked(saveTripNotes).mockReset();
  vi.mocked(saveTripNotes).mockResolvedValue({ ok: true, value: undefined });
  refresh.mockReset();
});

it("renders the notes and opens the editor with the Markdown source", async () => {
  const user = userEvent.setup();
  render(<Example />);

  expect(screen.getByText("Rendered on the server.")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Edit trip notes" }));

  expect(field()).toHaveValue(STORED);
  expect(screen.getByText("Rendered on the server.")).toBeInTheDocument();
});

it("has a visible heading", () => {
  render(<Example />);

  expect(screen.getByRole("heading", { name: "Trip notes" })).not.toHaveClass("sr-only");
});

it("puts the edit button inside the notes card", () => {
  render(<Example />);

  const notes = screen.getByText("Rendered on the server.");
  const edit = screen.getByRole("button", { name: "Edit trip notes" });
  const card = edit.parentElement;

  // The button comes before the notes in the card, so the text wraps around it.
  expect(card).toContainElement(notes);
  expect(card).not.toBe(screen.getByRole("region", { name: "Trip notes" }));
  expect(card?.firstElementChild).toBe(edit);
  // A pencil icon, like the edit button for climb and area descriptions.
  expect(edit.textContent).toBe("");
});

it("moves focus into the editor and back to the button on close", async () => {
  const user = userEvent.setup();
  render(<Example />);

  await user.click(screen.getByRole("button", { name: "Edit trip notes" }));
  await waitFor(() => expect(editor()).toContainElement(document.activeElement as HTMLElement));

  await user.click(within(editor()).getByRole("button", { name: "Cancel" }));
  await closed();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Edit trip notes" })).toHaveFocus(),
  );
});

it("shows notes read-only to non-owners", () => {
  const { rerender } = render(<Example canEdit={false} />);

  expect(screen.getByText("Rendered on the server.")).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();

  rerender(<Example notes={null} canEdit={false} />);
  expect(screen.getByText("No trip notes yet.")).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("offers to write notes when a trip has none", async () => {
  const user = userEvent.setup();
  render(<Example notes={null} />);

  // The empty state doesn't assume the trip is over.
  expect(screen.getByText("No trip notes yet.")).toBeInTheDocument();
  expect(screen.queryByText(/how it went/i)).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Write trip notes" }));
  expect(field()).toHaveValue("");
});

it("labels the field with no extra hint", async () => {
  const user = userEvent.setup();
  render(<Example />);

  await user.click(screen.getByRole("button", { name: "Edit trip notes" }));

  expect(field()).toBeInTheDocument();
  expect(within(editor()).queryByRole("button", { name: /^About/ })).not.toBeInTheDocument();
  expect(editor()).not.toHaveTextContent(/friends can read/i);
});

it("saves the draft and closes the editor", async () => {
  const user = userEvent.setup();
  render(<Example notes={null} />);

  await user.click(screen.getByRole("button", { name: "Write trip notes" }));
  await user.type(field(), "Camped at the Pit.");
  await user.click(within(editor()).getByRole("button", { name: "Save notes" }));

  await waitFor(() =>
    expect(saveTripNotes).toHaveBeenCalledExactlyOnceWith(TRIP, "Camped at the Pit."),
  );
  await closed();
  expect(refresh).toHaveBeenCalledOnce();
});

it("keeps the draft and shows the error when saving fails", async () => {
  vi.mocked(saveTripNotes).mockResolvedValue({ ok: false, error: "Those notes are too long." });
  const user = userEvent.setup();
  render(<Example />);

  await user.click(screen.getByRole("button", { name: "Edit trip notes" }));
  await user.type(field(), " More.");
  await user.click(within(editor()).getByRole("button", { name: "Save notes" }));

  expect(await within(editor()).findByRole("alert")).toHaveTextContent("Those notes are too long.");
  expect(field()).toHaveValue(`${STORED} More.`);
  expect(refresh).not.toHaveBeenCalled();
});

it("does not save twice while a save is in progress", async () => {
  let finish: (result: ActionResult) => void = () => {};
  vi.mocked(saveTripNotes).mockReturnValue(
    new Promise<ActionResult>((resolve) => {
      finish = resolve;
    }),
  );
  const user = userEvent.setup();
  render(<Example />);

  await user.click(screen.getByRole("button", { name: "Edit trip notes" }));
  const save = within(editor()).getByRole("button", { name: "Save notes" });
  await user.click(save);
  await waitFor(() => expect(save).toBeDisabled());
  await user.click(save);

  finish({ ok: true, value: undefined });
  await closed();
  expect(saveTripNotes).toHaveBeenCalledOnce();
});

it("discards the draft on cancel", async () => {
  const user = userEvent.setup();
  render(<Example />);

  await user.click(screen.getByRole("button", { name: "Edit trip notes" }));
  await user.type(field(), " Never mind.");
  await user.click(within(editor()).getByRole("button", { name: "Cancel" }));
  await closed();

  expect(saveTripNotes).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Edit trip notes" }));
  expect(field()).toHaveValue(STORED);
});

it("previews the draft in place of the field", async () => {
  const user = userEvent.setup();
  render(<Example />);

  await user.click(screen.getByRole("button", { name: "Edit trip notes" }));
  await user.click(within(editor()).getByRole("button", { name: "Preview" }));

  const preview = within(editor()).getByRole("region", { name: "Trip notes preview" });
  expect(await within(preview).findByRole("heading", { name: "Day one" })).toBeInTheDocument();
  expect(within(preview).getByText("Sent").tagName).toBe("STRONG");
  expect(within(editor()).queryByRole("textbox")).not.toBeInTheDocument();

  await user.click(within(editor()).getByRole("button", { name: "Edit" }));
  expect(screen.queryByRole("region", { name: "Trip notes preview" })).not.toBeInTheDocument();
  expect(field()).toHaveValue(STORED);
});

it("keeps the draft after previewing", async () => {
  const user = userEvent.setup();
  render(<Example notes={null} />);

  await user.click(screen.getByRole("button", { name: "Write trip notes" }));
  await user.type(field(), "Camped at the Pit.");
  await user.click(within(editor()).getByRole("button", { name: "Preview" }));
  const preview = within(editor()).getByRole("region", { name: "Trip notes preview" });
  expect(await within(preview).findByText("Camped at the Pit.")).toBeInTheDocument();

  await user.click(within(editor()).getByRole("button", { name: "Edit" }));
  await user.type(field(), " Showers in town.");
  expect(field()).toHaveValue("Camped at the Pit. Showers in town.");
});

it("opens as a modal on desktop", async () => {
  stubViewport("desktop");
  const user = userEvent.setup();
  render(<Example />);
  const overlays = watchOverlayKinds();

  await user.click(screen.getByRole("button", { name: "Edit trip notes" }));
  expect(editor()).toBeInTheDocument();
  expect(overlays.seen).toEqual(["modal"]);
  overlays.stop();
});
