import { expect, it } from "vitest";

import robots from "@/app/robots";

/** Matches the robots.txt prefix rule: a Disallow path blocks every URL it starts. */
function crawlable(path: string): boolean {
  const rules = robots().rules;
  const disallow = (Array.isArray(rules) ? rules : [rules]).flatMap((rule) =>
    Array.isArray(rule.disallow) ? rule.disallow : rule.disallow ? [rule.disallow] : [],
  );
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return !disallow.some((prefix) =>
    prefix.includes("*")
      ? new RegExp(`^${prefix.split("*").map(escape).join(".*")}`).test(path)
      : path.startsWith(prefix),
  );
}

it("lets crawlers fetch the bare Find climbs page so its noindex is read, but not its states", () => {
  // Linked from every signed-out page: a blocked URL could be listed without content.
  expect(crawlable("/search")).toBe(true);
  // Unbounded filter states and legacy home searches stay closed for database cost.
  expect(crawlable("/search?mode=climb&discipline=boulder")).toBe(false);
  expect(crawlable("/?mode=climb&name=a")).toBe(false);
  // Canonical catalog pages stay open; their filter states do not.
  expect(crawlable("/")).toBe(true);
  expect(crawlable("/areas/3/test-crag")).toBe(true);
  expect(crawlable("/areas/3/test-crag?sort=grade_desc")).toBe(false);
  expect(crawlable("/climbs/1/test-highball")).toBe(true);
  expect(crawlable("/sign-in?next=%2Fsearch")).toBe(false);
});
