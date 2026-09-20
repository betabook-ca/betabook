import { PRODUCT_TOURS, type ProductTourId } from "@/lib/product-tour";

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
export const PRODUCT_TOUR_STEPS: Record<ProductTourId, readonly ProductTourStepDefinition[]> = {
  journal: [
    {
      id: "journal",
      introducedInVersion: 1,
      section: "Journal",
      title: "Start in Journal",
      description:
        "Open Logbook from the sidebar or bottom tabs for Journal and Sends. Use Log for outdoor sessions, sends, repeats, and training. Tag friends under Add details to record who joined you. Each friend logs their own activity.",
      target: "journal-log",
    },
    {
      id: "journal-filters",
      introducedInVersion: 1,
      section: "Journal",
      title: "Find an old entry",
      description:
        "Search your notes or filter by entry type. Tags on entries work as filters too.",
      target: "journal-filters",
    },
    {
      id: "sends",
      introducedInVersion: 1,
      section: "Sends",
      title: "Find your sends",
      description:
        "Your first send of each climb appears here. Repeats stay in Journal. Try sorting by grade or rating.",
      target: "send-sort",
    },
    {
      id: "projects",
      introducedInVersion: 1,
      updatedInVersion: 4,
      section: "Projects",
      title: "Pick up where you left off",
      description:
        "Pin a climb and it appears in Progress, Projects, with its latest note — even before your first session on it. Use Load more to read earlier sessions, and the Sent tab to revisit the ones you finished. This list is private.",
      target: "project-sessions",
    },
    {
      id: "analytics",
      introducedInVersion: 1,
      section: "Analytics",
      title: "See your progress",
      description:
        "Dots show each month's hardest send; the line tracks your personal best. Days out count each outdoor date once.",
      target: "analytics-chart",
    },
    {
      id: "find-projects",
      introducedInVersion: 3,
      section: "Find climbs",
      title: "Find your next project",
      description:
        "Open Find climbs from the sidebar or menu. Climbs lists the whole catalog before you type a name: pick an area, tap a discipline, then open Filters for grade, rating and ascents. Sort by rating to surface the classics. Try Boulder, then Filters.",
      target: "climb-filters",
    },
    {
      id: "find-climbers",
      introducedInVersion: 2,
      section: "Search",
      title: "Find your climbing partners",
      description:
        "Open Search, choose Climbers, and enter a name. View all results, then select Add friend on a result or profile. Private profiles don't appear in search. Try sending Riley a request.",
      target: "friend-search",
    },
    {
      id: "friend-requests",
      introducedInVersion: 2,
      section: "Friends",
      title: "Friend requests",
      description:
        "We'll email you about new friend requests and show a badge on Community. Open Community, then Friends and Requests, to accept or decline one. Try accepting Sam's request.",
      target: "friend-requests",
    },
    {
      id: "feed",
      introducedInVersion: 2,
      section: "Feed",
      title: "Catch up with friends",
      description:
        "See what your friends have been climbing. Switch to Sends to see just their sends.",
      target: "friend-feed",
    },
    {
      id: "account",
      introducedInVersion: 1,
      updatedInVersion: 2,
      section: "Account settings",
      title: "Choose what you share",
      description:
        "Open Account settings from the sidebar or mobile menu to manage your account and sharing. Send commentary and journal entries have separate audiences. Try Members commentary with a Friends-only journal. Turn on Private profile to hide your climbing history from everyone else. Both controls are disabled, and your choices are kept. Audience changes apply to past entries too.",
      target: "privacy-controls",
    },
  ],
};

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
