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
  ["/users/alex/projects", "progress"],
  ["/users/alex/sent-projects", "progress"],
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
  expect(workspaceTabs("logbook", "alex").map(({ label }) => label)).toEqual(["Journal", "Sends"]);
  expect(workspaceTabs("progress", "alex").map(({ label }) => label)).toEqual([
    "Goals",
    "Projects",
    "Sent",
    "Analytics",
  ]);
  expect(workspaceTabs("community", "alex").map(({ href }) => href)).toEqual(["/feed", "/friends"]);
});

it.each(["logbook", "progress", "community"] as const)(
  "gives %s tabs hrefs that are not prefixes of each other",
  (area) => {
    // WorkspaceShell marks a tab current with `pathname.startsWith(`${href}/`)`,
    // so a tab nested under a sibling would light both up and make the
    // screen-reader heading announce the wrong page. Sent Projects is a sibling
    // of Projects for exactly this reason.
    const hrefs = workspaceTabs(area, "alex").map(({ href }) => href);
    for (const href of hrefs) {
      const nested = hrefs.filter((other) => other !== href && other.startsWith(`${href}/`));
      expect(nested).toEqual([]);
    }
  },
);
