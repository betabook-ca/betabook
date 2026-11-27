import type { ProductTourPage } from "@/components/product-tours/types";
import type { ProductTourId } from "@/lib/product-tour";

/** Feature views load only when their tour is opened. */
export const PRODUCT_TOUR_LOADERS: Record<ProductTourId, () => Promise<ProductTourPage>> = {
  journal: () =>
    import("@/components/product-tours/journal-tour").then((module) => module.JournalTourPage),
};
