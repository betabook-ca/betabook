import { useEffect, useState } from "react";

import { formatGrade } from "@/lib/grades";
import { areaHref } from "@/lib/slug";
import { peekBootstrapData } from "@/spa/bootstrap";
import {
  fetchJson,
  parsePositiveId,
  type PublicAreaDetails,
  type PublicClimb,
  type PublicClimbSend,
} from "@/spa/lib/fetch-json";
import Link from "@/spa/shims/next-link";
import { useParams, usePathname } from "@/spa/shims/next-navigation";

type ClimbViewData = {
  climbId: number;
  climb: PublicClimb;
  trail: PublicAreaDetails[];
  publicSends: PublicClimbSend[];
};

export default function ClimbRoute() {
  const params = useParams<{ id?: string }>();
  const pathname = usePathname();
  const climbId = parsePositiveId(params.id);

  const [data, setData] = useState<ClimbViewData | null>(() => {
    const bootstrapped = peekBootstrapData("climb", pathname) as ClimbViewData | null;
    if (bootstrapped && climbId !== null && bootstrapped.climbId === climbId) {
      return bootstrapped;
    }
    return null;
  });
  const [error, setError] = useState<string | null>(null);

  const hasCurrentData = data !== null && climbId !== null && data.climbId === climbId;

  useEffect(() => {
    if (climbId === null || hasCurrentData) {
      return;
    }
    const targetId = climbId;
    let cancelled = false;
    async function loadClimb() {
      try {
        const res = await fetchJson<{
          climb: PublicClimb;
          trail: PublicAreaDetails[];
          publicSends: PublicClimbSend[];
        }>(`/api/public/climbs/${targetId}`);
        if (!cancelled) {
          setError(null);
          setData({ climbId: targetId, ...res });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load climb");
        }
      }
    }
    void loadClimb();
    return () => {
      cancelled = true;
    };
  }, [climbId, hasCurrentData]);

  if (climbId === null) {
    return (
      <div role="alert" className="rounded-xl border border-border bg-surface p-6 text-danger">
        Climb not found
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
        Loading climb...
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
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-display text-3xl font-bold">{data.climb.name}</h1>
          <span className="rounded-full bg-surface-secondary px-3 py-1 text-sm font-semibold">
            {formatGrade(data.climb.type, data.climb.grade)} · {data.climb.type}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted">
          {data.climb.sendCount} public sends
          {data.climb.avgRating !== null ? ` · ${data.climb.avgRating.toFixed(1)}★` : ""}
        </p>
        {data.climb.description && (
          <p className="mt-4 max-w-3xl text-sm">{data.climb.description}</p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-display text-xl font-bold">Public Sends</h2>
        {data.publicSends.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No public sends recorded yet.</p>
        ) : (
          <ul role="list" className="mt-3 flex list-none flex-col gap-2">
            {data.publicSends.map((send, index) => (
              <li
                key={`${send.userName ?? "anon"}-${send.dateSent ?? index}`}
                className="rounded-lg border border-separator bg-surface-secondary px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{send.userName ?? "Anonymous climber"}</span>
                  <span className="text-xs text-muted">
                    {send.ascentStyle}
                    {send.dateSent ? ` · ${send.dateSent}` : ""}
                  </span>
                </div>
                {send.comment && <p className="mt-1 text-muted">{send.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
