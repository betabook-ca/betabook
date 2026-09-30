import { getDb } from "@/db/client";
import { getShareLinkOwner } from "@/db/queries";
import { parseProfileShareShortToken, profileSharePath } from "@/lib/profile-share";

const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

/** Compatibility entry point for earlier image-share captions. Resolve the
 * current owner on every visit so reset/private links stay inaccessible. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token: compactToken } = await params;
  const token = parseProfileShareShortToken(compactToken);
  if (!token) return new Response(null, { status: 404, headers });

  const owner = await getShareLinkOwner(await getDb(), token);
  if (!owner) return new Response(null, { status: 404, headers });

  return new Response(null, {
    status: 307,
    headers: { ...headers, Location: profileSharePath(owner.id, token) },
  });
}
