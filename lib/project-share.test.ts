import { expect, it } from "vitest";

import { projectSharePath } from "./project-share";

const TOKEN = "4f9c2a7e1b8d6035c9e4a1f7b2d80e36";

it("builds a path carrying nothing but the token", () => {
  expect(projectSharePath(TOKEN)).toBe(`/projects/${TOKEN}`);
});
