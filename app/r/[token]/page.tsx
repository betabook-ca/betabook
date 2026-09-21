import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { RecapStory } from "@/components/recap-story";
import { getDb } from "@/db/client";
import { getRecapShare } from "@/db/queries";
import { recapCoverImagePath } from "@/lib/recap-share";
import { SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };
const loadShare = cache(async (token: string) => getRecapShare(await getDb(), token));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const share = await loadShare(token);
  if (!share) notFound();

  const title = `${share.snapshot.owner.name}'s climbing recap`;
  const description = `A climbing recap shared on ${SITE_NAME}.`;
  const image = recapCoverImagePath(token);
  return {
    title: { absolute: title },
    description,
    robots: { index: false },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      images: [{ url: image, width: 1080, height: 1350, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function RecapPage({ params }: Props) {
  const { token } = await params;
  const share = await loadShare(token);
  if (!share) notFound();

  return <RecapStory snapshot={share.snapshot} profilePath={`/users/${share.ownerId}`} />;
}
