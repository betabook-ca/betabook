"use client";

import type { ComponentType } from "react";

import { LogEntryButton } from "@/components/journal/log-entry-button";
import type { ProductTourId } from "@/lib/product-tour";

/** Optional shortcuts beside an invitation; adding a showcase doesn't require one. */
export const PRODUCT_TOUR_QUICK_ACTIONS: Partial<Record<ProductTourId, ComponentType>> = {
  journal: () => <LogEntryButton label="Log an entry" variant="outline" />,
};
