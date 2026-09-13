import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/action-result";
import type { FeatureAnnouncementDefinition } from "@/lib/feature-announcements";

import { FeatureAnnouncement, FeatureAnnouncementScope } from "./feature-announcement";

vi.mock("@/actions", () => ({ dismissFeatureAnnouncement: vi.fn<() => Promise<ActionResult>>() }));
const features: FeatureAnnouncementDefinition[] = [4, 5].map((month) => ({
  featureId: `feature-${month}`,
  launchedAt: `2026-0${month}-01T00:00:00Z`,
  page: "/analytics",
  title: `Feature ${month}`,
  description: "New controls for this page.",
}));
function visit(
  announcements = features,
  dismissAction: (id: string) => Promise<ActionResult> = async () => ({
    ok: true,
    value: undefined,
  }),
  userId = "viewer",
  page = "/analytics",
) {
  return (
    <FeatureAnnouncementScope
      userId={userId}
      page={page}
      announcements={announcements}
      dismissAction={dismissAction}
    >
      {features.map((feature) => (
        <FeatureAnnouncement key={feature.featureId} featureId={feature.featureId}>
          <button type="button">Control for {feature.title}</button>
        </FeatureAnnouncement>
      ))}
    </FeatureAnnouncementScope>
  );
}

it("shows one eligible callout while keeping every target usable", () => {
  render(visit());
  expect(screen.getAllByRole("heading")).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "Feature 4" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Control for Feature 5" })).toBeVisible();
});

it("does not cascade to another callout on dismissal or a server refresh, but allows it on the next visit", async () => {
  const user = userEvent.setup();
  const save = vi
    .fn<(id: string) => Promise<ActionResult>>()
    .mockResolvedValue({ ok: true, value: undefined });
  const view = render(visit(features, save));
  await user.click(screen.getByRole("button", { name: "Dismiss announcement: Feature 4" }));
  await waitFor(() => expect(screen.queryByRole("heading")).not.toBeInTheDocument());
  expect(save).toHaveBeenCalledExactlyOnceWith("feature-4");
  view.rerender(
    <FeatureAnnouncementScope
      userId="viewer"
      page="/analytics"
      announcements={[]}
      dismissAction={save}
    >
      <p>No matching results</p>
    </FeatureAnnouncementScope>,
  );
  view.rerender(visit([features[1]], save));
  expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  view.unmount();
  render(visit([features[1]], save));
  expect(screen.getByRole("heading", { name: "Feature 5" })).toBeVisible();
});

it("shows no callouts when there are no eligible launches, then resets for a different viewer or page", () => {
  const view = render(visit([]));
  expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  view.rerender(visit(features));
  expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  view.rerender(visit(features, undefined, "older-viewer"));
  expect(screen.getByRole("heading", { name: "Feature 4" })).toBeVisible();
  view.rerender(visit([features[1]], undefined, "older-viewer", "/another-page"));
  expect(screen.getByRole("heading", { name: "Feature 5" })).toBeVisible();
});

it("hides a selection removed by fresh server data without selecting a replacement", () => {
  const view = render(visit());
  view.rerender(visit([features[1]]));
  expect(screen.queryByRole("heading")).not.toBeInTheDocument();
});
