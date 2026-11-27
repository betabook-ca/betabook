import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, Link, useLocation, useNavigate } from "react-router";
import { expect, it } from "vitest";

import { TripDayOrderControl, TripDayOrderList, TripDayOrderProvider } from "./trip-day-order";

const TRIP = "/users/owner-1/trips/7";

function Days() {
  return (
    <TripDayOrderProvider>
      <TripDayOrderControl />
      <TripDayOrderList
        days={["Day 1", "Day 2", "Day 3"].map((day) => (
          <section key={day} aria-label={day} />
        ))}
      />
    </TripDayOrderProvider>
  );
}

function TripNavigation() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="address">{pathname + search}</output>
      <Link to={TRIP + "/analytics"}>Analytics</Link>
      <button
        type="button"
        onClick={() => {
          void navigate(-1);
        }}
      >
        Back
      </button>
      <Routes>
        <Route path="/before" element={<p>Before</p>} />
        <Route path={TRIP} element={<Days />} />
        <Route path={TRIP + "/analytics"} element={<p>Charts</p>} />
      </Routes>
    </>
  );
}

const order = () => screen.getAllByRole("region").map((day) => day.getAttribute("aria-label"));

it("reverses the mounted days and replaces only their order parameter", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/before", TRIP + "?share=abc"]}>
      <TripNavigation />
    </MemoryRouter>,
  );
  const earliest = screen.getByRole("region", { name: "Day 1" });
  await user.click(screen.getByRole("button", { name: "Sort ascending" }));
  expect(order()).toEqual(["Day 3", "Day 2", "Day 1"]);
  expect(screen.getByRole("region", { name: "Day 1" })).toBe(earliest);
  expect(screen.getByTestId("address")).toHaveTextContent(TRIP + "?share=abc&order=newest");
  await user.click(screen.getByRole("button", { name: "Sort descending" }));
  expect(order()).toEqual(["Day 1", "Day 2", "Day 3"]);
  expect(screen.getByTestId("address").textContent).toBe(TRIP + "?share=abc");
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByTestId("address").textContent).toBe("/before");
});

it("honors a linked order and restores the locally chosen order on browser Back", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[TRIP + "?order=newest"]}>
      <TripNavigation />
    </MemoryRouter>,
  );
  expect(order()).toEqual(["Day 3", "Day 2", "Day 1"]);
  await user.click(screen.getByRole("button", { name: "Sort descending" }));
  await user.click(screen.getByRole("link", { name: "Analytics" }));
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(order()).toEqual(["Day 1", "Day 2", "Day 3"]);
  expect(screen.getByTestId("address").textContent).toBe(TRIP);
});
