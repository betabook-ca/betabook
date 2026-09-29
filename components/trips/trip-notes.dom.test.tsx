import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { saveTripNotes } from "@/actions";
import type { ActionResult } from "@/lib/action-result";

import { TripNotes } from "./trip-notes";

vi.mock("@/actions", () => ({ saveTripNotes: vi.fn<() => Promise<ActionResult>>() }));

const refresh = vi.fn<() => void>();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const TRIP = 7;
const STORED = "# Day one\n\n**Sent** the project.";

function Example({ notes = STORED }: { notes?: string | null }) {
  return (
    <TripNotes tripId={TRIP} notes={notes}>
      {notes && <p>Rendered on the server.</p>}
    </TripNotes>
  );
}

beforeEach(() => {
  vi.mocked(saveTripNotes).mockReset();
  vi.mocked(saveTripNotes).mockResolvedValue({ ok: true, value: undefined });
  refresh.mockReset();
});

it("shows the notes as rendered, with the source kept for the editor", async () => {
  const user = userEvent.setup();
  render(<Example />);

  expect(screen.getByText("Rendered on the server.")).toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByRole("textbox", { name: /trip notes/i })).toHaveValue(STORED);
});

it("invites the first notes on a trip that has none", async () => {
  const user = userEvent.setup();
  render(<Example notes={null} />);

  await user.click(screen.getByRole("button", { name: "Write trip notes" }));
  expect(screen.getByRole("textbox", { name: /trip notes/i })).toHaveValue("");
});

it("saves what was typed, then goes back to reading", async () => {
  const user = userEvent.setup();
  render(<Example notes={null} />);

  await user.click(screen.getByRole("button", { name: "Write trip notes" }));
  await user.type(screen.getByRole("textbox", { name: /trip notes/i }), "Camped at the Pit.");
  await user.click(screen.getByRole("button", { name: "Save notes" }));

  await waitFor(() =>
    expect(saveTripNotes).toHaveBeenCalledExactlyOnceWith(TRIP, "Camped at the Pit."),
  );
  await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
  expect(refresh).toHaveBeenCalledOnce();
});

it("keeps the draft and says why when the save is refused", async () => {
  vi.mocked(saveTripNotes).mockResolvedValue({ ok: false, error: "Those notes are too long." });
  const user = userEvent.setup();
  render(<Example />);

  await user.click(screen.getByRole("button", { name: "Edit" }));
  const field = screen.getByRole("textbox", { name: /trip notes/i });
  await user.type(field, " More.");
  await user.click(screen.getByRole("button", { name: "Save notes" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Those notes are too long.");
  expect(field).toHaveValue(`${STORED} More.`);
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

  await user.click(screen.getByRole("button", { name: "Edit" }));
  const save = screen.getByRole("button", { name: "Save notes" });
  await user.click(save);
  await waitFor(() => expect(save).toBeDisabled());
  await user.click(save);

  finish({ ok: true, value: undefined });
  await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
  expect(saveTripNotes).toHaveBeenCalledOnce();
});

it("drops an abandoned draft", async () => {
  const user = userEvent.setup();
  render(<Example />);

  await user.click(screen.getByRole("button", { name: "Edit" }));
  await user.type(screen.getByRole("textbox", { name: /trip notes/i }), " Never mind.");
  await user.click(screen.getByRole("button", { name: "Cancel" }));

  expect(saveTripNotes).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByRole("textbox", { name: /trip notes/i })).toHaveValue(STORED);
});

it("previews the draft as the page will show it", async () => {
  const user = userEvent.setup();
  render(<Example />);

  await user.click(screen.getByRole("button", { name: "Edit" }));
  await user.click(screen.getByRole("button", { name: "Preview" }));

  const preview = screen.getByRole("region", { name: "Trip notes preview" });
  expect(await within(preview).findByRole("heading", { name: "Day one" })).toBeInTheDocument();
  expect(within(preview).getByText("Sent").tagName).toBe("STRONG");

  await user.click(screen.getByRole("button", { name: "Hide preview" }));
  expect(screen.queryByRole("region", { name: "Trip notes preview" })).not.toBeInTheDocument();
});
