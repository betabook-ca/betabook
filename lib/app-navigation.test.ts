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
    "Open Projects",
    "Analytics",
  ]);
  expect(workspaceTabs("community", "alex").map(({ href }) => href)).toEqual(["/feed", "/friends"]);
});
