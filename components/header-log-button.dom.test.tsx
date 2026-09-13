import type { UseOverlayStateReturn } from "@heroui/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { HeaderLogButton } from "./header-log-button";

const state = vi.hoisted(() => ({ session: null as { user: { id: string } } | null }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: state.session, isPending: false }) },
}));
vi.mock("@/components/journal/journal-entry-drawer", () => ({
  JournalEntryDrawer: ({ state: overlay }: { state: UseOverlayStateReturn }) =>
    overlay.isOpen ? <div role="dialog" aria-label="Log entry" /> : null,
}));

beforeEach(() => {
  state.session = { user: { id: "owner" } };
});

it("opens a new log entry from the header", async () => {
  const user = userEvent.setup();
  render(<HeaderLogButton />);

  await user.click(screen.getByRole("button", { name: "Log" }));

  expect(await screen.findByRole("dialog", { name: "Log entry" })).toBeInTheDocument();
});

it("leaves Log out of the header when signed out", () => {
  state.session = null;
  render(<HeaderLogButton />);

  expect(screen.queryByRole("button", { name: "Log" })).not.toBeInTheDocument();
});
