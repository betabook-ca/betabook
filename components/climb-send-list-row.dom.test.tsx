import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import type { PublicClimbSend } from "@/lib/public-catalog";

import { ClimbSendListRow } from "./climb-send-list-row";

const send: PublicClimbSend = {
  userName: "Sam Rivera",
  userImage: null,
  dateSent: "2026-08-14",
  ascentStyle: "flash",
  rating: 4,
  suggestedGrade: 5,
  gradeFeel: "solid",
  comment: "Heel hook at the lip.",
  videos: null,
};
const anonymous = {
  ...send,
  userName: null,
  userImage: null,
  dateSent: "2026-08",
  comment: null,
};
const photos = (container: HTMLElement) =>
  [...container.querySelectorAll("img")].map((image) => new URL(image.src).pathname);

it("links a member row to the climber with their exact date and commentary", () => {
  render(
    <ClimbSendListRow type="boulder" climbName="Test Highball" send={{ ...send, userId: "sam" }} />,
  );
  expect(screen.getByRole("link", { name: "Sam Rivera" })).toHaveAttribute("href", "/users/sam");
  expect(screen.getByText("Aug 14, 2026")).toBeInTheDocument();
  expect(screen.getByText("Heel hook at the lip.")).toBeInTheDocument();
});

it.each([
  { list: "member", userId: null },
  { list: "public", userId: undefined },
])("renders an anonymous $list row as an unlinked climber with only its month", ({ userId }) => {
  render(
    <ClimbSendListRow type="boulder" climbName="Test Highball" send={{ ...anonymous, userId }} />,
  );
  expect(screen.getByText("Betabook climber")).toBeInTheDocument();
  expect(screen.getByText("Aug 2026")).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

it("leads a named row with the climber's photo, or their initials", () => {
  const photo = "/api/avatars/sam/abababababababababababababababab.webp";
  const { container, rerender } = render(
    <ClimbSendListRow
      type="boulder"
      climbName="Test Highball"
      send={{ ...send, userId: "sam", userImage: photo }}
    />,
  );
  expect(photos(container)).toEqual([photo]);

  rerender(
    <ClimbSendListRow type="boulder" climbName="Test Highball" send={{ ...send, userId: "sam" }} />,
  );
  expect(photos(container)).toEqual([]);
  expect(screen.getByText("SR")).toBeVisible();
});

it("leads an anonymous row with a neutral mark that reveals no identity", () => {
  const { container } = render(
    <ClimbSendListRow
      type="boulder"
      climbName="Test Highball"
      send={{ ...anonymous, userId: null }}
    />,
  );

  // The slot stays filled so a mixed list keeps one left edge, but nothing
  // in it can be traced back to the climber the null name withholds.
  expect(container.querySelectorAll(".lucide-user")).toHaveLength(1);
  expect(photos(container)).toEqual([]);
  expect(screen.queryByText("SR")).not.toBeInTheDocument();
  expect(screen.queryByText("BC")).not.toBeInTheDocument();
});

it("names an Everyone climber on a public row without linking the locked profile", () => {
  render(<ClimbSendListRow type="boulder" climbName="Test Highball" send={send} />);
  expect(screen.getByText("Sam Rivera")).toBeInTheDocument();
  expect(screen.getByText("Heel hook at the lip.")).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

it("offers a row's video behind a Watch button named for the climber and climb", () => {
  render(
    <ClimbSendListRow
      type="boulder"
      climbName="Test Highball"
      send={{ ...send, userId: "sam", videos: ["https://www.youtube.com/shorts/dQw4w9WgXcQ"] }}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Watch YouTube Short: Sam Rivera on Test Highball" }),
  ).toBeVisible();
});

it("has no video control on a row without a video", () => {
  render(<ClimbSendListRow type="boulder" climbName="Test Highball" send={send} />);
  expect(screen.queryByRole("button", { name: /^Watch/ })).not.toBeInTheDocument();
});
