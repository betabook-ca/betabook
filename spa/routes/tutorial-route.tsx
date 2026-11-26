import { useEffect, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router";

import { AuthCallout } from "@/components/auth-callout";
import { TourExperience } from "@/components/product-tours/tour-experience";
import { SkeletonListRows } from "@/components/ui/skeleton";
import {
  getAcknowledgedTourVersion,
  type ProductTourDefinition,
  type ProductTourState,
} from "@/lib/product-tour";
import {
  findProductTour,
  PRODUCT_TOUR_STEPS,
  parseProductTourNavigation,
  productTourContinuationPath,
  productTourPath,
} from "@/lib/product-tour-navigation";
import { fetchJson } from "@/spa/lib/fetch-json";

import NotFoundPage from "./not-found-route";

function MemberTutorial({ tour, viewerId }: { tour: ProductTourDefinition; viewerId: string }) {
  const [progress, setProgress] = useState<ProductTourState["progress"]>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const state = await fetchJson<ProductTourState>("/api/pages/tutorial", {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setProgress(state.progress);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);
  if (failed)
    return (
      <p role="alert">
        Couldn't load tutorial progress.{" "}
        <button
          type="button"
          className="link"
          onClick={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </button>
      </p>
    );
  if (!progress) return <SkeletonListRows rows={4} />;
  return (
    <TourExperience
      userId={viewerId}
      tour={tour}
      savedVersion={getAcknowledgedTourVersion(tour.id, progress)}
    >
      {null}
    </TourExperience>
  );
}

export default function TutorialRoute({ viewerId }: { viewerId: string | null }) {
  const { tourId = "", stepId } = useParams();
  const [query] = useSearchParams();
  const navigation = parseProductTourNavigation({
    from: query.getAll("from"),
    mode: query.getAll("mode"),
  });
  if (!viewerId)
    return <AuthCallout next={productTourContinuationPath(tourId, { ...navigation, stepId })} />;
  const tour = findProductTour(tourId);
  if (!tour || (stepId && !PRODUCT_TOUR_STEPS[tour.id].some((step) => step.id === stepId)))
    return <NotFoundPage />;
  if (!stepId) return <Navigate replace to={productTourPath(tour.id, navigation)} />;
  return <MemberTutorial key={viewerId + ":" + tour.id} viewerId={viewerId} tour={tour} />;
}
