import { useMemo } from "react";
import {
  useLocation,
  useNavigate,
  useParams as useReactRouterParams,
  useSearchParams as useReactRouterSearchParams,
} from "react-router";

import { clearBootstrapData } from "@/spa/bootstrap";

type NavigateOptions = {
  scroll?: boolean;
};

export type AppRouterInstance = {
  push: (href: string, options?: NavigateOptions) => void;
  replace: (href: string, options?: NavigateOptions) => void;
  back: () => void;
  forward: () => void;
  refresh: () => void;
  prefetch: (href: string) => void;
};

/** React Router-backed compatibility shim for `next/navigation` `useRouter`. */
export function useRouter(): AppRouterInstance {
  const navigate = useNavigate();

  return useMemo(
    () => ({
      push: (href: string) => {
        void navigate(href);
      },
      replace: (href: string) => {
        void navigate(href, { replace: true });
      },
      back: () => {
        void navigate(-1);
      },
      forward: () => {
        void navigate(1);
      },
      refresh: () => {
        clearBootstrapData();
        window.dispatchEvent(new CustomEvent("betabook:router-refresh"));
      },
      prefetch: () => {
        // Prefetch is a deliberate no-op to preserve Worker request budgets.
      },
    }),
    [navigate],
  );
}

/** Returns the active location pathname (Next.js `usePathname` equivalent). */
export function usePathname(): string {
  return useLocation().pathname;
}

/** Returns a read-only `URLSearchParams` view mirroring the active query string. */
export function useSearchParams(): URLSearchParams {
  const [searchParams] = useReactRouterSearchParams();
  const serialized = searchParams.toString();
  return useMemo(() => new URLSearchParams(serialized), [serialized]);
}

/** Returns matched route parameters from React Router. */
/* oxlint-disable typescript/no-unnecessary-type-parameters -- matches Next.js useParams<T>() generic signature */
export function useParams<
  T extends Record<string, string | string[] | undefined> = Record<string, string | undefined>,
>(): T {
  return useReactRouterParams() as T;
}
/* oxlint-enable typescript/no-unnecessary-type-parameters */
