"use client";

import { useOverlayState } from "@heroui/react";
import { useId, useState } from "react";

import { ascentSummary } from "@/components/ascent-style";
import { SendVideoDialog, SendVideoThumbnail, type SendVideoItem } from "@/components/send-video";
import { AppLink } from "@/components/ui/app-link";
import { SectionHeading } from "@/components/ui/typography";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { ClimbVideo } from "@/db/queries";
import { readSendVideo, sendVideoLabel } from "@/lib/send-video";

/** A shelf entry with its video read, or null when the link can't be. */
function shelfItem(
  row: ClimbVideo,
  climbName: string,
): (SendVideoItem & { row: ClimbVideo }) | null {
  const video = readSendVideo(row.videoUrl);
  if (!video) return null;
  const summary = ascentSummary(row.ascentStyle, row.dateSent);
  return {
    row,
    video,
    title: `${row.userName} on ${climbName}`,
    caption: (
      <>
        {row.userId ? (
          <AppLink href={`/users/${row.userId}`} className="font-medium">
            {row.userName}
          </AppLink>
        ) : (
          <span className="font-medium text-foreground">{row.userName}</span>
        )}{" "}
        · {summary}
      </>
    ),
  };
}

/** The videos climbers have linked to their sends of one climb, gathered
 * above its send list: on a climb page the videos are the beta, and a send
 * list pages ten at a time with the newest first, so a video from last
 * season would otherwise be buried. One swipeable row, so a climb with a
 * single video doesn't hand the page a wall of posters. */
export function ClimbVideoShelf({
  videos,
  total,
  climbName,
}: {
  videos: ClimbVideo[];
  total: number;
  climbName: string;
}) {
  const headingId = useId();
  const state = useOverlayState();
  const [openAt, setOpenAt] = useState(0);
  const items = videos.flatMap((row) => shelfItem(row, climbName) ?? []);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <SectionHeading id={headingId}>Videos</SectionHeading>
        {total > videos.length && (
          <span className="text-sm text-muted">
            Newest {videos.length} of {total}
          </span>
        )}
      </div>
      <ul role="list" className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
        {items.map(({ row, video, title }, index) => (
          // Rows carry no send id (see getClimbVideos), and two climbers can
          // link the same video, so position is the stable key.
          // oxlint-disable-next-line react/no-array-index-key
          <li key={index} className="w-60 shrink-0 snap-start">
            <button
              type="button"
              onClick={() => {
                setOpenAt(index);
                state.open();
              }}
              aria-label={`Play ${sendVideoLabel(video)}: ${title}`}
              className="group flex w-full cursor-pointer flex-col gap-2 rounded-panel text-left focus-visible:status-focused"
            >
              <span className="block aspect-video w-full overflow-hidden rounded-panel border border-separator">
                <SendVideoThumbnail video={video} />
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <UserAvatar name={row.userName} image={row.userImage} size="xs" />
                <span className="truncate text-sm font-medium text-foreground">{row.userName}</span>
              </span>
              <span className="text-xs text-muted">
                {ascentSummary(row.ascentStyle, row.dateSent)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {/* One dialog for the row: it opens on the tile pressed and pages
       * through every video here. */}
      <SendVideoDialog items={items} startAt={openAt} state={state} />
    </section>
  );
}
