"use client"; // Error boundaries must be Client Components

import { Button } from "@heroui/react";
import { useEffect } from "react";

import { AppLink } from "@/components/ui/app-link";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageTitle } from "@/components/ui/typography";
import { reportClientError } from "@/lib/client-error-report";

/** Root error boundary — renders inside the root layout (header/footer stay),
 * catching render errors from every page. `retry()` re-fetches and re-renders
 * the failed segment, which is often enough for transient failures. Every
 * render reports the error, so the server logs it even when production hid
 * the message behind a digest. */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
    reportClientError("page", error);
  }, [error]);

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
        <Button onPress={() => retry()}>Try again</Button>
        <AppLink href="/search">Find climbs</AppLink>
      </div>
    </div>
  );
}
