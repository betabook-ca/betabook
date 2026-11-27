import { useSyncExternalStore } from "react";

import type { paths, components } from "@/spa/generated/api";
import type { ApiResponse } from "@/spa/lib/api";

type Session = NonNullable<ApiResponse<"/api/auth/get-session">>;
type AuthEndpoint = {
  [P in keyof paths]: P extends `/api/auth/${string}`
    ? paths[P] extends { post: { responses: unknown } }
      ? P
      : never
    : never;
}[keyof paths];
type AuthInput<P extends AuthEndpoint> = paths[P]["post"] extends {
  requestBody: { content: { "application/json": infer Input extends object } };
}
  ? Input
  : Record<string, never>;
type AuthResult<P extends AuthEndpoint> = paths[P]["post"] extends {
  responses: { 200: { content: { "application/json": infer Result } } };
}
  ? Result
  : never;
type AuthError = components["responses"]["Error"]["content"]["application/json"];
type Snapshot = { data: Session | null; isPending: boolean };
type Callbacks<P extends AuthEndpoint> = {
  body?: Partial<AuthInput<P>>;
  headers?: HeadersInit;
  onSuccess?: (context: { data: AuthResult<P> }) => void;
  onError?: (context: { error: { message?: string; code?: string } }) => void;
  onResponse?: () => void;
};

const initial: Snapshot = { data: null, isPending: true };
const SESSION_CHANGE_KEY = "betabook:session-change";

/** Browser client for the Worker's cookie-authenticated JSON endpoints. */
export function createWorkerAuthClient(transport: typeof fetch = (...args) => fetch(...args)) {
  const listeners = new Set<() => void>();
  let snapshot = initial;
  let pending: Promise<void> | null = null;
  let generation = 0;

  function publish(session: Session | null) {
    snapshot = { data: session, isPending: false };
    for (const listener of listeners) listener();
  }
  function refetch(): Promise<void> {
    if (pending) return pending;
    const current = generation;
    snapshot = { ...snapshot, isPending: true };
    for (const listener of listeners) listener();
    pending = (async () => {
      try {
        const response = await transport("/api/auth/get-session", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const session = response.ok ? await response.json<Session | null>() : null;
        if (current === generation) publish(session);
      } catch {
        if (current === generation) publish(null);
      } finally {
        if (current === generation) pending = null;
      }
    })();
    return pending;
  }
  function recheck() {
    if (document.visibilityState !== "hidden") void refetch();
  }
  function onStorage(event: StorageEvent) {
    if (event.key === SESSION_CHANGE_KEY) {
      generation += 1;
      pending = null;
      void refetch();
    }
  }
  function subscribe(listener: () => void) {
    listeners.add(listener);
    if (listeners.size === 1) {
      void refetch();
      window.addEventListener("focus", recheck);
      document.addEventListener("visibilitychange", recheck);
      window.addEventListener("storage", onStorage);
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        window.removeEventListener("focus", recheck);
        document.removeEventListener("visibilitychange", recheck);
        window.removeEventListener("storage", onStorage);
      }
    };
  }
  function changed(signedOut: boolean) {
    generation += 1;
    pending = null;
    if (signedOut) publish(null);
    else if (listeners.size) void refetch();
    try {
      window.localStorage.setItem(SESSION_CHANGE_KEY, crypto.randomUUID());
    } catch {
      // The session cookie also gets rechecked when a tab regains focus.
    }
  }
  function endpoint<P extends AuthEndpoint>(path: P) {
    return async (body: AuthInput<P>, options: Callbacks<P> = {}) => {
      try {
        const headers = new Headers(options.headers);
        headers.set("Content-Type", "application/json");
        const response = await transport(path, {
          method: "POST",
          credentials: "same-origin",
          headers,
          body: JSON.stringify({ ...body, ...options.body }),
        });
        if (!response.ok) {
          const error = await response.json<AuthError>();
          options.onError?.({ error: { code: error.code, message: error.message ?? error.error } });

          return;
        }
        const data = await response.json<AuthResult<P>>();
        if (
          path === "/api/auth/sign-in/email" ||
          path === "/api/auth/sign-out" ||
          path === "/api/auth/delete-user"
        ) {
          changed(path !== "/api/auth/sign-in/email");
        }
        options.onSuccess?.({ data });
        if (
          path === "/api/auth/sign-in/social" &&
          typeof data === "object" &&
          data !== null &&
          "redirect" in data &&
          data.redirect &&
          "url" in data &&
          typeof data.url === "string"
        )
          window.location.assign(data.url);
      } finally {
        options.onResponse?.();
      }
    };
  }
  return {
    refetch,
    useSession() {
      const session = useSyncExternalStore(
        subscribe,
        () => snapshot,
        () => initial,
      );
      return { ...session, refetch };
    },
    signIn: {
      email: endpoint("/api/auth/sign-in/email"),
      social: endpoint("/api/auth/sign-in/social"),
    },
    signUp: { email: endpoint("/api/auth/sign-up/email") },
    sendVerificationEmail: endpoint("/api/auth/send-verification-email"),
    requestPasswordReset: endpoint("/api/auth/request-password-reset"),
    resetPassword: endpoint("/api/auth/reset-password"),
    signOut: ({ fetchOptions }: { fetchOptions: Callbacks<"/api/auth/sign-out"> }) =>
      endpoint("/api/auth/sign-out")({}, fetchOptions),
    deleteUser: ({ fetchOptions }: { fetchOptions: Callbacks<"/api/auth/delete-user"> }) =>
      endpoint("/api/auth/delete-user")({}, fetchOptions),
  };
}
