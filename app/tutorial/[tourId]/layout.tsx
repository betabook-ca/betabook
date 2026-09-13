import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { TourExperience } from "@/components/product-tours/tour-experience";
import { getDb } from "@/db/client";
import { getProductTourState } from "@/db/queries";
import { getAcknowledgedTourVersion } from "@/lib/product-tour";
import { findProductTour } from "@/lib/product-tour-navigation";
import { getMemberSession as getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Product tour", robots: { index: false } };

export default async function TutorialLayout({
  params,
  children,
}: {
  params: Promise<{ tourId: string }>;
  children: ReactNode;
}) {
  const session = await getSession();
  // Each page supplies its own callout and safe continuation before resolving the tour.
  if (!session) return children;
  const { tourId } = await params;
  const tour = findProductTour(tourId);
  if (!tour) notFound();
  const state = await getProductTourState(await getDb(), session.user.id);
  const savedVersion = getAcknowledgedTourVersion(tour.id, state?.progress);
  return (
    <TourExperience userId={session.user.id} tour={tour} savedVersion={savedVersion}>
      {children}
    </TourExperience>
  );
}
