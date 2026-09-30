import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import type { ClimbVideo } from "@/db/queries";

import { ClimbVideoShelf } from "./climb-video-shelf";

const video: ClimbVideo = {
  videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  userId: "sam",
  userName: "Sam Rivera",
  userImage: null,
  ascentStyle: "flash",
  dateSent: "2026-09-01",
};

it("captions each video and plays it in a dialog that links the climber", async () => {
  const user = userEvent.setup();
  render(<ClimbVideoShelf videos={[video]} total={1} climbName="Quiet Arete" />);

  const shelf = screen.getByRole("region", { name: "Videos" });
  expect(within(shelf).getByRole("listitem")).toHaveTextContent("Sam Rivera");
  expect(within(shelf).getByRole("listitem")).toHaveTextContent("Flash · Sep 1, 2026");
  expect(screen.queryByText(/Newest/)).not.toBeInTheDocument();

  await user.click(
    within(shelf).getByRole("button", { name: "Play YouTube video: Sam Rivera on Quiet Arete" }),
  );

  const dialog = await screen.findByRole("dialog", { name: "Sam Rivera on Quiet Arete" });
  expect(within(dialog).getByRole("link", { name: "Sam Rivera" })).toHaveAttribute(
    "href",
    "/users/sam",
  );
  expect(within(dialog).getByTitle("YouTube video: Sam Rivera on Quiet Arete")).toBeInTheDocument();
});

it("names a signed-out viewer's climber without linking the locked profile", async () => {
  const user = userEvent.setup();
  render(
    <ClimbVideoShelf videos={[{ ...video, userId: null }]} total={1} climbName="Quiet Arete" />,
  );
  await user.click(screen.getByRole("button", { name: /^Play/ }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("Sam Rivera");
  expect(within(dialog).queryByRole("link", { name: "Sam Rivera" })).not.toBeInTheDocument();
});

it("says when it shows only the newest of a climb's videos", () => {
  render(<ClimbVideoShelf videos={[video]} total={12} climbName="Quiet Arete" />);
  expect(screen.getByText("Newest 1 of 12")).toBeVisible();
});

it("renders nothing for a climb without videos", () => {
  const { container } = render(<ClimbVideoShelf videos={[]} total={0} climbName="Quiet Arete" />);
  expect(container).toBeEmptyDOMElement();
});
