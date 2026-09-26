"use client";

import { Button } from "@heroui/react";
import { useState } from "react";

import { InlineAlert } from "@/components/ui/inline-alert";
import { GENERIC_ERROR_MESSAGE } from "@/lib/action-result";
import { authClient } from "@/lib/auth-client";
import { signInUrl } from "@/lib/sign-in-redirect";

export function AuthDivider() {
  return (
    <div className="relative flex items-center py-1">
      <div className="grow border-t border-separator" />
      <span className="mx-3 shrink text-xs text-muted uppercase">or</span>
      <div className="grow border-t border-separator" />
    </div>
  );
}

/** Resends the verification email for `email`. The link lands back on sign-in
 * with the continuation kept. */
export function ResendVerificationButton({
  email,
  nextPath,
}: {
  email: string;
  nextPath?: string;
}) {
  const [resent, setResent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setResent(false);
    setError(null);
    setPending(true);
    try {
      await authClient.sendVerificationEmail(
        { email, callbackURL: signInUrl(nextPath) },
        {
          onSuccess: () => setResent(true),
          onError: (ctx) =>
            setError(ctx.error.message ?? "Couldn't resend the verification email."),
          onResponse: () => setPending(false),
        },
      );
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="ghost" onPress={resend} isDisabled={resent || pending}>
        {resent ? "Verification email sent" : "Resend verification email"}
      </Button>
      {error && <InlineAlert>{error}</InlineAlert>}
    </>
  );
}
