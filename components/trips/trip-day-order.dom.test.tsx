import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { TripDayOrderControl, TripDayOrderList, TripDayOrderProvider } from "./trip-day-order";

const router = vi.hoisted(() => ({
  replace: vi.fn<(href: string) => void>(),
  push: vi.fn<(href: string) => void>(),
  refresh: vi.fn<() => void>(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/users/owner-1/trips/7?share=abc");
});

function days(initialOrder: "oldest" | "newest") {
  return (
    <TripDayOrderProvider initialOrder={initialOrder}>
      <TripDayOrderControl />
      <TripDayOrderList
        days={["Day 1", "Day 2", "Day 3"].map((day) => (
          <section key={day} aria-label={day} />
        ))}
      />
    </TripDayOrderProvider>
  );
}

const order = () => screen.getAllByRole("region").map((day) => day.getAttribute("aria-label"));

it("reverses the days in place and records the order in the URL without navigating", async () => {
  const user = userEvent.setup();
  render(days("oldest"));
  expect(order()).toEqual(["Day 1", "Day 2", "Day 3"]);

  await user.click(screen.getByRole("button", { name: "Sort ascending" }));
  expect(order()).toEqual(["Day 3", "Day 2", "Day 1"]);
  expect(screen.getByRole("button", { name: "Sort descending" })).toBeVisible();
  // The share token stays; nothing is fetched or navigated.
  expect(window.location.pathname + window.location.search).toBe(
    "/users/owner-1/trips/7?share=abc&order=newest",
  );
  expect(router.replace).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
  expect(router.refresh).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Sort descending" }));
  expect(order()).toEqual(["Day 1", "Day 2", "Day 3"]);
  // Oldest first is the default, so it leaves the URL.
  expect(window.location.search).toBe("?share=abc");
});

it("starts in the order the page was opened with", () => {
  render(days("newest"));
  expect(order()).toEqual(["Day 3", "Day 2", "Day 1"]);
  expect(screen.getByRole("button", { name: "Sort descending" })).toBeVisible();
});
