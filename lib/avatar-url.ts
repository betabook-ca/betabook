import { getBaseUrl } from "@/lib/app-url";
import { getAvatarPhoto } from "@/lib/user-initials";

/** `getAvatarPhoto`'s URL, made absolute — what an OG card needs, since
 * satori fetches image sources itself rather than through the app's own
 * server (which a relative `/api/avatars/<key>` path assumes). A Google URL
 * is already absolute and passes through unchanged.
 *
 * Split from lib/user-initials.ts, which client components also import for
 * `getUserInitials`: `getBaseUrl` reaches `cloudflare:workers` through
 * lib/cloudflare-env.ts, and bundling that into the client build fails. */
export async function resolveAvatarUrl(image?: string | null): Promise<string | null> {
  const avatar = getAvatarPhoto(image);
  return avatar ? new URL(avatar.url, await getBaseUrl()).href : null;
}
