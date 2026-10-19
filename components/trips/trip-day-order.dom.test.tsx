import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { TripDayOrderControl } from "./trip-day-order";

const router = vi.hoisted(() => ({
  replace: vi.fn<(href: string, options: { scroll: boolean }) => void>(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const HREFS = {
  oldest: "/users/owner-1/trips/7?share=abc",
  newest: "/users/owner-1/trips/7?share=abc&order=newest",
};

beforeEach(() => router.replace.mockClear());

it("uses the sort arrow: ascending is oldest first, and a press switches order without scrolling", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<TripDayOrderControl order={{ value: "oldest", hrefs: HREFS }} />);

  await user.click(screen.getByRole("button", { name: "Sort ascending" }));
  expect(router.replace).toHaveBeenLastCalledWith(HREFS.newest, { scroll: false });

  rerender(<TripDayOrderControl order={{ value: "newest", hrefs: HREFS }} />);
  await user.click(screen.getByRole("button", { name: "Sort descending" }));
  expect(router.replace).toHaveBeenLastCalledWith(HREFS.oldest, { scroll: false });
  expect(router.replace).toHaveBeenCalledTimes(2);
});
