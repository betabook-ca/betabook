import { AppLink } from "@/components/ui/app-link";
import { areaHref } from "@/lib/slug";

/** Up to two ancestor areas, then the leaf area when `areaId`/`areaName`
 * are passed. Omit the leaf when the row title already links the area.
 * Mobile shows only the last segment. */
export function AreaBreadcrumb({
  areaId,
  areaName,
  ancestors,
}: {
  areaId?: number;
  areaName?: string;
  ancestors: { id: number; name: string }[];
}) {
  // Plain utilities: they sit in a later cascade layer than HeroUI's `.link`
  // component class, so no `!important` is needed to quiet the link.
  const linkClassName = "text-xs font-normal text-muted";
  const segments =
    areaId != null && areaName != null ? [...ancestors, { id: areaId, name: areaName }] : ancestors;
  const leading = segments.slice(0, -1);
  const last = segments.at(-1);

  if (last == null) return null;

  return (
    <span className="text-xs text-muted">
      {leading.length > 0 && (
        <span className="hidden md:inline">
          {leading.map((segment) => (
            <span key={segment.id}>
              <AppLink href={areaHref(segment.id, segment.name)} className={linkClassName}>
                {segment.name}
              </AppLink>
              <span aria-hidden> / </span>
            </span>
          ))}
        </span>
      )}
      <AppLink href={areaHref(last.id, last.name)} className={linkClassName}>
        {last.name}
      </AppLink>
    </span>
  );
}
