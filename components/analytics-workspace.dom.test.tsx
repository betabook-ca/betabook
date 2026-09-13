import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { FeatureAnnouncementScope } from "@/components/feature-announcement";
import type { ActionResult } from "@/lib/action-result";
import { DEFAULT_ANALYTICS_LAYOUT, ANALYTICS_CARD_IDS } from "@/lib/analytics-layout";
import { ANALYTICS_CUSTOMIZE_ANNOUNCEMENT } from "@/lib/feature-announcements";

import { AnalyticsWorkspace } from "./analytics-workspace";

vi.mock("@/actions", () => ({
  dismissFeatureAnnouncement: vi.fn<() => Promise<{ ok: true; value: undefined }>>(),
}));

beforeEach(() => {
  // Visibility is exercised in Playwright; jsdom has no viewport geometry.
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      public observe = vi.fn<IntersectionObserver["observe"]>();
      public disconnect = vi.fn<IntersectionObserver["disconnect"]>();
    },
  );
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: true,
    media,
    addEventListener: vi.fn<() => void>(),
    removeEventListener: vi.fn<() => void>(),
    addListener: vi.fn<() => void>(),
    removeListener: vi.fn<() => void>(),
  }));
});

const cards = ANALYTICS_CARD_IDS.map((id) => ({
  id,
  title: id,
  description: id === "streak" ? "Your longest run of consecutive climbing days." : undefined,
  content: <span>{id} value</span>,
}));

