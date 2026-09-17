import { Chip } from "@heroui/react";

/** Marks a climb that has been reported broken (climbs.broken_on is set).
 * Sits beside the discipline chip wherever a climb is named — the climb
 * page, list rows, pickers — so nobody is surprised when logging refuses an
 * ascent dated after the break. Driven by the column, never by description
 * text, which anyone can edit. HeroUI's soft `danger` is free here: success
 * and warning are spoken for by ascent styles and rating stars, and a broken
 * line is the one red fact a climb can carry. */
export function BrokenChip({ brokenOn, className = "" }: { brokenOn: string; className?: string }) {
  return (
    <Chip
      variant="soft"
      color="danger"
      size="sm"
      className={`font-sans ${className}`}
      aria-label={`Broken since ${brokenOn}`}
      title={`Broke on ${brokenOn}`}
    >
      Broken
    </Chip>
  );
}
