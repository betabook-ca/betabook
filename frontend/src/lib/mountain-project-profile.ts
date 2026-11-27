import { ActionError } from "@/lib/action-result";

const MESSAGE = "Enter your Mountain Project user ID or profile link.";
const LINK_MESSAGE =
  "Use your Mountain Project profile link: mountainproject.com/user/123456789/your-name.";

function userId(value: string, message: string): string {
  if (!/^[1-9]\d{0,11}$/.test(value)) throw new ActionError(message);
  return value;
}

/** Normalize to the numeric ID. A link's slug is never trusted or forwarded. */
export function parseMountainProjectUserId(input: unknown): string {
  if (typeof input !== "string") throw new ActionError(MESSAGE);
  const value = input.trim();
  if (!/^(?:https?:\/\/|(?:www\.)?mountainproject\.com\/)/i.test(value))
    return userId(value.replace(/^#/, ""), MESSAGE);
  let url: URL;
  try {
    url = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    throw new ActionError(LINK_MESSAGE);
  }
  const match = /^\/user\/([^/]+)(?:\/|$)/.exec(url.pathname);
  if (
    !["mountainproject.com", "www.mountainproject.com"].includes(url.hostname.toLowerCase()) ||
    url.username ||
    url.password ||
    url.port ||
    !match
  )
    throw new ActionError(LINK_MESSAGE);
  let id: string;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    throw new ActionError(LINK_MESSAGE);
  }
  return userId(id, LINK_MESSAGE);
}
