import { PRODUCT_TOURS, type ProductTourId } from "@/lib/product-tour";
import steps from "@/lib/product-tour-steps.json";

export type ProductTourStepDefinition = {
  id: string;
  section: string;
  title: string;
  description: string;
  target: string;
  introducedInVersion: number;
  updatedInVersion?: number;
};

/** Stable targets belong to the view components, never to incidental CSS or text. */
export const PRODUCT_TOUR_STEPS: Record<ProductTourId, readonly ProductTourStepDefinition[]> =
  steps;

export function findProductTour(id: string) {
  return PRODUCT_TOURS.find((tour) => tour.id === id);
}

/** Completed and dismissed versions both acknowledge their lessons. Zero means a first visit. */
function getProductTourSteps(
  steps: readonly ProductTourStepDefinition[],
  version: number,
  acknowledgedVersion = 0,
) {
  return steps.filter(
    (step) =>
      step.introducedInVersion <= version &&
      (step.updatedInVersion !== undefined && step.updatedInVersion <= version
        ? step.updatedInVersion
        : step.introducedInVersion) > acknowledgedVersion,
  );
}

export type ProductTourNavigation = {
  from: "journal" | "account";
  mode: "full" | "updates";
};

export type ProductTourSearchParams = {
  from?: string | string[];
  mode?: string | string[];
};

/** One allowlist and duplicate policy for server search params and client getAll() values. */
export function parseProductTourNavigation(params: ProductTourSearchParams): ProductTourNavigation {
  function single(value: string | string[] | undefined) {
    return Array.isArray(value) ? (value.length === 1 ? value[0] : undefined) : value;
  }
  const from = single(params.from) === "account" ? "account" : "journal";
  return {
    from,
    mode: from !== "account" && single(params.mode) === "updates" ? "updates" : "full",
  };
}

/** One policy for invitations and playback, including stale update links and explicit replay. */
export function resolveProductTour(
  catalog: readonly ProductTourStepDefinition[],
  {
    version,
    savedVersion = 0,
    navigation = { from: "journal", mode: "full" },
  }: {
    version: number;
    savedVersion?: number;
    navigation?: ProductTourNavigation;
  },
) {
  const unseenSteps = getProductTourSteps(catalog, version, savedVersion);
  const shouldInvite = savedVersion < version && unseenSteps.length > 0;
  const requested = parseProductTourNavigation(navigation);
  const mode =
    requested.mode === "updates" && savedVersion > 0 && shouldInvite ? "updates" : "full";
  return {
    shouldInvite,
    navigation: { from: requested.from, mode } satisfies ProductTourNavigation,
    steps: mode === "updates" ? unseenSteps : getProductTourSteps(catalog, version),
  };
}

export function productTourPath(
  tourId: ProductTourId,
  options: Partial<ProductTourNavigation> & { stepId?: string } = {},
) {
  const steps = PRODUCT_TOUR_STEPS[tourId];
  const step = steps.find((entry) => entry.id === options.stepId) ?? steps[0];
  return productTourContinuationPath(tourId, { ...options, stepId: step.id });
}

/** Preserve a locked route without resolving whether its tour or step exists. */
export function productTourContinuationPath(
  tourId: string,
  options: Partial<ProductTourNavigation> & { stepId?: string } = {},
) {
  const { from, mode } = parseProductTourNavigation(options);
  const query = new URLSearchParams();
  if (from === "account") query.set("from", "account");
  if (mode === "updates") query.set("mode", "updates");
  const search = query.toString();
  const step = options.stepId ? `/${encodeURIComponent(options.stepId)}` : "";
  return `/tutorial/${encodeURIComponent(tourId)}${step}${search ? `?${search}` : ""}`;
}

export function productTourExitPath(userId: string, from: ProductTourNavigation["from"]) {
  return from === "account" ? "/account" : `/users/${userId}/journal`;
}
