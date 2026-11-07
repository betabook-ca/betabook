import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { shareClimbList, unshareClimbList } from "@/actions";
import type { ActionResult } from "@/lib/action-result";
import { stubViewport } from "@/test/viewport";

import { ClimbListShare } from "./climb-list-share";

vi.mock("@/actions", () => ({
  shareClimbList: vi.fn<() => Promise<ActionResult<{ token: string; expiresAt: string | null }>>>(),
  unshareClimbList: vi.fn<() => Promise<ActionResult>>(),
}));

const TOKEN = "0123456789abcdef0123456789abcdef";

beforeEach(() => {
  vi.mocked(shareClimbList)
    .mockReset()
    .mockResolvedValue({ ok: true, value: { token: TOKEN, expiresAt: null } });
  vi.mocked(unshareClimbList).mockReset().mockResolvedValue({ ok: true, value: undefined });
});

it("says what the link shows, without a tagged-friends note, then makes the list's link", async () => {
  stubViewport("desktop");
  const user = userEvent.setup();
  render(
    <ClimbListShare
      listId={4}
      listTitle="Red River classics"
      share={null}
      shareOrigin="https://betabook.ca"
      isPrivate={false}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Share" }));
  const dialog = await screen.findByRole("dialog", { name: "Share Red River classics" });
  expect(
    within(dialog).getByText(
      "Anyone with the link sees this list: its name, description, climbs and grades, and your name. It works even when your lists are set to Only me.",
    ),
  ).toBeVisible();
  expect(within(dialog).queryByText("Climbers you tagged aren't named.")).not.toBeInTheDocument();

  await user.click(within(dialog).getByRole("button", { name: "Create link" }));
  expect(shareClimbList).toHaveBeenCalledExactlyOnceWith(4, "30d");
  expect(await within(dialog).findByRole("textbox", { name: "List link" })).toHaveValue(
    `https://betabook.ca/lists/${TOKEN}`,
  );
});

it("offers no link while the profile is private", async () => {
  const user = userEvent.setup();
  render(
    <ClimbListShare
      listId={4}
      listTitle="Red River classics"
      share={null}
      shareOrigin="https://betabook.ca"
      isPrivate
    />,
  );
  await user.click(screen.getByRole("button", { name: "Share" }));
  expect(await screen.findByText("Sharing is off while your profile is private.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Create link" })).not.toBeInTheDocument();
});
