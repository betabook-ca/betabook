import { ActionError } from "@/lib/action-result";

export const SHARING_AUDIENCES = [
  { value: "private", label: "Only me" },
  { value: "friends", label: "Friends" },
  // Legacy stored value for Members: signed-in users only. Signed-out readers need "everyone".
  { value: "public", label: "Members" },
] as const;

/** Everyone reaches signed-out visitors, so only send commentary offers it. */
export const SEND_COMMENT_AUDIENCES = [
  ...SHARING_AUDIENCES,
  { value: "everyone", label: "Everyone" },
] as const;

/** A project share link is opt-in per climb, so "Only me" would be a link
 * nobody can open — the way not to share is not to make one. Everyone belongs
 * here for the same reason it belongs on send commentary: a link meant for a
 * coach or a group chat has to survive being opened by someone without an
 * account. Ordered least to most reach, unlike the settings lists, because
 * this one is a choice made per link rather than a standing default. */
export const PROJECT_SHARE_AUDIENCES = [
  { value: "friends", label: "Friends" },
  { value: "public", label: "Members" },
  { value: "everyone", label: "Everyone" },
] as const;

export type SharingAudience = (typeof SHARING_AUDIENCES)[number]["value"];
export type SendCommentAudience = (typeof SEND_COMMENT_AUDIENCES)[number]["value"];
export type ProjectShareAudience = (typeof PROJECT_SHARE_AUDIENCES)[number]["value"];

export function parseSharingAudience(value: unknown): SharingAudience {
  return parseAudience(SHARING_AUDIENCES, value);
}

export function parseSendCommentAudience(value: unknown): SendCommentAudience {
  return parseAudience(SEND_COMMENT_AUDIENCES, value);
}

/** Its own parser rather than `parseSendCommentAudience`, which would accept
 * `private` — the CHECK on `project_share_links.audience` rejects that, and a
 * raw constraint failure reaches the client as "Something went wrong" instead
 * of a sentence explaining the input. */
export function parseProjectShareAudience(value: unknown): ProjectShareAudience {
  return parseAudience(PROJECT_SHARE_AUDIENCES, value);
}

function parseAudience<T extends string>(options: readonly { value: T }[], value: unknown): T {
  const audience = options.find((option) => option.value === value);
  if (!audience) throw new ActionError("Invalid sharing audience");
  return audience.value;
}
