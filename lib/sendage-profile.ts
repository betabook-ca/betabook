/** Accept only a username or a public Sendage profile URL, never an arbitrary fetch URL. */
export function parseSendageUsername(input: unknown): string {
  if (typeof input !== "string") throw new Error("Enter your Sendage username or profile link.");
  let name = input.trim();
  if (/^(?:https?:\/\/|(?:www\.)?sendage\.com\/)/i.test(name)) {
    const url = new URL(name.includes("://") ? name : `https://${name}`);
    const match = /^\/user\/([^/]+)\/?$/.exec(url.pathname);
    if (
      !["sendage.com", "www.sendage.com"].includes(url.hostname.toLowerCase()) ||
      url.username ||
      url.password ||
      url.port ||
      !match
    )
      throw new Error("Use your public Sendage profile link: sendage.com/user/your-username.");
    name = decodeURIComponent(match[1]);
  }
  name = name.replace(/^@/, "");
  if (!/^[a-zA-Z0-9_.-]{1,255}$/.test(name)) {
    throw new Error("Enter your Sendage username or a sendage.com/user/ profile link.");
  }
  return name;
}
