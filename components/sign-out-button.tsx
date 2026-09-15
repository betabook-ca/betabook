"use client";

import { Button } from "@heroui/react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { InlineAlert } from "@/components/ui/inline-alert";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({
  onSignOut,
  compact = false,
  iconOnly = false,
  className = "gap-2",
}: { onSignOut?: () => void; compact?: boolean; iconOnly?: boolean; className?: string } = {}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSignOut() {
    if (onSignOut) {
      onSignOut();
      return;
    }
    setError(null);
    setPending(true);
    void authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/");
          router.refresh();
        },
        onError: (ctx) => setError(ctx.error.message ?? "Sign out failed"),
        onResponse: () => setPending(false),
      },
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={compact ? "ghost" : "outline"}
        className={className}
        onPress={handleSignOut}
        isDisabled={pending}
      >
        <span className="flex size-6 shrink-0 items-center justify-center">
          <LogOut aria-hidden className="size-5" />
        </span>
        <span className={iconOnly ? "sr-only" : undefined}>Sign out</span>
      </Button>
      {error && <InlineAlert>{error}</InlineAlert>}
    </div>
  );
}
