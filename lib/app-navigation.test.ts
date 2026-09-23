import { expect, it } from "vitest";

import { primaryAreaForPath, primaryDestinations, workspaceTabs } from "./app-navigation";

it("offers the three frequently used destinations in order", () => {
  expect(primaryDestinations("alex").map(({ label, href }) => [label, href])).toEqual([
    ["Logbook", "/users/alex/journal"],
    ["Progress", "/users/alex/goals"],
    ["Community", "/feed"],
  ]);
});

it.each([
  ["/users/alex", "logbook"],
  ["/users/alex/journal", "logbook"],
  ["/users/alex/sends", "logbook"],
  ["/users/alex/trips", "logbook"],
  ["/users/alex/trips/7", "logbook"],
  ["/users/alex/trips/7/analytics", "logbook"],
  // The owner's own trip analytics stays in Logbook. Only the standalone
  // /users/alex/analytics page belongs to Progress, and the trip tab must not
  // be pulled across by sharing the word.
  ["/users/alex/projects", "progress"],
  ["/users/alex/projects/sent", "progress"],
  ["/users/alex/goals", "progress"],
  ["/users/alex/analytics", "progress"],
  ["/feed", "community"],
  ["/friends", "community"],
  ["/users/alex-other/analytics", "community"],
  ["/account", "account"],
  ["/account/import", "account"],
  ["/climbs/42", undefined],
  ["/account-other", undefined],
])("maps %s to %s without confusing another climber with the owner", (path, expected) => {
  expect(primaryAreaForPath(path, "alex")).toBe(expected);
});

it("keeps workspace sections small and preserves existing routes", () => {
  expect(workspaceTabs("logbook", "alex").map(({ label }) => label)).toEqual([
    "Journal",
    "Sends",
    "Trips",
  ]);
  expect(workspaceTabs("progress", "alex").map(({ label }) => label)).toEqual([
    "Goals",
    "Projects",
    "Analytics",
  ]);
  expect(workspaceTabs("community", "alex").map(({ href }) => href)).toEqual(["/feed", "/friends"]);
});

it.each(["logbook", "progress", "community"] as const)(
  "gives %s tabs hrefs that are not prefixes of each other",
  (area) => {
    // WorkspaceShell marks a tab current with `pathname.startsWith(`${href}/`)`,
    // so a tab nested under a sibling would light both up and make the
    // screen-reader heading announce the wrong page. Sub-pages like
    // /projects/sent nest under their tab on purpose; two tabs must not.
    const hrefs = workspaceTabs(area, "alex").map(({ href }) => href);
    for (const href of hrefs) {
      const nested = hrefs.filter((other) => other !== href && other.startsWith(`${href}/`));
      expect(nested).toEqual([]);
    }
  },
);
