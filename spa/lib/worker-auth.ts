import { useSyncExternalStore } from "react";

type Session = {
  session: { id: string };
  user: {
    id: string;
    email: string;
    name: string;
    image: string | null;
    role: string | null;
    boulderGradeScale?: string;
    ropeGradeScale?: string;
  };
};
type Snapshot = { data: Session | null; isPending: boolean };
type Callbacks = {
  body?: Record<string, unknown>;
  headers?: HeadersInit;
  onSuccess?: (context: { data: unknown }) => void;
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
  function endpoint(path: string) {
    return async (body: Record<string, unknown>, options: Callbacks = {}) => {
      try {
        const headers = new Headers(options.headers);
        headers.set("Content-Type", "application/json");
        const response = await transport(`/api/auth/${path}`, {
          method: "POST",
          credentials: "same-origin",
          headers,
          body: JSON.stringify({ ...body, ...options.body }),
        });
        const data = await response.json<{
          message?: string;
          code?: string;
          redirect?: boolean;
          url?: string;
        }>();
        if (!response.ok) {
          options.onError?.({ error: data });
          return;
        }
        if (path === "sign-in/email" || path === "sign-out" || path === "delete-user") {
          changed(path !== "sign-in/email");
        }
        options.onSuccess?.({ data });
        if (path === "sign-in/social" && data.redirect && data.url)
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
    signIn: { email: endpoint("sign-in/email"), social: endpoint("sign-in/social") },
    signUp: { email: endpoint("sign-up/email") },
    sendVerificationEmail: endpoint("send-verification-email"),
    requestPasswordReset: endpoint("request-password-reset"),
    resetPassword: endpoint("reset-password"),
    signOut: ({ fetchOptions }: { fetchOptions: Callbacks }) =>
      endpoint("sign-out")({}, fetchOptions),
    deleteUser: ({ fetchOptions }: { fetchOptions: Callbacks }) =>
      endpoint("delete-user")({}, fetchOptions),
  };
}
