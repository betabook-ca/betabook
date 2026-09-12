"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

import { InlineAlert } from "@/components/ui/inline-alert";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      appearance: "interaction-only";
      size: "flexible";
      theme: "light" | "dark";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
      "before-interactive-callback": () => void;
      "after-interactive-callback": () => void;
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function TurnstileWidget({
  siteKey,
  generation,
  onToken,
}: {
  siteKey: string;
  generation: number;
  onToken: (token: string | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [interactive, setInteractive] = useState(false);
  // Without a token the submit button stays disabled, so say why.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const api = window.turnstile;
    if (!loaded || !api || !container.current) return;
    const id = api.render(container.current, {
      sitekey: siteKey,
      appearance: "interaction-only",
      size: "flexible",
      theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
      callback: (token) => {
        setFailed(false);
        onToken(token);
      },
      "expired-callback": () => onToken(null),
      "error-callback": () => {
        setFailed(true);
        onToken(null);
      },
      "before-interactive-callback": () => setInteractive(true),
      "after-interactive-callback": () => setInteractive(false),
    });
    widgetId.current = id;
    return () => {
      api.remove(id);
      widgetId.current = null;
    };
  }, [loaded, siteKey, onToken]);

  useEffect(() => {
    if (generation > 0 && widgetId.current) window.turnstile?.reset(widgetId.current);
  }, [generation]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onReady={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
      {/* With no challenge to show the widget has no height but still takes a
          flex gap, so keep it out of the form's flow until it does. */}
      <div ref={container} className={interactive ? undefined : "absolute"} />
      {failed && (
        <InlineAlert>
          Couldn&apos;t load the security check. Turn off content blockers for this site or reload
          the page.
        </InlineAlert>
      )}
    </>
  );
}

/** Tokens are single-use: call `reset` once a request that carried one has a response. */
export function useTurnstile(siteKey: string | null | undefined) {
  const [token, setToken] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  return {
    widget: siteKey ? (
      <TurnstileWidget siteKey={siteKey} generation={generation} onToken={setToken} />
    ) : null,
    ready: !siteKey || token !== null,
    headers: token ? { "x-captcha-response": token } : undefined,
    reset: () => {
      setToken(null);
      setGeneration((current) => current + 1);
    },
  };
}
