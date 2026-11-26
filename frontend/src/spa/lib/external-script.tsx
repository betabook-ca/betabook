import { useEffect, useEffectEvent } from "react";

const scripts = new Map<string, Promise<void>>();

function load(src: string) {
  const cached = scripts.get(src);
  if (cached) return cached;

  const pending = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => {
        scripts.delete(src);
        script.remove();
        reject(new Error("Could not load script"));
      },
      { once: true },
    );
    document.head.appendChild(script);
  });
  scripts.set(src, pending);
  return pending;
}

/** A single Turnstile download can serve widgets on successive auth pages. */
export default function ExternalScript({
  src,
  onReady,
  onError,
}: {
  src: string;
  onReady: () => void;
  onError: () => void;
}) {
  const ready = useEffectEvent(onReady);
  const failed = useEffectEvent(onError);
  useEffect(() => {
    let active = true;
    async function notify() {
      try {
        await load(src);
      } catch {
        if (active) failed();
        return;
      }
      if (active) ready();
    }
    void notify();
    return () => {
      active = false;
    };
  }, [src]);
  return null;
}
