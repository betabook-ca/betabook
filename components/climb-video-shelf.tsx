"use client";

import { useOverlayState } from "@heroui/react";
import { useId } from "react";

import { ascentSummary } from "@/components/ascent-style";
import { SendVideoDialog, SendVideoThumbnail } from "@/components/send-video";
import { AppLink } from "@/components/ui/app-link";
import { SectionHeading } from "@/components/ui/typography";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { ClimbVideo } from "@/db/queries";
import { readSendVideo, sendVideoLabel } from "@/lib/send-video";

function ClimbVideoTile({ row, climbName }: { row: ClimbVideo; climbName: string }) {
  const state = useOverlayState();
  const video = readSendVideo(row.videoUrl);
  if (!video) return null;
  const title = `${row.userName} on ${climbName}`;
  return (
    <>
      <button
        type="button"
        onClick={state.open}
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
        <span className="text-xs text-muted">{ascentSummary(row.ascentStyle, row.dateSent)}</span>
      </button>
      <SendVideoDialog
        video={video}
        title={title}
        state={state}
        caption={
          <>
            {row.userId ? (
              <AppLink href={`/users/${row.userId}`} className="font-medium">
                {row.userName}
              </AppLink>
            ) : (
              <span className="font-medium text-foreground">{row.userName}</span>
            )}{" "}
            · {ascentSummary(row.ascentStyle, row.dateSent)}
          </>
        }
      />
    </>
  );
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
  if (videos.length === 0) return null;
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
        {videos.map((row, index) => (
          // Rows carry no send id (see getClimbVideos), and two climbers can
          // link the same video, so position is the stable key.
          // oxlint-disable-next-line react/no-array-index-key
          <li key={index} className="w-60 shrink-0 snap-start">
            <ClimbVideoTile row={row} climbName={climbName} />
          </li>
        ))}
      </ul>
    </section>
  );
}
