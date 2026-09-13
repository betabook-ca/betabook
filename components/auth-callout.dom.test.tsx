import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { AuthCallout } from "./auth-callout";

vi.mock("next/link", () => ({
  default: ({
    prefetch: _prefetch,
    ...props
  }: React.ComponentProps<"a"> & { prefetch?: boolean }) => <a {...props}>{props.children}</a>,
}));
it("offers both authentication paths with the complete continuation", () => {
  render(<AuthCallout next="/areas/1/test-crag?name=Test&subarea=2" />);
  expect(screen.getByRole("region", { name: "Member content" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/sign-in?next=%2Fareas%2F1%2Ftest-crag%3Fname%3DTest%26subarea%3D2",
  );
  expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute(
    "href",
    "/sign-up?next=%2Fareas%2F1%2Ftest-crag%3Fname%3DTest%26subarea%3D2",
  );
  expect(screen.getByRole("link", { name: "How Betabook works" })).toHaveAttribute(
    "href",
    "/climbing-logbook",
  );
});
