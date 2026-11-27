import { useEffect, useState } from "react";

export function useRouterRefreshKey(): number {
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    function handleRefresh() {
      setRefreshKey((current) => current + 1);
    }
    window.addEventListener("betabook:router-refresh", handleRefresh);
    return () => {
      window.removeEventListener("betabook:router-refresh", handleRefresh);
    };
  }, []);

  return refreshKey;
}
