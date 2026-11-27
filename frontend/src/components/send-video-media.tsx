import type { ReactNode } from "react";

import { SendVideoButton } from "@/components/send-video";

/** A list row's `media` slot: the Watch button, or nothing at all when the
 * send has no video, so the row keeps no empty space for one.
 *
 * Server components call this, so it stays out of the "use client" module: on
 * the server a function exported from one is only a client reference, and
 * calling it throws. */
export function sendVideoMedia(
  videoUrls: readonly string[] | null | undefined,
  title: string,
  caption?: ReactNode,
): ReactNode {
  return videoUrls?.length ? (
    <SendVideoButton videoUrls={videoUrls} title={title} caption={caption} />
  ) : undefined;
}
