"use client";

import { useEffect, useLayoutEffect } from "react";

/** `useLayoutEffect` on the client, `useEffect` on the server.
 *
 * Layout effects never run during SSR, and React warns when a component that
 * declares one is server-rendered — which every client component here is, on
 * first load. Picking the hook once per environment (never per render) keeps
 * hook order stable while dropping the warning; the client still gets the
 * pre-paint commit that anything measuring or matching against layout depends
 * on to avoid a flash of the wrong state. */
export const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;
