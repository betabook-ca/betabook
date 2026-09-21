import { useOverlayState } from "@heroui/react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { shareProject, unshareProject } from "@/actions";
import type { PinnedProject } from "@/db/queries";
import type { ActionResult } from "@/lib/action-result";

import { ShareProjectDialog } from "./share-project-dialog";

vi.mock("@/actions", () => ({
  shareProject: vi.fn<() => Promise<ActionResult<{ token: string; expiresAt: string | null }>>>(),
  unshareProject: vi.fn<() => Promise<ActionResult>>(),
}));

const TOKEN = "4f9c2a7e1b8d6035c9e4a1f7b2d80e36";
const ORIGIN = "https://betabook.ca";
const CLIMB = 42;
const EXPIRES = "2026-10-20 12:00:00";

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
  vi.mocked(shareProject).mockResolvedValue({
    ok: true,
    value: { token: TOKEN, expiresAt: EXPIRES },
  });
  vi.mocked(unshareProject).mockResolvedValue({ ok: true, value: undefined });
});

it("warns that the link is open to anyone holding it, before one exists", async () => {
  render(<Example />);

  expect(screen.getByText(/Anyone with this link can open it/i)).toBeInTheDocument();
  expect(screen.getByText(/can pass it on/i)).toBeInTheDocument();
  expect(screen.getByText(/see your sessions and notes for Moon Slab/i)).toBeInTheDocument();
  // No link to copy until the climber asks for one.
  expect(screen.queryByLabelText("Project link")).not.toBeInTheDocument();
});

it("offers no audience to choose, so a link cannot be mistaken for a feed setting", async () => {
  render(<Example />);

  for (const label of ["Friends", "Members", "Everyone", "Only me"]) {
    expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
  }
  expect(screen.getByText(/changes nothing about who sees you in the feed/i)).toBeInTheDocument();
});

it("creates a link with the chosen expiry and shows it, dated", async () => {
  const user = userEvent.setup();
  render(<Example />);

  await user.click(screen.getByRole("button", { name: "Create link" }));

  await waitFor(() => expect(shareProject).toHaveBeenCalledTimes(1));
  expect(shareProject).toHaveBeenCalledWith(CLIMB, "30d");
  const field = await screen.findByLabelText("Project link");
  expect(field).toHaveValue(`${ORIGIN}/projects/${TOKEN}`);
  expect(screen.getByRole("status")).toHaveTextContent("Link created.");
  // The deadline the database computed, not one the client guessed at.
  expect(screen.getByText(/Link expires Oct 20, 2026/)).toBeInTheDocument();
});

it("shows the new deadline after renewing, not the old one", async () => {
  const user = userEvent.setup();
  render(<Example share={{ token: TOKEN, expiresAt: "2026-09-21 12:00:00" }} />);

  expect(screen.getByText(/Link expires Sep 21, 2026/)).toBeInTheDocument();

  vi.mocked(shareProject).mockResolvedValue({
    ok: true,
    value: { token: TOKEN, expiresAt: "2027-03-01 12:00:00" },
  });
  await user.click(screen.getByRole("button", { name: "Renew link" }));

  expect(await screen.findByText(/Link expires Mar 1, 2027/)).toBeInTheDocument();
  expect(screen.queryByText(/Sep 21, 2026/)).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Link renewed.");
});

it("says so plainly when a link never expires", async () => {
  render(<Example share={{ token: TOKEN, expiresAt: null }} />);

  expect(screen.getByText("Link never expires")).toBeInTheDocument();
});

it("shows an existing link and keeps it when the expiry is renewed", async () => {
  const user = userEvent.setup();
  render(<Example share={{ token: TOKEN, expiresAt: null }} />);

  expect(screen.getByLabelText("Project link")).toHaveValue(`${ORIGIN}/projects/${TOKEN}`);

  await user.click(screen.getByRole("button", { name: "Renew link" }));

  await waitFor(() => expect(shareProject).toHaveBeenCalledWith(CLIMB, "30d"));
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
  render(<Example share={{ token: TOKEN, expiresAt: null }} />);

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
  render(<Example share={{ token: TOKEN, expiresAt: null }} />);

  await user.click(screen.getByRole("button", { name: "Stop sharing" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Stop sharing" }));

  await waitFor(() => expect(dialog).toHaveTextContent("Too many changes"));
  expect(screen.getByLabelText("Project link")).toHaveValue(`${ORIGIN}/projects/${TOKEN}`);
});
