import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/action-result";

import { HeaderLogButton } from "./header-log-button";

const state = vi.hoisted(() => ({ session: null as { user: { id: string } } | null }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: state.session, isPending: false }) },
}));
vi.mock("@/actions", () => ({
  createJournalEntry: vi.fn<() => Promise<ActionResult>>(),
  createUndatedSend: vi.fn<() => Promise<ActionResult>>(),
  updateJournalEntry: vi.fn<() => Promise<ActionResult>>(),
}));

beforeEach(() => {
  state.session = { user: { id: "owner" } };
});

it("opens a new log entry from the header", async () => {
  const user = userEvent.setup();
  render(<HeaderLogButton />);

  await user.click(screen.getByRole("button", { name: "Log" }));

  const dialog = await screen.findByRole("dialog", { name: "Log entry" });
  expect(within(dialog).getByRole("button", { name: /^Training/ })).toBeInTheDocument();
});

it("leaves Log out of the header when signed out", () => {
  state.session = null;
  render(<HeaderLogButton />);

  expect(screen.queryByRole("button", { name: "Log" })).not.toBeInTheDocument();
});
