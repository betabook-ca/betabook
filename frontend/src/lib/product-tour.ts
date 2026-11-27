/** Add a new feature here; UI step loaders live in components/product-tours/registry.ts. */
export const PRODUCT_TOURS = [
  {
    id: "journal",
    version: 7,
    name: "Journal, projects, friends and sharing",
    title: "Keep a climbing journal",
    description:
      "Learn to log sessions, find your next project, add friends, and choose who can read your notes.",
    returningTitle: "Find your next project",
    returningDescription:
      "Browse climbs by area, grade, rating and ascents on Find climbs. Add your climbing partners as friends and set separate audiences for send commentary and journal entries.",
  },
] as const;

export type ProductTourId = (typeof PRODUCT_TOURS)[number]["id"];
export type ProductTourDefinition = (typeof PRODUCT_TOURS)[number];
export type ProductTourProgress = {
  tourId: string;
  version: number;
  status: "dismissed" | "completed";
};
export type ProductTourState = {
  returning: boolean;
  progress: ProductTourProgress[];
};

export function getAcknowledgedTourVersion(
  tourId: string,
  progress: readonly ProductTourProgress[] = [],
): number {
  return progress.find((entry) => entry.tourId === tourId)?.version ?? 0;
}
