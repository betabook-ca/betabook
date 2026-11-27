import { Button } from "@heroui/react";
import { Component, lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { useLocation } from "react-router";

import { AppLink } from "@/components/ui/app-link";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageTitle } from "@/components/ui/typography";
import { reportClientError } from "@/lib/client-error-report";
import { usePublicEntryReady } from "@/spa/lib/public-entry";

class RouteModuleError extends Error {}

/** A failed import is cached by React.lazy. Reloading the current document also
 * obtains the latest bundle URLs if an old deployment's chunks have expired. */
export function lazyRoute<Props extends object>(
  load: () => Promise<{ default: ComponentType<Props> }>,
) {
  return lazy(async () => {
    try {
      return await load();
    } catch (cause) {
      throw new RouteModuleError(
        cause instanceof Error ? cause.message : "Route module could not load",
        { cause },
      );
    }
  });
}

type BoundaryProps = {
  children: ReactNode;
  scope: "global" | "page";
  locationKey?: string;
};
type BoundaryState = { failed: boolean; error?: unknown; locationKey?: string };

export class RenderErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  public override state: BoundaryState = { failed: false };

  public static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState) {
    return props.locationKey !== state.locationKey
      ? { locationKey: props.locationKey, failed: false, error: undefined }
      : null;
  }

  public static getDerivedStateFromError(error: unknown) {
    return { failed: true, error };
  }

  public override componentDidCatch(error: Error) {
    reportClientError(this.props.scope, error);
  }

  private readonly retry = () => {
    if (this.state.error instanceof RouteModuleError) {
      window.location.reload();
      return;
    }
    this.setState({ failed: false, error: undefined });
  };

  public override render() {
    return this.state.failed ? (
      <FailureView scope={this.props.scope} retry={this.retry} />
    ) : (
      this.props.children
    );
  }
}

/** Clear a failed route on navigation without remounting healthy route state
 * when the viewer changes a filter or tab in the URL. */
export function PageErrorBoundary({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const location = useLocation();
  return (
    <RenderErrorBoundary scope="page" locationKey={location.key}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </RenderErrorBoundary>
  );
}

function FailureView({ scope, retry }: { scope: BoundaryProps["scope"]; retry: () => void }) {
  usePublicEntryReady(true);
  if (scope === "global") {
    return (
      <main
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          fontFamily: "var(--font-body, Georgia), serif",
          background: "var(--background, #faf9f5)",
          color: "var(--foreground, #252423)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Something went wrong</h1>
        <p style={{ margin: 0 }}>An unexpected error kept Betabook from loading.</p>
        <button
          type="button"
          onClick={retry}
          style={{
            padding: "0.5rem 1rem",
            border: "1px solid currentColor",
            color: "inherit",
            borderRadius: "0.5rem",
            background: "transparent",
            cursor: "pointer",
            font: "inherit",
          }}
        >
          Try again
        </button>
      </main>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <PageTitle>Something went wrong</PageTitle>
        <InlineAlert>
          An unexpected error kept this page from loading. It may be temporary — trying again often
          fixes it.
        </InlineAlert>
      </div>
      <div className="flex items-center gap-4">
        <Button onPress={retry}>Try again</Button>
        <AppLink href="/search">Find climbs</AppLink>
      </div>
    </div>
  );
}
