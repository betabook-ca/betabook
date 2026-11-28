import { clsx } from "clsx";
import { Star } from "lucide-react";

type RatingStarsProps = {
  rating: number | null;
  /** Individual sends only allow whole-number ratings — show those as
   * integers. Aggregates (e.g. a climb's average rating) are genuinely
   * fractional and should show one decimal place. */
  precision?: "integer" | "decimal";
  className?: string;
};

export function RatingStars({ rating, precision = "integer", className }: RatingStarsProps) {
  if (rating == null) {
    // "—" is the app-wide fallback for absent row values (grades, ratings,
    // dates) — long labels like "No rating" crush row titles on phones.
    return <span className={clsx("text-sm text-muted", className)}>—</span>;
  }

  return (
    <span className={clsx("inline-flex items-center gap-1 text-sm font-medium", className)}>
      {precision === "decimal" ? rating.toFixed(1) : Math.round(rating)}
      <Star className="size-4 fill-current text-warning" aria-hidden />
    </span>
  );
}
