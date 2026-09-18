import { useOverlayState } from "@heroui/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { requestClimbBreak } from "@/actions";
import type { Climb } from "@/db/queries";

import { ClimbBreakDrawer } from "./climb-break-drawer";

vi.mock("@/actions", () => ({ requestClimbBreak: vi.fn<typeof requestClimbBreak>() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn<() => void>(), push: vi.fn<(href: string) => void>() }),
}));

const climb: Climb = {
  id: 1,
  areaId: 1,
  name: "Cedar Arete",
  type: "boulder",
  grade: 5,
  description: "A clean arete.",
  brokenOn: null,
  sendCount: 3,
  ratingSum: 12,
  ratingCount: 3,
  avgRating: 4,
  latitude: null,
  longitude: null,
};

function Reporter() {
  const state = useOverlayState({ defaultOpen: true });
  return <ClimbBreakDrawer climb={climb} state={state} />;
}

it("previews the composed texts and submits the date and reason", async () => {
  const request = vi.mocked(requestClimbBreak).mockReset();
  request.mockResolvedValue({ ok: true, value: { status: "pending" } });
  const user = userEvent.setup();
  render(<Reporter />);

  const submit = screen.getByRole("button", { name: "Report as broken" });
  expect(submit).toBeDisabled();
  expect(screen.queryByText(/post break \(/)).not.toBeInTheDocument();

  await user.type(screen.getByRole("textbox", { name: "What happened" }), "The flake snapped");
  expect(screen.getByText(/^Cedar Arete - post break \(\d{4}\)$/)).toBeVisible();
  expect(screen.getByText(/The flake snapped\. Ascents from before that date/)).toBeVisible();
  expect(
    screen.getByText(/Its V4 grade is carried over from the original as a placeholder/),
  ).toBeVisible();

  await user.click(submit);
  await waitFor(() => expect(request).toHaveBeenCalledOnce());
  const [climbId, formData] = request.mock.calls[0];
  expect(climbId).toBe(1);
  expect(formData.get("reason")).toBe("The flake snapped");
  expect(formData.get("brokenOn")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  // Queued: the form gives way to the notice so a second click can't double-submit.
  expect(await screen.findByText(/Submitted for admin review/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Report as broken" })).not.toBeInTheDocument();
});

it("shows the server's refusal and keeps the form for another try", async () => {
  vi.mocked(requestClimbBreak).mockReset().mockResolvedValue({
    ok: false,
    error: "2 send(s) on this climb are dated on or after 2026-03-05 — check the date",
  });
  const user = userEvent.setup();
  render(<Reporter />);
  await user.type(screen.getByRole("textbox", { name: "What happened" }), "Rockfall");
  await user.click(screen.getByRole("button", { name: "Report as broken" }));
  expect(await screen.findByText(/2 send\(s\) on this climb are dated on or after/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Report as broken" })).toBeEnabled();
});
