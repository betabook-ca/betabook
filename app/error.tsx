"use client"; // Error boundaries must be Client Components

import { Button } from "@heroui/react";
import { useEffect } from "react";

import { AppLink } from "@/components/ui/app-link";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageTitle } from "@/components/ui/typography";

/** Root error boundary — renders inside the root layout (header/footer stay),
 * catching render errors from every page. `retry()` re-fetches and re-renders
 * the failed segment, which is often enough for transient failures. */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
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
        <AppLink href="/">Search from the home page</AppLink>
      </div>
    </div>
  );
}
