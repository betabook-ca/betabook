import { notFound, redirect } from "next/navigation";

import { AuthCallout } from "@/components/auth-callout";
import {
  findProductTour,
  productTourPath,
  productTourContinuationPath,
  parseProductTourNavigation,
  type ProductTourSearchParams,
} from "@/lib/product-tour-navigation";
import { getMemberSession as getSession } from "@/lib/session";

export default async function TutorialStart({
  params,
  searchParams,
}: {
  params: Promise<{ tourId: string }>;
  searchParams: Promise<ProductTourSearchParams>;
}) {
  const { tourId } = await params;
  const navigation = parseProductTourNavigation(await searchParams);
  if (!(await getSession()))
    return <AuthCallout next={productTourContinuationPath(tourId, navigation)} />;
  const tour = findProductTour(tourId);
  if (!tour) notFound();
  redirect(productTourPath(tour.id, navigation));
}
