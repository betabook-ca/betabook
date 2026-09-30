import { render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { expect, it, vi } from "vitest";

import type { AlbumPhoto } from "@/lib/trip-album";

import { TripAlbumPhotos } from "./trip-album";

vi.mock("next/image", () => ({
  default: ({ unoptimized, ...props }: ComponentProps<"img"> & { unoptimized?: boolean }) => (
    // oxlint-disable-next-line nextjs/no-img-element, jsx-a11y/alt-text
    <img {...props} data-unoptimized={String(Boolean(unoptimized))} />
  ),
}));

const ALBUM = "https://photos.app.goo.gl/Example1Album2Link3";
const WIDE: AlbumPhoto = {
  url: "https://lh3.googleusercontent.com/pw/AP1GczNUNuva0hpWf0Fu63ZGGHNvXoCW",
  width: 4000,
  height: 3000,
};
const SMALL: AlbumPhoto = {
  url: "https://lh3.googleusercontent.com/pw/AP1GczM0_Q0fYRA7N-5Z8QgjbTb9v97v",
  width: 640,
  height: 960,
};
const CLIP: AlbumPhoto = {
  url: "https://lh3.googleusercontent.com/pw/AP1GczOQ6k4Yw3sLh0nX9M5aSB1dvJk1",
  width: 2160,
  height: 3840,
  video: { duration: 14 },
};

it("renders each photo at the displayed size", () => {
  render(<TripAlbumPhotos link={ALBUM} photos={[WIDE, SMALL]} />);

  const photos = within(screen.getByRole("region", { name: "Photos" })).getAllByRole("img");
  expect(photos.map((photo) => photo.getAttribute("src"))).toEqual([
    `${WIDE.url}=w960`,
    `${SMALL.url}=w640`,
  ]);
  expect(photos.map((photo) => photo.getAttribute("alt"))).toEqual([
    "Photo 1 of 2",
    "Photo 2 of 2",
  ]);
  // Width and height are set up front, so the layout doesn't shift while photos
  // load.
  expect(photos[0]).toHaveAttribute("width", "4000");
  expect(photos[0]).toHaveAttribute("height", "3000");
});

it("skips image optimization and sends no referrer", () => {
  render(<TripAlbumPhotos link={ALBUM} photos={[WIDE, SMALL]} />);

  for (const photo of screen.getAllByRole("img")) {
    expect(photo).toHaveAttribute("data-unoptimized", "true");
    expect(photo).toHaveAttribute("referrerpolicy", "no-referrer");
  }
  // The first photo loads eagerly. The rest load lazily.
  expect(screen.getAllByRole("img")[1]).toHaveAttribute("loading", "lazy");
});

it("opens the full-size photo and the album in a new tab", () => {
  render(<TripAlbumPhotos link={ALBUM} photos={[WIDE]} />);

  const large = screen.getByRole("link", { name: "Photo 1 of 1" });
  expect(large).toHaveAttribute("href", `${WIDE.url}=w2048`);
  const album = screen.getByRole("link", { name: "Open in Google Photos" });
  expect(album).toHaveAttribute("href", ALBUM);
  for (const link of [large, album]) {
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
});

it("plays a video in place, in a frame that sends no referrer", () => {
  render(<TripAlbumPhotos link={ALBUM} photos={[WIDE, CLIP]} />);

  const frame = screen.getByTitle("Video 2 of 2, 14 seconds");
  expect(frame.tagName).toBe("IFRAME");
  expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
  expect(frame).toHaveAttribute(
    "sandbox",
    "allow-scripts allow-popups allow-popups-to-escape-sandbox",
  );
  expect(frame).toHaveStyle({ aspectRatio: "2160 / 3840" });
  const player = frame.getAttribute("srcdoc") ?? "";
  // Google refuses the stream when a referrer is sent.
  expect(player).toContain('<meta name="referrer" content="no-referrer">');
  // At rest: the poster and the length, no browser controls. A click anywhere
  // plays and turns the controls on.
  expect(player).toContain(
    `<video src="${CLIP.url}=m22" poster="${CLIP.url}=w960" preload="none" playsinline></video>`,
  );
  expect(player).toContain('<button type="button" aria-label="Play, 14 seconds">');
  expect(player).toContain('<span aria-hidden="true">0:14</span>');
  expect(player).toContain("body:not(.on) video::-webkit-media-controls{display:none}");
  expect(player).toContain('d.addEventListener("pointerup",play);d.addEventListener("click",play)');
  expect(player).toContain("v.controls=true;v.play()");
  // If the stream errors, the poster links to the album instead.
  expect(player).toContain(`<a hidden href="${ALBUM}" target="_blank" rel="noopener noreferrer"`);
  expect(player).toContain('v.addEventListener("error"');
  expect(screen.getByRole("group", { name: "1 photo and 1 video" })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Photo 1 of 2" })).toBeInTheDocument();
});

it("escapes the album link inside the player", () => {
  render(
    <TripAlbumPhotos
      link={'https://photos.app.goo.gl/Example"><script>alert(1)</script>'}
      photos={[CLIP]}
    />,
  );

  const player = screen.getByTitle("Video 1 of 1, 14 seconds").getAttribute("srcdoc") ?? "";
  expect(player).not.toContain("<script>alert");
  expect(player).toContain(
    'href="https://photos.app.goo.gl/Example&quot;>&lt;script>alert(1)&lt;/script>"',
  );
});

it("can be scrolled with the keyboard", () => {
  render(<TripAlbumPhotos link={ALBUM} photos={[WIDE, SMALL]} />);

  expect(screen.getByRole("group", { name: "2 photos" })).toHaveAttribute("tabindex", "0");
});

it("still links to an album that couldn't be read", () => {
  render(<TripAlbumPhotos link={ALBUM} photos={[]} />);

  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open in Google Photos" })).toHaveAttribute(
    "href",
    ALBUM,
  );
});
