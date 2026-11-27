import { Button, Input, Label, TextField } from "@heroui/react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { formatGrade } from "@/lib/grades";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import { areaHref, climbHref } from "@/lib/slug";
import { peekBootstrapData } from "@/spa/bootstrap";
import { fetchJson, type PublicAreaResult, type PublicClimb } from "@/spa/lib/fetch-json";
import Link from "@/spa/shims/next-link";
import { usePathname } from "@/spa/shims/next-navigation";

type HomeBootstrapPayload = {
  climbs: PublicClimb[];
  areas: PublicAreaResult[];
};

export default function HomeRoute() {
  const pathname = usePathname();
  const initial = peekBootstrapData("home", pathname) as HomeBootstrapPayload | null;
  const [searchQuery, setSearchQuery] = useState("");
  const [climbs, setClimbs] = useState<PublicClimb[]>(() => initial?.climbs ?? []);
  const [areas, setAreas] = useState<PublicAreaResult[]>(() => initial?.areas ?? []);
  const [loading, setLoading] = useState(() => initial === null);
  const [error, setError] = useState<string | null>(null);
  const [hasInitialData] = useState(() => initial !== null);

  const runSearch = useCallback(async (queryText: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (queryText.trim()) {
        qs.set("name", queryText.trim());
      }
      const prefix = qs.toString();
      const climbUrl = `/api/public/search/climbs?${prefix}${prefix ? "&" : ""}limit=10`;
      const areaUrl = `/api/public/search/areas?${prefix}${prefix ? "&" : ""}limit=8`;
      const [climbRes, areaRes] = await Promise.all([
        fetchJson<{ climbs: PublicClimb[] }>(climbUrl),
        fetchJson<{ areas: PublicAreaResult[] }>(areaUrl),
      ]);
      setClimbs(climbRes.climbs);
      setAreas(areaRes.areas);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load catalog");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasInitialData) {
      return;
    }
    let cancelled = false;
    async function loadInitial() {
      try {
        const [climbRes, areaRes] = await Promise.all([
          fetchJson<{ climbs: PublicClimb[] }>("/api/public/search/climbs?limit=10"),
          fetchJson<{ areas: PublicAreaResult[] }>("/api/public/search/areas?limit=8"),
        ]);
        if (!cancelled) {
          setClimbs(climbRes.climbs);
          setAreas(areaRes.areas);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load catalog");
          setLoading(false);
        }
      }
    }
    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, [hasInitialData]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runSearch(searchQuery);
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-border bg-surface p-6">
        <p className="text-xs font-medium tracking-wider text-muted uppercase">
          Cloudflare Workers · Rust API + Vite SPA
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">{SITE_NAME}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">{SITE_DESCRIPTION}</p>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-wrap items-end gap-3">
          <TextField className="min-w-64 flex-1" value={searchQuery} onChange={setSearchQuery}>
            <Label>Search climbs or crags</Label>
            <Input placeholder="e.g. Highlands, Electric Fund" />
          </TextField>
          <Button type="submit" variant="primary" isDisabled={loading}>
            {loading ? "Searching..." : "Search"}
          </Button>
        </form>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-border bg-surface-secondary px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="font-display text-xl font-bold">Climbs</h2>
          {climbs.length === 0 && !loading ? (
            <p className="mt-3 text-sm text-muted">No matching climbs.</p>
          ) : (
            <ul role="list" className="mt-3 flex list-none flex-col gap-2">
              {climbs.map((climb) => (
                <li
                  key={climb.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-separator bg-surface-secondary px-3 py-2"
                >
                  <div className="min-w-0">
                    <Link
                      href={climbHref(climb.id, climb.name)}
                      className="link font-medium no-underline"
                    >
                      {climb.name}
                    </Link>
                    <p className="truncate text-xs text-muted">{climb.areaName}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-muted">
                    {formatGrade(climb.type, climb.grade)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="font-display text-xl font-bold">Areas</h2>
          {areas.length === 0 && !loading ? (
            <p className="mt-3 text-sm text-muted">No matching areas.</p>
          ) : (
            <ul role="list" className="mt-3 flex list-none flex-col gap-2">
              {areas.map((area) => (
                <li
                  key={area.id}
                  className="rounded-lg border border-separator bg-surface-secondary px-3 py-2"
                >
                  <Link
                    href={areaHref(area.id, area.name)}
                    className="link font-medium no-underline"
                  >
                    {area.name}
                  </Link>
                  {area.ancestorPath && (
                    <p className="truncate text-xs text-muted">{area.ancestorPath}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
