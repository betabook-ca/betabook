import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import type { SendAlert } from "@/lib/community-types";

import { NotificationList, sendAlertSummary } from "./notification-list";

vi.mock("@/spa/lib/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => "/notifications",
  useSearchParams: () => new URLSearchParams(),
}));

const climb = (id: number, name: string, grade: number) => ({
  id,
  name,
  type: "boulder" as const,
  grade,
});

const alert = (overrides: Partial<SendAlert> = {}): SendAlert => ({
  userId: "sam",
  name: "Sam",
  image: null,
  date: "2026-11-21",
  sends: 1,
  climbs: [climb(1, "Iron Man", 6)],
  updatedAt: 1,
  unread: false,
  ...overrides,
});

it("names a single send's climb and counts a session's sends", () => {
  expect(sendAlertSummary(alert())).toBe("Sam sent Iron Man");
  expect(sendAlertSummary(alert({ sends: 4 }))).toBe("Sam sent 4 climbs");
});

it("lists named climbs, the remainder and an unread marker", () => {
  const html = renderToStaticMarkup(
    <NotificationList
      alerts={[
        alert({
          sends: 5,
          unread: true,
          climbs: [climb(1, "Iron Man", 6), climb(2, "Bubba", 4), climb(3, "Stem", 2)],
        }),
      ]}
    />,
  );
  expect(html).toContain("Sam sent 5 climbs");
  expect(html).toMatch(/Iron Man.*Bubba.*Stem.* and 2 more/s);
  expect(html).toContain(", unread");
  expect(html).toContain('href="/users/sam/sends?date=2026-11-21"');
});

it("points an empty list at the privacy setting", () => {
  expect(renderToStaticMarkup(<NotificationList alerts={[]} />)).toContain("Account › Privacy");
});
