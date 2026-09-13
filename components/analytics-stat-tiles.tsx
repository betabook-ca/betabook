import { clsx } from "clsx";
import type { ReactNode } from "react";

import { cardClass } from "@/components/ui/card";
import { EYEBROW_CLASS } from "@/components/ui/eyebrow";

export type StatTile = {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
};

/** Callers pick the column classes, since tile rows differ in width. */
export function StatTiles({ tiles, className }: { tiles: StatTile[]; className?: string }) {
  if (tiles.length === 0) return null;

  return (
    <div className={clsx("grid gap-3", className)}>
      {tiles.map((tile) => (
        <div key={tile.label} className={clsx("flex flex-col gap-1", cardClass("sm"))}>
          <StatTileContent tile={tile} />
        </div>
      ))}
    </div>
  );
}

/** Shared content for ordinary and customizable stat cards. */
export function StatTileContent({ tile }: { tile: StatTile }) {
  return (
    <>
      <span className={EYEBROW_CLASS}>{tile.label}</span>
      <span className="font-display text-2xl font-semibold text-foreground tabular-nums">
        {tile.value}
      </span>
      {tile.sub != null && <span className="text-xs text-muted">{tile.sub}</span>}
    </>
  );
}
