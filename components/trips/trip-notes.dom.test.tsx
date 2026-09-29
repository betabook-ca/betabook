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

it("keeps the notes on the page and opens their source in the app's dialog", async () => {
  const user = userEvent.setup();
  render(<Example />);

  expect(screen.getByText("Rendered on the server.")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Edit trip notes" }));

  expect(field()).toHaveValue(STORED);
  expect(screen.getByText("Rendered on the server.")).toBeInTheDocument();
});

it("moves focus into the editor and hands it back to the button that opened it", async () => {
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

it("gives a reader who is not the owner the notes and no way to change them", () => {
  const { rerender } = render(<Example canEdit={false} />);

  expect(screen.getByText("Rendered on the server.")).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();

  rerender(<Example notes={null} canEdit={false} />);
  expect(screen.getByText("No trip notes yet.")).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("invites the first notes on a trip that has none, whether or not it has happened", async () => {
  const user = userEvent.setup();
  render(<Example notes={null} />);

  // An upcoming trip has plans to write down and nothing yet to look back on.
  expect(screen.getByText("No trip notes yet.")).toBeInTheDocument();
  expect(screen.queryByText(/how it went/i)).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Write trip notes" }));
  expect(field()).toHaveValue("");
});

it("says who reads the notes while they are being written", async () => {
  const user = userEvent.setup();
  render(<Example />);

  await user.click(screen.getByRole("button", { name: "Edit trip notes" }));
  await user.click(within(editor()).getByRole("button", { name: "About trip notes" }));

  expect(await screen.findByText("Your friends can read your trip notes.")).toBeInTheDocument();
});

it("saves what was typed, then goes back to reading", async () => {
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

it("keeps the draft and says why when the save is refused", async () => {
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

it("does not send a second save while the first is in flight", async () => {
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

it("drops an abandoned draft", async () => {
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

it("previews the draft in place of the field, as the page will show it", async () => {
  const user = userEvent.setup();
  render(<Example />);

  await user.click(screen.getByRole("button", { name: "Edit trip notes" }));
  await user.click(within(editor()).getByRole("button", { name: "Preview" }));

  const preview = within(editor()).getByRole("region", { name: "Trip notes preview" });
  expect(await within(preview).findByRole("heading", { name: "Day one" })).toBeInTheDocument();
  expect(within(preview).getByText("Sent").tagName).toBe("STRONG");
  expect(within(editor()).queryByRole("textbox")).not.toBeInTheDocument();

  await user.click(within(editor()).getByRole("button", { name: "Keep writing" }));
  expect(screen.queryByRole("region", { name: "Trip notes preview" })).not.toBeInTheDocument();
  expect(field()).toHaveValue(STORED);
});

it("keeps what was typed through a look at the preview", async () => {
  const user = userEvent.setup();
  render(<Example notes={null} />);

  await user.click(screen.getByRole("button", { name: "Write trip notes" }));
  await user.type(field(), "Camped at the Pit.");
  await user.click(within(editor()).getByRole("button", { name: "Preview" }));
  const preview = within(editor()).getByRole("region", { name: "Trip notes preview" });
  expect(await within(preview).findByText("Camped at the Pit.")).toBeInTheDocument();

  await user.click(within(editor()).getByRole("button", { name: "Keep writing" }));
  await user.type(field(), " Showers in town.");
  expect(field()).toHaveValue("Camped at the Pit. Showers in town.");
});

it("opens as the desktop dialog at once", async () => {
  stubViewport("desktop");
  const user = userEvent.setup();
  render(<Example />);
  const overlays = watchOverlayKinds();

  await user.click(screen.getByRole("button", { name: "Edit trip notes" }));
  expect(editor()).toBeInTheDocument();
  expect(overlays.seen).toEqual(["modal"]);
  overlays.stop();
});
