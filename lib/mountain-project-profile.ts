const MESSAGE = "Enter your Mountain Project user ID or profile link.";
const LINK_MESSAGE =
  "Use your Mountain Project profile link: mountainproject.com/user/123456789/your-name.";

function userId(value: string, message: string): string {
  if (!/^[1-9]\d{0,11}$/.test(value)) throw new Error(message);
  return value;
}

/** Normalize to the numeric ID. A link's slug is never trusted or forwarded. */
export function parseMountainProjectUserId(input: unknown): string {
  if (typeof input !== "string") throw new Error(MESSAGE);
  const value = input.trim();
  if (!/^(?:https?:\/\/|(?:www\.)?mountainproject\.com\/)/i.test(value))
    return userId(value.replace(/^#/, ""), MESSAGE);
  let url: URL;
  try {
    url = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    throw new Error(LINK_MESSAGE);
  }
  const match = /^\/user\/([^/]+)(?:\/|$)/.exec(url.pathname);
  if (
    !["mountainproject.com", "www.mountainproject.com"].includes(url.hostname.toLowerCase()) ||
    url.username ||
    url.password ||
    url.port ||
    !match
  )
    throw new Error(LINK_MESSAGE);
  return userId(decodeURIComponent(match[1]), LINK_MESSAGE);
}
