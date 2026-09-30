import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import { SendVideoButton, SendVideoPoster } from "./send-video";

const YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12s";
const REEL = "https://www.instagram.com/reel/C9Xq3uGxJ5R/";

it("loads nothing from YouTube but the poster until the viewer presses play", async () => {
  const user = userEvent.setup();
  const { container } = render(<SendVideoPoster videoUrl={YOUTUBE} title="Alex on Quiet Arete" />);

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

it("names an Instagram video on its placeholder, since it has no poster", async () => {
  const user = userEvent.setup();
  const { container } = render(<SendVideoPoster videoUrl={REEL} title="Sam on Moss Ladder" />);

  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText("Instagram reel")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Play Instagram reel: Sam on Moss Ladder" }));
  expect(screen.getByTitle("Instagram reel: Sam on Moss Ladder")).toHaveAttribute(
    "src",
    "https://www.instagram.com/reel/C9Xq3uGxJ5R/embed/",
  );
});

it("falls back to the label when the YouTube poster can't be loaded", () => {
  const { container } = render(<SendVideoPoster videoUrl={YOUTUBE} title="Alex on Quiet Arete" />);
  // user-event has no way to fail an image request; this is the browser's own error event.
  fireEvent.error(container.querySelector("img")!);
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText("YouTube video")).toBeVisible();
});

it.each([null, undefined, "", "https://youtu.be/dQw4w9WgXcQ", "https://evil.example/x"])(
  "renders nothing for the stored value %j",
  (videoUrl) => {
    const { container } = render(
      <>
        <SendVideoPoster videoUrl={videoUrl} title="Alex" />
        <SendVideoButton videoUrl={videoUrl} title="Alex" />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  },
);

it("opens a row's video in a dialog and unloads the player when it closes", async () => {
  const user = userEvent.setup();
  render(<SendVideoButton videoUrl={REEL} title="Sam on Moss Ladder" caption="Flash · Sep 1" />);
  expect(document.querySelector("iframe")).toBeNull();

  await user.click(
    screen.getByRole("button", { name: "Watch Instagram reel: Sam on Moss Ladder" }),
  );

  const dialog = await screen.findByRole("dialog", { name: "Sam on Moss Ladder" });
  expect(dialog).toHaveTextContent("Flash · Sep 1");
  expect(screen.getByTitle("Instagram reel: Sam on Moss Ladder")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open on Instagram" })).toHaveAttribute("href", REEL);

  await user.click(screen.getByRole("button", { name: "Close video" }));
  await waitFor(() => expect(document.querySelector("iframe")).toBeNull());
});
