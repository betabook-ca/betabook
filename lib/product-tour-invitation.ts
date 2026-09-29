import type { ProductTourDefinition } from "@/lib/product-tour";
import type {
  ProductTourNavigation,
  ProductTourStepDefinition,
} from "@/lib/product-tour-navigation";

export function getProductTourInvitationCopy(
  tour: ProductTourDefinition,
  steps: readonly ProductTourStepDefinition[],
  { mode, returning = false }: { mode: ProductTourNavigation["mode"]; returning?: boolean },
) {
  if (mode === "updates") {
    return {
      eyebrow: "What's new",
      title: "New since your last tour",
      description: "Short lessons in the demo account show you how.",
      highlights: steps.map((step) => step.whatsNew ?? step.title),
      action: "See what's new",
    };
  }
  return {
    eyebrow: returning ? "What's new" : "Welcome to Betabook",
    title: returning ? tour.returningTitle : tour.title,
    description: returning ? tour.returningDescription : tour.description,
    highlights: [],
    action: "Show me how",
  };
}
