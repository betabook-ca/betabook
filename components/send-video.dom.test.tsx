import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import { SendVideoButton, SendVideoPosters } from "./send-video";

const YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12s";
const SHORT = "https://www.youtube.com/shorts/dQw4w9WgXcQ";
const REEL = "https://www.instagram.com/reel/C9Xq3uGxJ5R/";

it("loads nothing from YouTube but the poster until the viewer presses play", async () => {
  const user = userEvent.setup();
  const { container } = render(
    <SendVideoPosters videoUrls={[YOUTUBE]} title="Alex on Quiet Arete" />,
  );

  expect(container.querySelector("iframe")).toBeNull();
  const poster = container.querySelector("img");
  expect(poster).toHaveAttribute("src", "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  expect(poster).toHaveAttribute("referrerpolicy", "no-referrer");
  expect(screen.getByRole("link", { name: "Open on YouTube" })).toMatchObject({
    href: YOUTUBE,
    target: "_blank",
    rel: "noopener noreferrer",
  });

  await user.click(screen.getByRole("button", { name: "Play YouTube video: Alex on Quiet Arete" }));

  const player = screen.getByTitle("YouTube video: Alex on Quiet Arete");
  const src = new URL(player.getAttribute("src")!);
  expect(src.origin + src.pathname).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  expect(src.searchParams.get("autoplay")).toBe("1");
  expect(src.searchParams.get("start")).toBe("12");
  // Keyboard users land on the player that replaced the button they pressed.
  expect(player).toHaveFocus();
  expect(screen.queryByRole("button", { name: /^Play/ })).not.toBeInTheDocument();
});

it("asks again before playing a different video in the same poster", async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    <SendVideoPosters videoUrls={[YOUTUBE]} title="Alex on Quiet Arete" />,
  );
  await user.click(screen.getByRole("button", { name: /^Play YouTube video/ }));
  expect(document.querySelector("iframe")).not.toBeNull();

  rerender(<SendVideoPosters videoUrls={[REEL]} title="Alex on Quiet Arete" />);

  expect(document.querySelector("iframe")).toBeNull();
  expect(screen.getByRole("button", { name: /^Play Instagram reel/ })).toBeVisible();
});

it("names an Instagram video on its placeholder, since it has no poster", async () => {
  const user = userEvent.setup();
  const { container } = render(<SendVideoPosters videoUrls={[REEL]} title="Sam on Moss Ladder" />);

  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText("Instagram reel")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Play Instagram reel: Sam on Moss Ladder" }));
  expect(screen.getByTitle("Instagram reel: Sam on Moss Ladder")).toHaveAttribute(
    "src",
    "https://www.instagram.com/reel/C9Xq3uGxJ5R/embed/",
  );
});

it("falls back to the label when the YouTube poster can't be loaded", () => {
  const { container } = render(
    <SendVideoPosters videoUrls={[YOUTUBE]} title="Alex on Quiet Arete" />,
  );
  // user-event has no way to fail an image request; this is the browser's own error event.
  fireEvent.error(container.querySelector("img")!);
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText("YouTube video")).toBeVisible();
});

it("shows several videos as a row of posters that open the dialog where it was pressed", async () => {
  const user = userEvent.setup();
  render(<SendVideoPosters videoUrls={[YOUTUBE, SHORT, REEL]} title="Alex on Quiet Arete" />);

  // No player in the row itself: several side by side would each be too narrow.
  expect(document.querySelector("iframe")).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "Play YouTube Short: Alex on Quiet Arete (2 of 3)" }),
  );

  const dialog = await screen.findByRole("dialog", { name: "Alex on Quiet Arete (2 of 3)" });
  expect(within(dialog).getByTitle("YouTube Short: Alex on Quiet Arete (2 of 3)")).toBeVisible();
  expect(within(dialog).getByRole("status")).toHaveTextContent("2 of 3");
});

it.each([null, undefined, [], ["https://youtu.be/dQw4w9WgXcQ", "https://evil.example/x"]])(
  "renders nothing for the stored value %j",
  (videoUrls) => {
    const { container } = render(
      <>
        <SendVideoPosters videoUrls={videoUrls} title="Alex" />
        <SendVideoButton videoUrls={videoUrls} title="Alex" />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  },
);

it("opens a row's video in a dialog and unloads the player when it closes", async () => {
  const user = userEvent.setup();
  render(<SendVideoButton videoUrls={[REEL]} title="Sam on Moss Ladder" caption="Flash · Sep 1" />);
  expect(document.querySelector("iframe")).toBeNull();

  await user.click(screen.getByRole("button", { name: "Watch video: Sam on Moss Ladder" }));

  const dialog = await screen.findByRole("dialog", { name: "Sam on Moss Ladder" });
  expect(dialog).toHaveTextContent("Flash · Sep 1");
  expect(screen.getByTitle("Instagram reel: Sam on Moss Ladder")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open on Instagram" })).toHaveAttribute("href", REEL);
  // A single video needs no paging.
  expect(within(dialog).queryByRole("button", { name: /Next/ })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(document.querySelector("iframe")).toBeNull());
});

it("counts a send's videos on its button and pages through them one player at a time", async () => {
  const user = userEvent.setup();
  render(<SendVideoButton videoUrls={[YOUTUBE, REEL, SHORT]} title="Sam on Moss Ladder" />);

  await user.click(screen.getByRole("button", { name: "Watch 3 videos: Sam on Moss Ladder" }));
  const dialog = await screen.findByRole("dialog", { name: "Sam on Moss Ladder" });
  const previous = within(dialog).getByRole("button", { name: "Previous" });
  const next = within(dialog).getByRole("button", { name: "Next" });
  expect(within(dialog).getByRole("status")).toHaveTextContent("1 of 3");
  expect(previous).toBeDisabled();
  expect(dialog.querySelectorAll("iframe")).toHaveLength(1);
  expect(within(dialog).getByTitle("YouTube video: Sam on Moss Ladder")).toBeInTheDocument();

  await user.click(next);
  expect(within(dialog).getByRole("status")).toHaveTextContent("2 of 3");
  expect(dialog.querySelectorAll("iframe")).toHaveLength(1);
  expect(within(dialog).getByTitle("Instagram reel: Sam on Moss Ladder")).toBeInTheDocument();
  expect(within(dialog).getByRole("link", { name: "Open on Instagram" })).toHaveAttribute(
    "href",
    REEL,
  );

  await user.click(next);
  expect(within(dialog).getByRole("status")).toHaveTextContent("3 of 3");
  expect(next).toBeDisabled();
  await user.click(previous);
  expect(within(dialog).getByTitle("Instagram reel: Sam on Moss Ladder")).toBeInTheDocument();
});
