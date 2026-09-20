import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { ProductTour } from "@/components/product-tour";
import { JournalTourPage } from "@/components/product-tours/journal-tour";
import {
  PRODUCT_TOUR_STEPS,
  productTourPath,
  resolveProductTour,
} from "@/lib/product-tour-navigation";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn<(href: string) => void>() }),
  usePathname: () => "/tutorial/journal/journal",
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/actions", () => ({
  saveProductTourStatus: vi.fn<typeof import("@/actions").saveProductTourStatus>(),
}));
vi.mock("@/components/journal/journal-entry-drawer", () => ({ JournalEntryDrawer: () => null }));

function demo(stepId: string, mode: "full" | "updates") {
  const { steps, navigation } = resolveProductTour(PRODUCT_TOUR_STEPS.journal, {
    version: 3,
    savedVersion: 1,
    navigation: { from: "journal", mode },
  });
  const step = steps.find((entry) => entry.id === stepId)!;
  return renderToStaticMarkup(
    <JournalTourPage
      section={step.section}
      mode={navigation.mode}
      steps={steps}
      href={(id, mode = navigation.mode) =>
        productTourPath("journal", { ...navigation, mode, stepId: id })
      }
    />,
  );
}

it.each(["completed", "dismissed"] as const)(
  "omits the Log shortcut after version 1 was %s",
  (status) => {
    const html = renderToStaticMarkup(
      <ProductTour
        initialState={{ returning: true, progress: [{ tourId: "journal", version: 1, status }] }}
      />,
    );
    expect(html).toContain("See what&#x27;s new");
    expect(html).not.toContain("Log an entry");
  },
);

it("retains the real Log shortcut for first-time invitations", () => {
  const html = renderToStaticMarkup(
    <ProductTour initialState={{ returning: false, progress: [] }} />,
  );
  expect(html).toContain("Show me how");
  expect(html).toContain("Log an entry");
});

it.each(["full", "updates"] as const)(
  "browses Pine Canyon's catalog with working filters on Find climbs in the %s tour",
  (mode) => {
    const html = demo("find-projects", mode);
    expect(html).toContain('aria-label="Find climbs"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>Climbs/);
    expect(html).toContain('data-tour-target="climb-filters"');
    // The area is preselected and the nameless list is already populated.
    expect(html).toContain("In area: Pine Canyon");
    expect(html).toContain("The Long Way");
    expect(html).toContain("Canyon Corner");
    expect(html).toContain("Filters");
    expect(html).toContain("Sort by");
    // The sidebar's Find climbs row opens this lesson; no sample climb or the real page is linked.
    expect(html).toMatch(
      /href="\/tutorial\/journal\/find-projects[^"]*"[^>]*>(?:(?!<\/a>).)*Find climbs/s,
    );
    expect(html).not.toContain('href="/climbs/');
    expect(html).not.toContain('href="/search');
    expect(html).not.toContain('data-tour-target="friend-search"');
  },
);

it.each(["find-projects", "find-climbers", "friend-requests", "feed", "account"])(
  "omits the demo Log control from the %s update",
  (stepId) => {
    const html = demo(stepId, "updates");
    expect(html).not.toContain('data-tour-target="journal-log"');
  },
);

it("retains the original Log lesson in full replay", () => {
  const html = demo("journal", "full");
  expect(html).toContain('data-tour-target="journal-log"');
  expect(html).toContain("Logbook");
  expect(html).toContain('data-tour-target="journal-filters"');
});

it("shows the sample Log above the Logbook workspace", () => {
  const html = demo("journal", "full");
  const log = html.indexOf('data-tour-target="journal-log"');
  expect(log).toBeGreaterThan(-1);
  expect(log).toBeLessThan(html.indexOf('aria-label="Logbook workspace"'));
});

it("keeps Journal and Sends together without Progress tabs", () => {
  const html = demo("sends", "full");
  const tabs = html.slice(html.indexOf('aria-label="Logbook sections"'));
  expect(tabs).toMatch(/>Journal<.*>Sends</s);
  expect(tabs).not.toMatch(/>Projects<|>Analytics</);
  expect(tabs).not.toMatch(/>Feed<|>Friends<|>Account settings</);
});

it.each(["full", "updates"] as const)("shows discovery on Search in the %s tour", (mode) => {
  const html = demo("find-climbers", mode);
  expect(html).toContain('aria-label="Search category"');
  expect(html).toMatch(/aria-pressed="true"[^>]*>Climbers/);
  expect(html).toContain('data-tour-target="friend-search"');
  expect(html).toContain("Riley Chen");
  expect(html).toContain("Add friend");
  expect(html).not.toContain('data-tour-target="friend-requests"');
  expect(html).not.toContain('href="/users/');
  expect(html).not.toContain('action="/"');
});

it("keeps request management on its own Friends page", () => {
  const html = demo("friend-requests", "updates");
  expect(html).toContain("Sam Taylor");
  expect(html).toContain("Accept");
  expect(html).toContain("Friends");
  expect(html).toContain('data-tour-target="friend-requests"');
  expect(html).not.toContain('data-tour-target="friend-search"');
  expect(html).not.toContain('aria-label="Search category"');
});
