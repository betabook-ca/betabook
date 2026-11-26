import { useEffect, useState } from "react";

import { formatGrade } from "@/lib/grades";
import { areaHref, climbHref } from "@/lib/slug";
import { peekBootstrapData } from "@/spa/bootstrap";
import {
  fetchJson,
  parsePositiveId,
  type PublicAreaDetails,
  type PublicClimb,
} from "@/spa/lib/fetch-json";
import Link from "@/spa/shims/next-link";
import { useParams, usePathname, useSearchParams } from "@/spa/shims/next-navigation";

type AreaViewData = {
  areaId: number;
  subareaId: number | null;
  area: PublicAreaDetails;
  trail: PublicAreaDetails[];
  subareas: PublicAreaDetails[];
  climbs: PublicClimb[];
};

export default function AreaRoute() {
  const params = useParams<{ id?: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const areaId = parsePositiveId(params.id);
  const subareaId = parsePositiveId(searchParams.get("subarea") ?? undefined);

  const [data, setData] = useState<AreaViewData | null>(() => {
    const bootstrapped = peekBootstrapData("area", pathname) as AreaViewData | null;
    if (
      bootstrapped &&
      areaId !== null &&
      bootstrapped.areaId === areaId &&
      bootstrapped.subareaId === subareaId
    ) {
      return bootstrapped;
    }
    return null;
  });
  const [error, setError] = useState<string | null>(null);

  const hasCurrentData =
    data !== null && areaId !== null && data.areaId === areaId && data.subareaId === subareaId;

  useEffect(() => {
    if (areaId === null || hasCurrentData) {
      return;
    }
    const targetId = areaId;
    const targetSubarea = subareaId;
    let cancelled = false;
    async function loadArea() {
      const climbsQuery =
        targetSubarea !== null
          ? `?subarea=${encodeURIComponent(targetSubarea)}&limit=10`
          : "?limit=10";
      try {
        const [details, climbsPage] = await Promise.all([
          fetchJson<{
            area: PublicAreaDetails;
            trail: PublicAreaDetails[];
            subareas: PublicAreaDetails[];
          }>(`/api/public/areas/${targetId}`),
          fetchJson<{ climbs: PublicClimb[] }>(
            `/api/public/areas/${targetId}/climbs${climbsQuery}`,
          ),
        ]);
        if (!cancelled) {
          setError(null);
          setData({
            areaId: targetId,
            subareaId: targetSubarea,
            ...details,
            climbs: climbsPage.climbs,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load area");
        }
      }
    }
    void loadArea();
    return () => {
      cancelled = true;
    };
  }, [areaId, subareaId, hasCurrentData]);

  if (areaId === null) {
    return (
      <div role="alert" className="rounded-xl border border-border bg-surface p-6 text-danger">
        Area not found
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-border bg-surface p-6 text-danger">
        {error}
      </div>
    );
  }
  if (!hasCurrentData) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
        Loading area...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Link href="/" className="link">
          Home
        </Link>
        {data.trail.map((item) => (
          <span key={item.id} className="flex items-center gap-2">
            <span>/</span>
            <Link href={areaHref(item.id, item.name)} className="link">
              {item.name}
            </Link>
          </span>
        ))}
      </nav>

      <section className="rounded-xl border border-border bg-surface p-6">
        <h1 className="font-display text-3xl font-bold">{data.area.name}</h1>
        {data.area.description && (
          <p className="mt-2 max-w-3xl text-sm text-muted">{data.area.description}</p>
        )}
      </section>

      {data.subareas.length > 0 && (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="font-display text-xl font-bold">Subareas</h2>
          <ul role="list" className="mt-3 grid list-none gap-2 sm:grid-cols-2">
            {data.subareas.map((child) => (
              <li
                key={child.id}
                className="rounded-lg border border-separator bg-surface-secondary px-3 py-2"
              >
                <Link href={areaHref(child.id, child.name)} className="link font-medium">
                  {child.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-display text-xl font-bold">Climbs</h2>
        {data.climbs.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No climbs in this area.</p>
        ) : (
          <ul role="list" className="mt-3 flex list-none flex-col gap-2">
            {data.climbs.map((climb) => (
              <li
                key={climb.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-separator bg-surface-secondary px-3 py-2"
              >
                <Link href={climbHref(climb.id, climb.name)} className="link font-medium">
                  {climb.name}
                </Link>
                <span className="text-xs font-semibold text-muted">
                  {formatGrade(climb.type, climb.grade)} · {climb.sendCount} sends
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
