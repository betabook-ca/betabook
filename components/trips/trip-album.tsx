import Image from "next/image";

import { SectionHeading } from "@/components/ui/typography";
import { formatCount } from "@/lib/format";
import { albumPhotoSrc, type AlbumPhoto } from "@/lib/trip-album";
import { loadAlbumPhotos } from "@/lib/trip-album-loader";

/** Twice the tallest the strip is drawn, for a dense screen. */
const SHOWN_WIDTH = 960;
const LARGE_WIDTH = 2048;

const OUTSIDE = { target: "_blank", rel: "noopener noreferrer" } as const;

/** A trip's shared album, in the page. Google refuses to be framed, so the
 * photos are drawn here from their own addresses.
 *
 * Google does the resizing, which keeps the app's image budget for profile
 * photos, and no referrer is sent: the address of the page a reader is on can
 * carry the climber's profile link. */
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
          aria-label={formatCount(photos.length, "photo")}
          tabIndex={0}
          className="flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain rounded-panel focus-visible:status-focused"
        >
          {photos.map((photo, index) => {
            const name = `Photo ${index + 1} of ${photos.length}`;
            return (
              <li key={photo.url} className="shrink-0 snap-start list-none">
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
                    // The strip's height is fixed and a photo keeps its shape,
                    // so the width follows from the two numbers above.
                    className="h-56 w-auto max-w-[85vw] rounded-panel bg-surface-secondary object-cover sm:h-72"
                  />
                </a>
              </li>
            );
          })}
        </ul>
      )}
      {/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */}
    </section>
  );
}

/** Read as the page renders, behind a Suspense boundary: Google's answer
 * must not hold up the trip. */
export async function TripAlbum({ link }: { link: string }) {
  return <TripAlbumPhotos link={link} photos={await loadAlbumPhotos(link)} />;
}
