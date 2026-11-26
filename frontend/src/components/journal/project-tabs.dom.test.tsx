import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { ProjectTabs } from "./project-tabs";

function tabs() {
  return screen.getByRole("navigation", { name: "Project lists" }).querySelectorAll("a");
}

it("links both views of the pinned list", () => {
  render(<ProjectTabs view="open" userId="alex" />);

  expect([...tabs()].map((tab) => [tab.textContent, tab.getAttribute("href")])).toEqual([
    ["Open", "/users/alex/projects"],
    ["Sent", "/users/alex/projects/sent"],
  ]);
});

it.each([
  ["open", "Open"],
  ["sent", "Sent"],
] as const)("marks %s as the current view", (view, label) => {
  render(<ProjectTabs view={view} userId="alex" />);

  // Exactly one, or a screen reader announces two current pages.
  const current = [...tabs()].filter((tab) => tab.getAttribute("aria-current") === "page");
  expect(current).toHaveLength(1);
  expect(current[0]).toHaveTextContent(label);
});
