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
      title: tour.name,
      description: steps.map((step) => step.title).join(" · "),
      action: "See what's new",
    };
  }
  return {
    eyebrow: returning ? "What's new" : "Welcome to Betabook",
    title: returning ? tour.returningTitle : tour.title,
    description: returning ? tour.returningDescription : tour.description,
    action: "Show me how",
  };
}
