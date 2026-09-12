import { act } from "@testing-library/react";
import { useEffect } from "react";
import { vi } from "vitest";

type RenderOptions = { sitekey: string; callback: (token: string) => void };

/** Replaces next/script, since jsdom never loads the external Turnstile script. */
export default function ReadyScript({ onReady }: { onReady?: () => void }) {
  useEffect(() => onReady?.(), [onReady]);
  return null;
}

export function stubTurnstile() {
  const turnstile = {
    render: vi.fn<(container: HTMLElement, options: RenderOptions) => string>(() => "widget-1"),
    reset: vi.fn<(widgetId: string) => void>(),
    remove: vi.fn<(widgetId: string) => void>(),
  };
  vi.stubGlobal("turnstile", turnstile);
  return {
    turnstile,
    solve: (token: string) => act(async () => turnstile.render.mock.lastCall?.[1].callback(token)),
  };
}
