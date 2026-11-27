"use client";

import { createContext, useContext, type ReactNode } from "react";

import { DEFAULT_GRADE_PREFERENCES, type GradePreferences } from "@/lib/grades";

const GradePreferencesContext = createContext<GradePreferences>(DEFAULT_GRADE_PREFERENCES);

/** Share the viewer's grading systems through the SPA. Without a provider,
 * the hook answers Hueco/YDS. */
export function GradePreferencesProvider({
  value,
  children,
}: {
  value: GradePreferences;
  children: ReactNode;
}) {
  return (
    <GradePreferencesContext.Provider value={value}>{children}</GradePreferencesContext.Provider>
  );
}

export function useGradePreferences(): GradePreferences {
  return useContext(GradePreferencesContext);
}
