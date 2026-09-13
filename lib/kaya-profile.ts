/** Normalize profile input; callers always fetch a fixed KAYA endpoint. */
export function parseKayaUsername(input: unknown): string {
  const message = "Enter your KAYA username or a kaya-app.kayaclimb.com/user/ profile link.";
  if (typeof input !== "string") throw new Error(message);
  let name = input.trim();
  if (/^(?:https?:\/\/|kaya-app\.kayaclimb\.com\/)/i.test(name)) {
    try {
      const url = new URL(name.includes("://") ? name : `https://${name}`);
      const match = /^\/user\/([^/]+)\/?$/.exec(url.pathname);
      if (
        url.hostname !== "kaya-app.kayaclimb.com" ||
        url.username ||
        url.password ||
        url.port ||
        !match
      )
        throw new Error(message);
      name = decodeURIComponent(match[1]);
    } catch {
      throw new Error(message);
    }
  }
  name = name.replace(/^@/, "");
  if (!/^[a-zA-Z0-9_.-]{1,255}$/.test(name)) throw new Error(message);
  return name;
}