it("starts with five cards and lets an owner discover, add, and save another", async () => {
  const user = userEvent.setup();
  const onSave = vi
    .fn<() => Promise<{ ok: true; value: undefined }>>()
    .mockResolvedValue({ ok: true, value: undefined });
  render(<AnalyticsWorkspace cards={cards} charts={[]} canCustomize onSave={onSave} />);
  expect(screen.getAllByRole("article").map((el) => el.getAttribute("aria-label"))).toEqual([
    "sends",
    "hardest",
    "days",
    "firstTry",
    "bestYear",
  ]);
  await user.click(screen.getByRole("button", { name: "Customize cards" }));
  expect(screen.getByRole("heading", { name: "Customize your analytics dashboard" })).toBeVisible();
  expect(
    screen.getByText(
      "Add items below, drag to reorder, or use X to hide items. Click Save layout when you’re done. This only affects your own view.",
    ),
  ).toBeVisible();
  expect(
    within(screen.getByRole("group", { name: "Dashboard actions" })).getByRole("button", {
      name: "Save layout",
    }),
  ).toBeVisible();
  const choices = screen.getByRole("group", { name: "At a glance" });
  expect(within(choices).getByText("Your longest run of consecutive climbing days.")).toBeVisible();
  await user.click(within(choices).getByText("Your longest run of consecutive climbing days."));
  expect(screen.getByRole("article", { name: "streak" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Save layout" }));
  expect(onSave).toHaveBeenCalledWith({
    ...DEFAULT_ANALYTICS_LAYOUT,
    cards: [...DEFAULT_ANALYTICS_LAYOUT.cards, "streak"],
  });
});

it("preserves an existing saved layout and hides discovery controls from visitors", () => {
  const initialLayout = {
    ...DEFAULT_ANALYTICS_LAYOUT,
    cards: ANALYTICS_CARD_IDS.slice(0, 10),
  };
  const { rerender } = render(
    <AnalyticsWorkspace cards={cards} charts={[]} canCustomize initialLayout={initialLayout} />,
  );
  expect(screen.getAllByRole("article")).toHaveLength(10);
  rerender(<AnalyticsWorkspace cards={cards} charts={[]} initialLayout={initialLayout} />);
  expect(screen.queryByRole("button", { name: "Customize cards" })).not.toBeInTheDocument();
});

it("opens the same editor from hidden chart and card placeholders, including empty sections", async () => {
  const user = userEvent.setup();
  const charts = [
    { id: "pyramid" as const, title: "Pyramid", content: <span>Pyramid chart</span> },
  ];
  render(
    <AnalyticsWorkspace
      cards={cards}
      charts={charts}
      canCustomize
      initialLayout={{ ...DEFAULT_ANALYTICS_LAYOUT, cards: [], charts: [] }}
    />,
  );
  expect(screen.queryByRole("button", { name: "Add cards" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Customize cards" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Customize charts" }));
  expect(screen.getByRole("group", { name: "Charts" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Customize charts" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Customize cards" }));
  expect(screen.getByRole("group", { name: "At a glance" })).toBeVisible();
});

it("has no placeholders when every item is displayed", () => {
  render(
    <AnalyticsWorkspace
      cards={cards}
      charts={[]}
      canCustomize
      initialLayout={{ ...DEFAULT_ANALYTICS_LAYOUT, cards: [...ANALYTICS_CARD_IDS] }}
    />,
  );
  expect(screen.getByRole("button", { name: "Customize dashboard" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Customize cards" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Customize charts" })).not.toBeInTheDocument();
});

it("offers optional charts through the chart placeholder and hides it after adding all charts", async () => {
  const user = userEvent.setup();
  const charts = [
    { id: "volume" as const, title: "Volume over time", content: <span>Monthly volume</span> },
    {
      id: "flashRate" as const,
      title: "First-try rate by grade",
      content: <span>First-try chart</span>,
    },
  ];
  render(<AnalyticsWorkspace cards={cards} charts={charts} canCustomize />);
  await user.click(screen.getByRole("button", { name: "Customize charts" }));
  await user.click(screen.getByRole("button", { name: "Add Volume over time" }));
  await user.click(screen.getByRole("button", { name: "Add First-try rate by grade" }));
  await user.click(screen.getByRole("button", { name: "Save layout" }));
  expect(screen.getByRole("article", { name: "Volume over time" })).toBeVisible();
  expect(screen.getByRole("article", { name: "First-try rate by grade" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Customize charts" })).not.toBeInTheDocument();
});

function announcedWorkspace({
  dismissed = false,
  owner = true,
  dismissAction,
}: {
  dismissed?: boolean;
  owner?: boolean;
  dismissAction?: (id: string) => Promise<ActionResult>;
} = {}) {
  return (
    <FeatureAnnouncementScope
      userId="owner"
      page={ANALYTICS_CUSTOMIZE_ANNOUNCEMENT.page}
      announcements={dismissed ? [] : [ANALYTICS_CUSTOMIZE_ANNOUNCEMENT]}
      dismissAction={dismissAction}
    >
      <AnalyticsWorkspace cards={cards} charts={[]} canCustomize={owner} />
    </FeatureAnnouncementScope>
  );
}

it("announces Customize to owners until X is pressed, without treating editing as dismissal", async () => {
  const user = userEvent.setup();
  const dismissAction = vi
    .fn<() => Promise<{ ok: true; value: undefined }>>()
    .mockResolvedValue({ ok: true, value: undefined });
  render(announcedWorkspace({ dismissAction }));
  expect(screen.getByRole("heading", { name: "Make Analytics your own" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Customize dashboard" }));
  expect(
    screen.queryByRole("heading", { name: "Make Analytics your own" }),
  ).not.toBeInTheDocument();
  expect(dismissAction).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("heading", { name: "Make Analytics your own" })).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Dismiss announcement: Make Analytics your own" }),
  );
  expect(dismissAction).toHaveBeenCalledExactlyOnceWith("analytics-customize");
  await user.click(screen.getByRole("button", { name: "Customize dashboard" }));
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(
    screen.queryByRole("heading", { name: "Make Analytics your own" }),
  ).not.toBeInTheDocument();
});

it("does not announce Customize to visitors or owners who already dismissed it", () => {
  const view = render(announcedWorkspace({ dismissed: true }));
  expect(
    screen.queryByRole("heading", { name: "Make Analytics your own" }),
  ).not.toBeInTheDocument();
  view.rerender(announcedWorkspace({ owner: false }));
  expect(screen.queryByRole("button", { name: "Customize dashboard" })).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Make Analytics your own" }),
  ).not.toBeInTheDocument();
});
