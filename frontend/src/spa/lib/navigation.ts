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

type AppRouterInstance = {
  push: (href: string, options?: NavigateOptions) => void;
  replace: (href: string, options?: NavigateOptions) => void;
  back: () => void;
  forward: () => void;
  refresh: () => void;
};

function refresh() {
  clearBootstrapData();
  window.dispatchEvent(new CustomEvent("betabook:router-refresh"));
}

/** App navigation and explicit revalidation of Rust page loaders. */
export function useRouter(): AppRouterInstance {
  const navigate = useNavigate();

  return {
    push(href, options) {
      void navigate(href, { preventScrollReset: options?.scroll === false });
    },
    replace(href, options) {
      void navigate(href, { replace: true, preventScrollReset: options?.scroll === false });
    },
    back() {
      void navigate(-1);
    },
    forward() {
      void navigate(1);
    },
    refresh,
  };
}

export function usePathname(): string {
  return useLocation().pathname;
}

/** Returns a read-only `URLSearchParams` view mirroring the active query string. */
export function useSearchParams(): URLSearchParams {
  const [searchParams] = useReactRouterSearchParams();
  return searchParams;
}

export const useParams = useReactRouterParams;
