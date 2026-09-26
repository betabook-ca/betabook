"use client";

import { Button } from "@heroui/react";

import { InlineAlert } from "./inline-alert";

export function DeferredLoadError({
  feature,
  onRetry,
  onDismiss,
}: {
  feature: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-x-4 floating-panel-bottom z-50 mx-auto max-w-sm">
      <InlineAlert
        action={
          <>
            <Button size="sm" onPress={onRetry}>
              Try again
            </Button>
            <Button size="sm" variant="ghost" onPress={onDismiss}>
              Dismiss
            </Button>
          </>
        }
      >
        Couldn&apos;t load {feature}. Please try again.
      </InlineAlert>
    </div>
  );
}
