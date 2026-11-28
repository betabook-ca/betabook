import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import {
  NavigationPendingProvider,
  NavigationPendingRegion,
  useReportNavigationPending,
} from "./navigation-pending";

function Reporter({ pending }: { pending: boolean }) {
  useReportNavigationPending(pending);
  return null;
}

function Page({ pending }: { pending: boolean }) {
  return (
    <NavigationPendingProvider>
      <Reporter pending={pending} />
      <NavigationPendingRegion>
        <p>Results</p>
      </NavigationPendingRegion>
    </NavigationPendingProvider>
  );
}

it("announces an in-flight refresh and falls silent once it lands", () => {
  const { rerender } = render(<Page pending />);
  expect(screen.getByRole("status")).toHaveTextContent("Updating results…");
  rerender(<Page pending={false} />);
  expect(screen.getByRole("status")).toHaveTextContent("");
});
