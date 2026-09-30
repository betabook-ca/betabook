"use client";

import { Button, Modal, useOverlayState, type UseOverlayStateReturn } from "@heroui/react";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight, ExternalLink, Play } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  readSendVideos,
  sendVideoEmbedUrl,
  sendVideoLabel,
  sendVideoProviderName,
  sendVideoThumbnailUrl,
  sendVideoUrl,
  type SendVideo,
} from "@/lib/send-video";

/** How each kind of video is framed. A poster shows only the clip's shape.
 * An Instagram player also carries Instagram's own header and footer. */
function shape(video: SendVideo): "landscape" | "short" | "reel" | "post" {
  if (video.provider === "instagram") return video.format;
  return video.format === "short" ? "short" : "landscape";
}

const POSTER_CLASS = {
  landscape: "aspect-video w-full",
  short: "aspect-[9/16] w-[min(100%,15rem)]",
  reel: "aspect-[9/16] w-[min(100%,15rem)]",
  post: "aspect-[4/5] w-[min(100%,15rem)]",
} as const;

/** Instagram's player needs 326px of width to lay out. Its content is as tall
 * as the media plus 208px of header and footer, and the media is at most 4:5
 * (a reel's cover is cropped to that), so at this width it needs 618px. The
 * sizes are in px because Instagram's are. */
const INSTAGRAM_FRAME_CLASS = "h-[624px] w-[min(100%,328px)]";

const FRAME_CLASS = {
  landscape: "aspect-video w-full",
  short: "aspect-[9/16] w-[min(100%,20rem)]",
  reel: INSTAGRAM_FRAME_CLASS,
  post: INSTAGRAM_FRAME_CLASS,
} as const;

/** The player itself. A YouTube player is only rendered after the viewer asks
 * for it: until then nothing is requested from YouTube but a poster image,
 * which is fetched without a referrer. An Instagram player is also rendered
 * with the page where a send shows its one video in place (see
 * `SendVideoPosters`). */
function SendVideoFrame({
  video,
  title,
  focusOnMount = false,
}: {
  video: SendVideo;
  title: string;
  /** Hand focus to the player that just replaced the button a keyboard user
   * pressed, rather than dropping it on the page. */
  focusOnMount?: boolean;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);
  return (
    <iframe
      ref={ref}
      src={sendVideoEmbedUrl(video, { autoplay: true })}
      title={`${sendVideoLabel(video)}: ${title}`}
      // A feed page can hold several Instagram players. Each loads when it
      // is scrolled near. A player opened by a press is already in view.
      loading="lazy"
      // YouTube refuses to play without a referring origin; the page's own
      // policy already sends the origin alone, never the path.
      referrerPolicy="strict-origin-when-cross-origin"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      // Both players need their own scripts and storage, and open "Watch on
      // YouTube"/"View on Instagram" in a new tab; nothing else — above all,
      // navigating this page — is theirs to do. Scripts plus same-origin lets
      // a frame lift its own sandbox only when it shares this page's origin;
      // `sendVideoEmbedUrl` only ever points at YouTube's or Instagram's.
      // oxlint-disable-next-line react/iframe-missing-sandbox
      sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
      className={clsx(
        "block rounded-panel border-0 bg-surface-tertiary",
        FRAME_CLASS[shape(video)],
      )}
    />
  );
}

/** What a video looks like before it plays: YouTube's poster, or for
 * Instagram (which has no lasting poster URL) a plain panel naming it. */
export function SendVideoThumbnail({
  video,
  size = "md",
}: {
  video: SendVideo;
  /** `sm` for a thumbnail too small to carry a label, like a form's preview. */
  size?: "sm" | "md";
}) {
  const [failed, setFailed] = useState(false);
  const thumbnail = failed ? null : sendVideoThumbnailUrl(video);
  return (
    <span className="relative flex size-full items-center justify-center overflow-hidden bg-surface-tertiary">
      {thumbnail ? (
        <Image
          src={thumbnail}
          alt=""
          width={480}
          height={360}
          // Served by YouTube at this size; there is nothing to optimize.
          unoptimized
          referrerPolicy="no-referrer"
          // Unreachable from here (offline, blocked): fall back to the label.
          onError={() => setFailed(true)}
          // YouTube pads every poster to 4:3 with black bars; covering the
          // clip's own frame crops them away.
          className="size-full object-cover"
        />
      ) : (
        size === "md" && (
          <span className="absolute inset-x-0 bottom-3 px-3 text-center text-xs text-muted">
            {sendVideoLabel(video)}
          </span>
        )
      )}
      <span className="absolute inset-0 flex items-center justify-center">
        <span
          className={clsx(
            "flex items-center justify-center rounded-full bg-background/85 text-foreground shadow-md transition-transform group-hover:scale-105",
            size === "md" ? "size-12" : "size-7",
          )}
        >
          <Play
            aria-hidden
            className={clsx("translate-x-px fill-current", size === "md" ? "size-5" : "size-3.5")}
          />
        </span>
      </span>
    </span>
  );
}

