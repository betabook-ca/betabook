import Image from "next/image";

import { TripAlbumVideo } from "@/components/trips/trip-album-video";
import { SectionHeading } from "@/components/ui/typography";
import { formatCount } from "@/lib/format";
import { albumPhotoSrc, type AlbumPhoto } from "@/lib/trip-album";
import { loadAlbumPhotos } from "@/lib/trip-album-loader";

/** Twice the strip's maximum height, for high-density screens. */
const SHOWN_WIDTH = 960;
const LARGE_WIDTH = 2048;

const OUTSIDE = { target: "_blank", rel: "noopener noreferrer" } as const;
/** The strip has a fixed height and each item keeps its aspect ratio, so the
 * width follows from the width and height attributes. */
const TILE = "h-56 w-auto max-w-[85vw] rounded-panel bg-surface-secondary object-cover sm:h-72";

/** "6 photos", "1 photo and 2 videos" */
function albumLabel(photos: AlbumPhoto[]): string {
  const videos = photos.filter((photo) => photo.video).length;
  const stills = formatCount(photos.length - videos, "photo");
  return videos === 0 ? stills : `${stills} and ${formatCount(videos, "video")}`;
}

/** A trip's shared album. Google blocks iframes, so photos are rendered from
 * their own URLs, and videos play from their own streams.
 *
 * Google resizes the photos, so they don't use the app's image budget. No
 * referrer is sent, because the page URL can contain the user's share token. */
export function TripAlbumPhotos({ link, photos }: { link: string; photos: AlbumPhoto[] }) {
  return (
    <section aria-label="Photos" className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <SectionHeading>Photos</SectionHeading>
        <a
          href={link}
          {...OUTSIDE}
          className="link inline text-sm underline focus-visible:status-focused"
        >
          Open in Google Photos
        </a>
      </div>
      {/* The scroll region needs a tab stop so keyboard users can scroll the photos. */}
      {/* oxlint-disable jsx-a11y/no-noninteractive-tabindex */}
      {photos.length > 0 && (
        <ul
          role="group"
          aria-label={albumLabel(photos)}
          tabIndex={0}
          className="flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain rounded-panel focus-visible:status-focused"
        >
          {photos.map((photo, index) => {
            const name = `${photo.video ? "Video" : "Photo"} ${index + 1} of ${photos.length}`;
            return (
              <li key={photo.url} className="shrink-0 snap-start list-none">
                {photo.video ? (
                  <TripAlbumVideo
                    photo={{ ...photo, video: photo.video }}
                    name={name}
                    link={link}
                    posterWidth={SHOWN_WIDTH}
                    className={TILE}
                  />
                ) : (
                  <a
                    href={albumPhotoSrc(photo, LARGE_WIDTH)}
                    {...OUTSIDE}
                    className="block rounded-panel focus-visible:status-focused"
                  >
                    <Image
                      src={albumPhotoSrc(photo, SHOWN_WIDTH)}
                      alt={name}
                      width={photo.width}
                      height={photo.height}
                      unoptimized
                      referrerPolicy="no-referrer"
                      loading={index === 0 ? "eager" : "lazy"}
                      className={TILE}
                    />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */}
    </section>
  );
}

/** Loads photos during render. Callers wrap this in Suspense so Google can't
 * block the page. */
export async function TripAlbum({ link }: { link: string }) {
  return <TripAlbumPhotos link={link} photos={await loadAlbumPhotos(link)} />;
}
