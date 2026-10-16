"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { DEFAULT_GRADE_PREFERENCES, type GradePreferences } from "@/lib/grades";

const GradePreferencesContext = createContext<GradePreferences>(DEFAULT_GRADE_PREFERENCES);

/** The viewer's grading systems for every client component under it. Mounted
 * once per request in app/template.tsx from the session the template already
 * reads, so the first paint and hydration agree; server components take the
 * same value as an argument instead (`getViewerGradePreferences` in
 * lib/session.ts) or print through `GradeLabel`. Without a provider (stories,
 * jsdom) the hook answers Hueco/YDS. */
export function GradePreferencesProvider({
  value,
  children,
}: {
  value: GradePreferences;
  children: ReactNode;
}) {
  const stable = useMemo(
    () => ({ boulder: value.boulder, rope: value.rope }),
    [value.boulder, value.rope],
  );
  return (
    <GradePreferencesContext.Provider value={stable}>{children}</GradePreferencesContext.Provider>
  );
}

export function useGradePreferences(): GradePreferences {
  return useContext(GradePreferencesContext);
}
