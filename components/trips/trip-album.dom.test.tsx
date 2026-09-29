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

it("shows each photo in the page, asked for at the size it is shown", () => {
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
  // The shape is known before the photo arrives, so nothing moves as it loads.
  expect(photos[0]).toHaveAttribute("width", "4000");
  expect(photos[0]).toHaveAttribute("height", "3000");
});

it("leaves the resizing to Google and tells it nothing about the reader's page", () => {
  render(<TripAlbumPhotos link={ALBUM} photos={[WIDE, SMALL]} />);

  for (const photo of screen.getAllByRole("img")) {
    expect(photo).toHaveAttribute("data-unoptimized", "true");
    expect(photo).toHaveAttribute("referrerpolicy", "no-referrer");
  }
  // The first is on screen as the page opens; the rest wait until scrolled to.
  expect(screen.getAllByRole("img")[1]).toHaveAttribute("loading", "lazy");
});

it("opens a photo large, and the album itself, away from the app", () => {
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

it("can be scrolled from the keyboard", () => {
  render(<TripAlbumPhotos link={ALBUM} photos={[WIDE, SMALL]} />);

  expect(screen.getByRole("group", { name: "2 photos" })).toHaveAttribute("tabindex", "0");
});

it("still leads to an album it could not read", () => {
  render(<TripAlbumPhotos link={ALBUM} photos={[]} />);

  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open in Google Photos" })).toHaveAttribute(
    "href",
    ALBUM,
  );
});