/** "Open on YouTube": the way out when the owner has turned off embedding,
 * the post is private, or the viewer would rather watch there — and, in the
 * send form, the way to check which clip a link points at. */
export function WatchElsewhereLink({ video }: { video: SendVideo }) {
  return (
    <a
      href={sendVideoUrl(video)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-muted underline-offset-4 hover:text-foreground hover:underline"
    >
      Open on {sendVideoProviderName(video)}
      <ExternalLink aria-hidden className="size-3" />
    </a>
  );
}

/** One video in a dialog that can page through several. */
export type SendVideoItem = {
  video: SendVideo;
  /** Whose send of what: the dialog's heading and the player's name. */
  title: string;
  /** Who sent it and how, under the player. */
  caption?: ReactNode;
};

/** A poster button for one video. */
function PosterButton({
  video,
  title,
  onPress,
  className,
}: {
  video: SendVideo;
  title: string;
  onPress: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={`Play ${sendVideoLabel(video)}: ${title}`}
      className={clsx(
        "group block shrink-0 cursor-pointer overflow-hidden rounded-panel border border-separator focus-visible:status-focused",
        className,
      )}
    >
      <SendVideoThumbnail video={video} />
    </button>
  );
}

/** A send's videos shown in place, for surfaces where they are the point of
 * the row — a friend's send in the feed. One YouTube video is a poster that
 * turns into the player when pressed. One Instagram video is its player from
 * the start: Instagram lets no other site show a reel's cover image, and an
 * empty panel in its place looks like a failed load. Instagram's player does
 * not start playing until pressed. Several are a row of smaller posters that
 * open the dialog, where the viewer can page through them; playing them in
 * place would leave several live players side by side, each too narrow for
 * Instagram's. Renders nothing when no link can be read, so callers can pass
 * whatever the row carries. */
export function SendVideoPosters({
  videoUrls,
  title,
  className,
}: {
  videoUrls: readonly string[] | null | undefined;
  title: string;
  className?: string;
}) {
  // Which link was pressed, not just "playing": a poster handed a different
  // video must show that video's poster, never start playing it unasked.
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [openAt, setOpenAt] = useState(0);
  const state = useOverlayState();
  const videos = readSendVideos(videoUrls);
  const [first] = videos;
  if (!first) return null;

  if (videos.length === 1) {
    const url = sendVideoUrl(first);
    const pressed = playingUrl === url;
    return (
      <div className={clsx("flex w-full max-w-md flex-col items-start gap-1.5", className)}>
        {pressed || first.provider === "instagram" ? (
          // Only a player that replaced a pressed button takes focus. One
          // that loads with the page leaves focus where it was.
          <SendVideoFrame video={first} title={title} focusOnMount={pressed} />
        ) : (
          <PosterButton
            video={first}
            title={title}
            onPress={() => setPlayingUrl(url)}
            className={POSTER_CLASS[shape(first)]}
          />
        )}
        <WatchElsewhereLink video={first} />
      </div>
    );
  }

  const items = videos.map((video, index) => ({
    video,
    title: `${title} (${index + 1} of ${videos.length})`,
  }));
  return (
    <>
      <ul role="list" className={clsx("flex gap-2 overflow-x-auto pb-1", className)}>
        {items.map((item, index) => (
          <li key={sendVideoUrl(item.video)} className="shrink-0">
            <PosterButton
              video={item.video}
              title={item.title}
              onPress={() => {
                setOpenAt(index);
                state.open();
              }}
              // One shape for the row, like a photo grid: wide enough for a
              // label, and never a sliver for a portrait clip.
              className="aspect-[4/5] w-36"
            />
          </li>
        ))}
      </ul>
      <SendVideoDialog items={items} startAt={openAt} state={state} />
    </>
  );
}

function SendVideoDialogContent({
  items,
  startAt,
}: {
  items: readonly SendVideoItem[];
  startAt: number;
}) {
  // Mounted fresh each time the dialog opens, so it starts where it was asked to.
  const [index, setIndex] = useState(startAt);
  const { video, title, caption } = items[index] ?? items[0];
  const landscape = shape(video) === "landscape";
  return (
    <Modal.Dialog
      aria-label={title}
      className={clsx("w-full", landscape ? "max-w-3xl" : "max-w-[min(28rem,calc(100vw-2rem))]")}
    >
      <Modal.Header>
        <Modal.Heading className="break-words">{title}</Modal.Heading>
        <Modal.CloseTrigger />
      </Modal.Header>
      <Modal.Body className="flex flex-col items-center gap-3">
        {/* Keyed by position, so paging swaps the player rather than
         * pointing the playing one somewhere else. */}
        <SendVideoFrame key={index} video={video} title={title} />
        <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1">
          {caption && <div className="min-w-0 text-sm text-muted">{caption}</div>}
          <WatchElsewhereLink video={video} />
        </div>
        {items.length > 1 && (
          <div className="flex w-full items-center justify-between gap-3 border-t border-separator pt-3">
            <Button
              size="sm"
              variant="ghost"
              isDisabled={index === 0}
              onPress={() => setIndex(index - 1)}
            >
              <ChevronLeft aria-hidden className="size-4" />
              Previous
            </Button>
            <span role="status" className="text-sm text-muted tabular-nums">
              {index + 1} of {items.length}
            </span>
            <Button
              size="sm"
              variant="ghost"
              isDisabled={index === items.length - 1}
              onPress={() => setIndex(index + 1)}
            >
              Next
              <ChevronRight aria-hidden className="size-4" />
            </Button>
          </div>
        )}
      </Modal.Body>
    </Modal.Dialog>
  );
}

/** Videos in a centered dialog, one at a time, paging through several — a
 * readout, not a task, so it stays centered at every width rather than
 * rising as a sheet. The dialog's body unmounts once its exit finishes,
 * taking the player with it, so a video never keeps playing somewhere the
 * viewer can't see it. */
export function SendVideoDialog({
  items,
  startAt = 0,
  state,
}: {
  items: readonly SendVideoItem[];
  startAt?: number;
  state: UseOverlayStateReturn;
}) {
  if (items.length === 0) return null;
  return (
    <Modal.Backdrop isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <Modal.Container placement="center" scroll="inside">
        <SendVideoDialogContent items={items} startAt={startAt} />
      </Modal.Container>
    </Modal.Backdrop>
  );
}

/** A compact "Watch" control for list rows, opening a send's videos in the
 * dialog. Keeps dense lists — a climb's sends, a logbook, a journal — the
 * height they were, and never stacks live players in a scrolling list.
 * Renders nothing when no link can be read. */
export function SendVideoButton({
  videoUrls,
  title,
  caption,
}: {
  videoUrls: readonly string[] | null | undefined;
  title: string;
  caption?: ReactNode;
}) {
  const state = useOverlayState();
  const videos = readSendVideos(videoUrls);
  const [first] = videos;
  if (!first) return null;
  const label = videos.length === 1 ? "video" : `${videos.length} videos`;
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onPress={state.open}
        aria-label={`Watch ${label}: ${title}`}
        className="gap-1.5"
      >
        <Play aria-hidden className="size-3.5 fill-current" />
        Watch {label}
      </Button>
      <SendVideoDialog items={videos.map((video) => ({ video, title, caption }))} state={state} />
    </>
  );
}

/** A list row's `media` slot: the Watch button, or nothing at all when the
 * send has no video, so the row keeps no empty space for one. */
export function sendVideoMedia(
  videoUrls: readonly string[] | null | undefined,
  title: string,
  caption?: ReactNode,
): ReactNode {
  return videoUrls?.length ? (
    <SendVideoButton videoUrls={videoUrls} title={title} caption={caption} />
  ) : undefined;
}
