import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import type { PublicClimbSend } from "@/lib/public-catalog";

import { ClimbSendListRow } from "./climb-send-list-row";

const send: PublicClimbSend = {
  userName: "Sam Rivera",
  dateSent: "2026-08-14",
  ascentStyle: "flash",
  rating: 4,
  suggestedGrade: 5,
  gradeFeel: "solid",
  comment: "Heel hook at the lip.",
};
const anonymous = { ...send, userName: null, dateSent: "2026-08", comment: null };

it("links a member row to the climber with their exact date and commentary", () => {
  render(<ClimbSendListRow type="boulder" send={{ ...send, userId: "sam" }} />);
  expect(screen.getByRole("link", { name: "Sam Rivera" })).toHaveAttribute("href", "/users/sam");
  expect(screen.getByText("Aug 14, 2026")).toBeInTheDocument();
  expect(screen.getByText("Heel hook at the lip.")).toBeInTheDocument();
});

it.each([
  { list: "member", userId: null },
  { list: "public", userId: undefined },
])("renders an anonymous $list row as an unlinked climber with only its month", ({ userId }) => {
  render(<ClimbSendListRow type="boulder" send={{ ...anonymous, userId }} />);
  expect(screen.getByText("Betabook climber")).toBeInTheDocument();
  expect(screen.getByText("Aug 2026")).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

it("names an Everyone climber on a public row without linking the locked profile", () => {
  render(<ClimbSendListRow type="boulder" send={send} />);
  expect(screen.getByText("Sam Rivera")).toBeInTheDocument();
  expect(screen.getByText("Heel hook at the lip.")).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
