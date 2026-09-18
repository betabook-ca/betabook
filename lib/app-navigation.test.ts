import { expect, it } from "vitest";

import {
  menuAccount,
  primaryAreaForPath,
  primaryDestinations,
  workspaceTabs,
} from "./app-navigation";

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

it("applies the Show photo setting to the navigation avatar", () => {
  const photo = "https://lh3.googleusercontent.com/a/alex";
  const session = { id: "alex", name: "Alex Rivera", image: photo, role: null };

  expect(menuAccount({ ...session, showProfilePhoto: true })).toEqual({
    id: "alex",
    name: "Alex Rivera",
    image: photo,
    isAdmin: false,
  });
  expect(menuAccount({ ...session, showProfilePhoto: false }).image).toBeNull();
});

// Better Auth types additional fields as optional, and a session established
// before this field existed carries neither it nor a reason to hide the photo.
it("shows the photo for a session that carries no setting, and reads the admin role", () => {
  const photo = "https://lh3.googleusercontent.com/a/alex";
  expect(menuAccount({ id: "alex", name: "Alex Rivera", image: photo })).toEqual({
    id: "alex",
    name: "Alex Rivera",
    image: photo,
    isAdmin: false,
  });
  expect(menuAccount({ id: "alex", name: "Alex Rivera", role: "admin" })).toEqual({
    id: "alex",
    name: "Alex Rivera",
    image: null,
    isAdmin: true,
  });
});
