"use client";

import { Button, Modal, useOverlayState } from "@heroui/react";
import { clsx } from "clsx";
import { ExternalLink, Play, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  readSendVideo,
  sendVideoEmbedUrl,
  sendVideoLabel,
  sendVideoProviderName,
  sendVideoThumbnailUrl,
  sendVideoUrl,
  type SendVideo,
} from "@/lib/send-video";

/** How each kind of video is framed. A poster shows only the clip's shape;
 * a playing Instagram embed also carries Instagram's own header and footer,
 * so its frame is taller than the media inside it and has to be at least
 * as wide as Instagram's 326px minimum to lay out. */
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

const FRAME_CLASS = {
  landscape: "aspect-video w-full",
  short: "aspect-[9/16] w-[min(100%,20rem)]",
  reel: "aspect-[9/20] w-[min(100%,25rem)]",
  post: "aspect-[4/7] w-[min(100%,25rem)]",
} as const;

/** The player itself. Only ever rendered after the viewer asks for it: until
 * then nothing is requested from YouTube or Instagram but a YouTube poster
 * image, which is fetched without a referrer. */
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
          // A Short's poster is a letterboxed portrait frame; covering the
          // portrait poster crops the bars away.
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
 * the post is private, or the viewer would rather watch there. */
function WatchElsewhereLink({ video }: { video: SendVideo }) {
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

/** A send's video shown in place, as a poster that turns into the player
 * when pressed. For surfaces where the video is the point of the row — a
 * friend's send in the feed. Renders nothing for a missing or unreadable
 * link, so callers can pass whatever the row carries. */
export function SendVideoPoster({
  videoUrl,
  title,
  className,
}: {
  videoUrl: string | null | undefined;
  /** Whose send of what, for the play button's and player's names. */
  title: string;
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const video = readSendVideo(videoUrl);
  if (!video) return null;
  return (
    <div className={clsx("flex w-full max-w-md flex-col items-start gap-1.5", className)}>
      {playing ? (
        <SendVideoFrame video={video} title={title} focusOnMount />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Play ${sendVideoLabel(video)}: ${title}`}
          className={clsx(
            "group block cursor-pointer overflow-hidden rounded-panel border border-separator focus-visible:status-focused",
            POSTER_CLASS[shape(video)],
          )}
        >
          <SendVideoThumbnail video={video} />
        </button>
      )}
      <WatchElsewhereLink video={video} />
    </div>
  );
}

/** The player in a centered dialog. Closing it unloads the player, so a
 * video never keeps playing somewhere the viewer can't see it. */
export function SendVideoDialog({
  video,
  title,
  caption,
  state,
}: {
  video: SendVideo;
  title: string;
  /** Who sent it and how, under the player. */
  caption?: ReactNode;
  state: ReturnType<typeof useOverlayState>;
}) {
  const landscape = shape(video) === "landscape";
  return (
    <Modal.Backdrop isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <Modal.Container placement="center" scroll="inside">
        <Modal.Dialog
          aria-label={title}
          className={clsx(
            "w-full",
            landscape ? "max-w-3xl" : "max-w-[min(28rem,calc(100vw-2rem))]",
          )}
        >
          <Modal.Header className="flex-row items-start justify-between gap-3">
            <Modal.Heading className="min-w-0 break-words">{title}</Modal.Heading>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label="Close video"
              onPress={state.close}
              className="-mt-1 -mr-1 shrink-0"
            >
              <X aria-hidden className="size-4" />
            </Button>
          </Modal.Header>
          <Modal.Body className="flex flex-col items-center gap-3">
            {state.isOpen && <SendVideoFrame video={video} title={title} />}
            <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1">
              {caption && <div className="min-w-0 text-sm text-muted">{caption}</div>}
              <WatchElsewhereLink video={video} />
            </div>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

/** A compact "Watch" control for list rows, opening the video in a dialog.
 * Keeps dense lists — a climb's sends, a logbook, a journal — the height
 * they were, and never stacks live players in a scrolling list. Renders
 * nothing for a missing or unreadable link. */
export function SendVideoButton({
  videoUrl,
  title,
  caption,
}: {
  videoUrl: string | null | undefined;
  title: string;
  caption?: ReactNode;
}) {
  const state = useOverlayState();
  const video = readSendVideo(videoUrl);
  if (!video) return null;
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onPress={state.open}
        aria-label={`Watch ${sendVideoLabel(video)}: ${title}`}
        className="gap-1.5"
      >
        <Play aria-hidden className="size-3.5 fill-current" />
        Watch {sendVideoLabel(video)}
      </Button>
      <SendVideoDialog video={video} title={title} caption={caption} state={state} />
    </>
  );
}
