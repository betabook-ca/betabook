"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type SearchScope = { areaId: number; areaName: string };

const SearchScopeContext = createContext<SearchScope | null>(null);
const SetSearchScopeContext = createContext<(scope: SearchScope | null) => void>(() => {});

/** Where the viewer currently is, for search surfaces that can narrow to it
 * — the quick dialog offers this as an explicit narrowing action. Null everywhere that has no area context. */
export function useSearchScope(): SearchScope | null {
  return useContext(SearchScopeContext);
}

/** Lives above both the palette (in the layout) and the pages that register
 * a scope, since a server page can't hand a value to a client sibling
 * directly — it renders `<RegisterSearchScope>` and this holds the result. */
export function SearchScopeProvider({ children }: { children: ReactNode }) {
  const [scope, setScope] = useState<SearchScope | null>(null);

  return (
    <SetSearchScopeContext.Provider value={setScope}>
      <SearchScopeContext.Provider value={scope}>{children}</SearchScopeContext.Provider>
    </SetSearchScopeContext.Provider>
  );
}

/** Rendered by a page to declare its area scope; clears it on the way out.
 *
 * Registration is an effect rather than a render-time write because the
 * provider sits above this in the tree — setting its state during this
 * component's render would be a cross-component render-phase update. The
 * palette is only readable after a user gesture, so the one frame between
 * paint and registration is never observable. */
export function RegisterSearchScope({ areaId, areaName }: SearchScope) {
  const setScope = useContext(SetSearchScopeContext);
  // Depending on the object identity would re-register every render.
  const scope = useMemo(() => ({ areaId, areaName }), [areaId, areaName]);

  useEffect(() => {
    setScope(scope);
    return () => setScope(null);
  }, [scope, setScope]);

  return null;
}
