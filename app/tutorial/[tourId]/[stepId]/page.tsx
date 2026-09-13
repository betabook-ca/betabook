import { notFound } from "next/navigation";

import { AuthCallout } from "@/components/auth-callout";
import {
  findProductTour,
  parseProductTourNavigation,
  productTourContinuationPath,
  type ProductTourSearchParams,
  PRODUCT_TOUR_STEPS,
} from "@/lib/product-tour-navigation";
import { getMemberSession as getSession } from "@/lib/session";

export default async function TutorialPage({
  params,
  searchParams,
}: {
  params: Promise<{ tourId: string; stepId: string }>;
  searchParams: Promise<ProductTourSearchParams>;
}) {
  const { tourId, stepId } = await params;
  if (!(await getSession())) {
    return (
      <AuthCallout
        next={productTourContinuationPath(tourId, {
          ...parseProductTourNavigation(await searchParams),
          stepId,
        })}
      />
    );
  }
  const tour = findProductTour(tourId);
  if (!tour || !PRODUCT_TOUR_STEPS[tour.id].some((step) => step.id === stepId)) notFound();
  return null;
}
