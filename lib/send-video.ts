/** A send's video: a link to a clip the climber already posted on YouTube or
 * Instagram, played in place on Betabook. Nothing is uploaded here — the
 * video stays on its host, under the climber's own account and settings.
 *
 * `sends.video_url` holds one canonical link per send (see `sendVideoUrl`).
 * The link doubles as the "Open on YouTube" destination and the CSV export
 * value, and a single column needs no pairing rules. Rendering never trusts
 * it as-is: `readSendVideo` re-parses it and builds player URLs only from the
 * extracted id, so a value that somehow bypassed validation can't point an
 * embed anywhere else. Migration 0051's triggers back the shape up in SQL.
 *
 * Pure, so the send form checks a pasted link as it is typed with exactly
 * the rules the server applies. */

import { ActionError } from "@/lib/action-result";

export type SendVideo =
  | {
      provider: "youtube";
      id: string;
      /** A Short is portrait, and its player is framed that way. */
      format: "video" | "short";
      /** Seconds into the video, from a link that started partway through. */
      start: number | null;
    }
  | { provider: "instagram"; shortcode: string; format: "reel" | "post" };

export type SendVideoParse = { ok: true; video: SendVideo } | { ok: false; error: string };

export const SEND_VIDEO_INVALID_MESSAGE =
  "Paste a link to a YouTube video or an Instagram reel or post.";
export const SEND_VIDEO_SHARE_LINK_MESSAGE =
  "Instagram share links can't be played here. Open the reel and copy the link from your browser's address bar.";

/** Generous for a pasted link with tracking parameters; stored links are far shorter. */
const MAX_SEND_VIDEO_INPUT_LENGTH = 2000;

const YOUTUBE_ID = /^[\w-]{11}$/;
const INSTAGRAM_SHORTCODE = /^[\w-]{5,64}$/;
/** A start time can't usefully be longer than YouTube's longest videos. */
const MAX_START_SECONDS = 24 * 60 * 60;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);
const INSTAGRAM_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com",
  "instagr.am",
]);
const INSTAGRAM_KINDS: Record<string, "reel" | "post"> = {
  p: "post",
  reel: "reel",
  reels: "reel",
  tv: "reel",
};

const INVALID: SendVideoParse = { ok: false, error: SEND_VIDEO_INVALID_MESSAGE };

/** `90`, `90s`, `1m30s` or `1h2m3s`, as YouTube writes `t=` and `start=`. */
function parseStart(value: string | null): number | null {
  if (!value) return null;
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(value);
  if (!match) return null;
  const [, hours = "0", minutes = "0", seconds = "0"] = match;
  const total = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  return total > 0 && total <= MAX_START_SECONDS ? total : null;
}

function parseYouTube(url: URL, host: string): SendVideoParse {
  const segments = url.pathname.split("/").filter(Boolean);
  let id: string | undefined;
  let format: "video" | "short" = "video";
  if (host === "youtu.be") {
    id = segments[0];
  } else if (segments[0] === "watch") {
    id = url.searchParams.get("v") ?? undefined;
  } else if (segments[0] === "shorts") {
    id = segments[1];
    format = "short";
  } else if (segments[0] === "live" || segments[0] === "embed" || segments[0] === "v") {
    id = segments[1];
  }
  if (!id || !YOUTUBE_ID.test(id)) return INVALID;
  const start =
    format === "short"
      ? null
      : parseStart(url.searchParams.get("t") ?? url.searchParams.get("start"));
  return { ok: true, video: { provider: "youtube", id, format, start } };
}

function parseInstagram(url: URL): SendVideoParse {
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] === "share") return { ok: false, error: SEND_VIDEO_SHARE_LINK_MESSAGE };
  // Newer share links put the author first: /<username>/reel/<shortcode>/.
  const kindIndex = segments[0] && segments[0] in INSTAGRAM_KINDS ? 0 : 1;
  const format = INSTAGRAM_KINDS[segments[kindIndex] ?? ""];
  const shortcode = segments[kindIndex + 1];
  if (!format || !shortcode || !INSTAGRAM_SHORTCODE.test(shortcode)) return INVALID;
  return { ok: true, video: { provider: "instagram", shortcode, format } };
}

/** Reads a link as a climber pastes it: any supported address form, with or
 * without a scheme, tracking parameters and all. */
export function parseSendVideoLink(input: string): SendVideoParse {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_SEND_VIDEO_INPUT_LENGTH) return INVALID;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return INVALID;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return INVALID;
  if (url.username || url.password || url.port) return INVALID;
  const host = url.hostname.toLowerCase();
  if (host === "youtu.be" || YOUTUBE_HOSTS.has(host)) return parseYouTube(url, host);
  if (INSTAGRAM_HOSTS.has(host)) return parseInstagram(url);
  return INVALID;
}

/** The one stored form of each video, which is also its public address. */
export function sendVideoUrl(video: SendVideo): string {
  if (video.provider === "instagram") {
    return `https://www.instagram.com/${video.format === "reel" ? "reel" : "p"}/${video.shortcode}/`;
  }
  if (video.format === "short") return `https://www.youtube.com/shorts/${video.id}`;
  return `https://www.youtube.com/watch?v=${video.id}${video.start ? `&t=${video.start}s` : ""}`;
}

/** A stored link as a video, or null unless it is exactly a canonical link. */
export function readSendVideo(stored: string | null | undefined): SendVideo | null {
  if (!stored) return null;
  const parsed = parseSendVideoLink(stored);
  return parsed.ok && sendVideoUrl(parsed.video) === stored ? parsed.video : null;
}

/** The player's address. YouTube plays from its no-cookie domain, which
 * sets no tracking cookies until the viewer presses play in the player. */
export function sendVideoEmbedUrl(video: SendVideo, { autoplay }: { autoplay: boolean }): string {
  if (video.provider === "instagram") {
    return `https://www.instagram.com/${video.format === "reel" ? "reel" : "p"}/${video.shortcode}/embed/`;
  }
  const params = new URLSearchParams({ rel: "0", playsinline: "1" });
  if (autoplay) params.set("autoplay", "1");
  if (video.start) params.set("start", String(video.start));
  return `https://www.youtube-nocookie.com/embed/${video.id}?${params.toString()}`;
}

/** YouTube serves a poster for every video at a fixed address. Instagram has
 * none that doesn't expire, so its placeholder is drawn instead. */
export function sendVideoThumbnailUrl(video: SendVideo): string | null {
  return video.provider === "youtube" ? `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg` : null;
}

export function sendVideoProviderName(video: SendVideo): string {
  return video.provider === "youtube" ? "YouTube" : "Instagram";
}

export function sendVideoLabel(video: SendVideo): string {
  if (video.provider === "youtube") {
    return video.format === "short" ? "YouTube Short" : "YouTube video";
  }
  return video.format === "reel" ? "Instagram reel" : "Instagram post";
}

/** Server-side reading of the form's `video` field: `undefined` when the form
 * doesn't carry the field (the stored video stays as it is), `null` to clear
 * it, otherwise the canonical link. */
export function validateSendVideoInput(
  value: FormDataEntryValue | null | undefined,
): string | null | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") throw new ActionError(SEND_VIDEO_INVALID_MESSAGE);
  if (!value.trim()) return null;
  const parsed = parseSendVideoLink(value);
  if (!parsed.ok) throw new ActionError(parsed.error);
  return sendVideoUrl(parsed.video);
}
