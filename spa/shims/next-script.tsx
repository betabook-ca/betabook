import { useEffect } from "react";

export type ScriptProps = {
  src?: string;
  onReady?: () => void;
  onLoad?: () => void;
  onError?: () => void;
};

const loadedScripts = new Set<string>();

/** Minimal `next/script` compatibility shim for external scripts such as Turnstile. */
export default function Script({ src, onReady, onLoad, onError }: ScriptProps) {
  useEffect(() => {
    if (!src) {
      return;
    }
    if (loadedScripts.has(src)) {
      onReady?.();
      onLoad?.();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CSS.escape(src)}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        loadedScripts.add(src);
        onReady?.();
        onLoad?.();
        return;
      }
      const handleLoad = () => {
        loadedScripts.add(src);
        onReady?.();
        onLoad?.();
      };
      const handleError = () => {
        onError?.();
      };
      existing.addEventListener("load", handleLoad);
      existing.addEventListener("error", handleError);
      return () => {
        existing.removeEventListener("load", handleLoad);
        existing.removeEventListener("error", handleError);
      };
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    const handleLoad = () => {
      script.dataset.loaded = "true";
      loadedScripts.add(src);
      onReady?.();
      onLoad?.();
    };
    const handleError = () => {
      onError?.();
    };
    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);
    document.head.appendChild(script);
    return () => {
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };
  }, [src, onReady, onLoad, onError]);

  return null;
}
