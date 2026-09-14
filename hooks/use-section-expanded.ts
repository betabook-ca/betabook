"use client";

import { useSyncExternalStore } from "react";

const memory = new Map<string, boolean>();
const eventName = "betabook-section-preference";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(eventName, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(eventName, callback);
  };
}
function serverSnapshot() {
  return true;
}

export function useSectionExpanded(key: string): [boolean, (expanded: boolean) => void] {
  const expanded = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key) !== "true";
      } catch {
        return memory.get(key) ?? true;
      }
    },
    serverSnapshot,
  );
  function change(value: boolean) {
    memory.set(key, value);
    try {
      localStorage.setItem(key, String(!value));
    } catch {
      /* In-memory fallback for blocked storage. */
    }
    window.dispatchEvent(new Event(eventName));
  }
  return [expanded, change];
}
