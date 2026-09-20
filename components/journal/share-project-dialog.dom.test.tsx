import { useOverlayState } from "@heroui/react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { shareProject, unshareProject } from "@/actions";
import type { PinnedProject } from "@/db/queries";
import type { ActionResult } from "@/lib/action-result";

import { ShareProjectDialog } from "./share-project-dialog";

vi.mock("@/actions", () => ({
  shareProject: vi.fn<() => Promise<ActionResult<{ token: string }>>>(),
  unshareProject: vi.fn<() => Promise<ActionResult>>(),
}));

const TOKEN = "4f9c2a7e1b8d6035c9e4a1f7b2d80e36";
const ORIGIN = "https://betabook.ca";
const CLIMB = 42;

function Example({ share = null }: { share?: PinnedProject["share"] }) {
  const state = useOverlayState({ defaultOpen: true });
  return (
    <ShareProjectDialog
      state={state}
      climbId={CLIMB}
      climbName="Moon Slab"
      share={share}
      shareOrigin={ORIGIN}
    />
  );
}

beforeEach(() => {
  vi.mocked(shareProject).mockReset();
  vi.mocked(unshareProject).mockReset();
  vi.mocked(shareProject).mockResolvedValue({ ok: true, value: { token: TOKEN } });
  vi.mocked(unshareProject).mockResolvedValue({ ok: true, value: undefined });
});

it("says what the link exposes before one exists", async () => {
  render(<Example />);

  expect(screen.getByText(/sees your sessions and notes for Moon Slab/i)).toBeInTheDocument();
  // No link to copy until the climber asks for one.
  expect(screen.queryByLabelText("Project link")).not.toBeInTheDocument();
});

it("creates a link with the chosen audience and expiry, and shows it", async () => {
  const user = userEvent.setup();
  render(<Example />);

  await user.click(screen.getByRole("button", { name: "Everyone" }));
  await user.click(screen.getByRole("button", { name: "Create link" }));

  await waitFor(() => expect(shareProject).toHaveBeenCalledTimes(1));
  expect(shareProject).toHaveBeenCalledWith(CLIMB, "everyone", "30d");
  const field = await screen.findByLabelText("Project link");
  expect(field).toHaveValue(`${ORIGIN}/projects/${TOKEN}`);
  expect(screen.getByRole("status")).toHaveTextContent("Link created.");
});

it("defaults to the narrowest audience", async () => {
  const user = userEvent.setup();
  render(<Example />);

  await user.click(screen.getByRole("button", { name: "Create link" }));

  await waitFor(() => expect(shareProject).toHaveBeenCalledWith(CLIMB, "friends", "30d"));
});

it("opens on the saved audience and keeps the same link when it changes", async () => {
  const user = userEvent.setup();
  render(<Example share={{ token: TOKEN, audience: "public", expiresAt: null }} />);

  expect(screen.getByRole("button", { name: "Members" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByLabelText("Project link")).toHaveValue(`${ORIGIN}/projects/${TOKEN}`);

  await user.click(screen.getByRole("button", { name: "Friends" }));
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  await waitFor(() => expect(shareProject).toHaveBeenCalledWith(CLIMB, "friends", "30d"));
  expect(screen.getByLabelText("Project link")).toHaveValue(`${ORIGIN}/projects/${TOKEN}`);
});

it("keeps the dialog open with the reason when sharing fails", async () => {
  const user = userEvent.setup();
  vi.mocked(shareProject).mockResolvedValue({ ok: false, error: "Sharing is off while private" });
  render(<Example />);

  await user.click(screen.getByRole("button", { name: "Create link" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Sharing is off while private");
  expect(screen.queryByLabelText("Project link")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create link" })).toBeInTheDocument();
});

it("confirms before stopping, then drops the link", async () => {
  const user = userEvent.setup();
  render(<Example share={{ token: TOKEN, audience: "friends", expiresAt: null }} />);

  await user.click(screen.getByRole("button", { name: "Stop sharing" }));
  // The confirmation exists to say what survives; stopping is not a delete.
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent(/sessions, notes and send are kept/i);
  expect(unshareProject).not.toHaveBeenCalled();

  await user.click(within(dialog).getByRole("button", { name: "Stop sharing" }));

  await waitFor(() => expect(unshareProject).toHaveBeenCalledWith(CLIMB));
  await waitFor(() => expect(screen.queryByLabelText("Project link")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Create link" })).toBeInTheDocument();
});

it("reports a failure to stop without dropping the link", async () => {
  const user = userEvent.setup();
  vi.mocked(unshareProject).mockResolvedValue({ ok: false, error: "Too many changes" });
  render(<Example share={{ token: TOKEN, audience: "friends", expiresAt: null }} />);

  await user.click(screen.getByRole("button", { name: "Stop sharing" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Stop sharing" }));

  await waitFor(() => expect(dialog).toHaveTextContent("Too many changes"));
  expect(screen.getByLabelText("Project link")).toHaveValue(`${ORIGIN}/projects/${TOKEN}`);
});
