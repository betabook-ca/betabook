import { act } from "@testing-library/react";
import { useEffect } from "react";
import { vi } from "vitest";

type RenderOptions = {
  sitekey: string;
  callback: (token: string) => void;
  "error-callback": () => void;
};

/** Set `blocked` to make the script fail to load, as a content blocker would. */
export const turnstileScript = { blocked: false };

/** Replaces next/script, since jsdom never loads the external Turnstile script. */
export default function ReadyScript({
  onReady,
  onError,
}: {
  onReady?: () => void;
  onError?: (error: Error) => void;
}) {
  useEffect(() => {
    if (turnstileScript.blocked) onError?.(new Error("blocked"));
    else onReady?.();
  }, [onReady, onError]);
  return null;
}

export function stubTurnstile() {
  const turnstile = {
    render: vi.fn<(container: HTMLElement, options: RenderOptions) => string>(() => "widget-1"),
    reset: vi.fn<(widgetId: string) => void>(),
    remove: vi.fn<(widgetId: string) => void>(),
  };
  vi.stubGlobal("turnstile", turnstile);
  const options = () => turnstile.render.mock.lastCall?.[1];
  return {
    turnstile,
    solve: (token: string) => act(async () => options()?.callback(token)),
    fail: () => act(async () => options()?.["error-callback"]()),
  };
}
