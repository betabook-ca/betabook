"use client";

import { useEffect, useEffectEvent, useRef, useState, type ComponentType } from "react";

type Loader<P> = () => Promise<ComponentType<P>>;

/** Preload a stable, module-level loader after hydration; interactions can load or retry early. */
export function useDeferredComponent<P>(loader: Loader<P>): {
  Component: ComponentType<P> | null;
  load: () => void;
  failed: boolean;
} {
  const [Component, setComponent] = useState<ComponentType<P> | null>(null);
  const [failed, setFailed] = useState(false);
  const loading = useRef(false);
  const loaded = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  function load() {
    if (loading.current || loaded.current) return;
    loading.current = true;
    setFailed(false);
    async function run() {
      try {
        const resolved = await loader();
        if (alive.current) {
          loaded.current = true;
          setComponent(() => resolved);
        }
      } catch {
        if (alive.current) setFailed(true);
      }
      loading.current = false;
    }
    void run();
  }
  const preload = useEffectEvent(load);

  useEffect(() => {
    // Safari only shipped requestIdleCallback in 17.4, so the timeout below
    // is a live path on real traffic, not just a defensive guard. The
    // `timeout` caps how long a busy main thread can starve the preload.
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(preload, { timeout: 2000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(preload, 300);
    return () => clearTimeout(id);
  }, []);

  return { Component, load, failed };
}
