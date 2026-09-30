import { ImageResponse } from "next/og";

import { getDb } from "@/db/client";
import { getRecapShare } from "@/db/queries";
import { ogFonts } from "@/lib/og-fonts";
import { socialCardElement } from "@/lib/og-recap";
import { RECAP_IMAGE_SIZE } from "@/lib/recap-share";

const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

/** The same frozen hook image the owner shares to an app. A separate recap
 * token is required, and each fetch rechecks current profile consent. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const share = await getRecapShare(await getDb(), token);
  if (!share) return new Response(null, { status: 404, headers });

  const image = new ImageResponse(
    socialCardElement({ ...share.snapshot.owner, avatarUrl: null }, share.snapshot.stats),
    {
      ...RECAP_IMAGE_SIZE,
      fonts: ogFonts(),
    },
  );
  image.headers.set("Cache-Control", "no-store");
  image.headers.set("X-Robots-Tag", "noindex");
  return image;
}
