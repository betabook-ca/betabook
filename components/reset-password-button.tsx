"use client";

import { Button } from "@heroui/react";
import { KeyRound } from "lucide-react";
import { useEffect, useState } from "react";

import { useTurnstile } from "@/components/turnstile";
import { InlineAlert } from "@/components/ui/inline-alert";
import { authClient } from "@/lib/auth-client";

/** How long a successful send stays disabled before offering "Send again" —
 * long enough to stop reflex double-clicks from emailing twice, short enough
 * that a lost email isn't a dead end. */
const RESEND_COOLDOWN_MS = 30_000;

export function ResetPasswordButton({
  email,
  turnstileSiteKey,
}: {
  email: string;
  turnstileSiteKey?: string | null;
}) {
  const captcha = useTurnstile(turnstileSiteKey);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(false), RESEND_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function handleClick() {
    setError(null);
    setPending(true);
    void authClient.requestPasswordReset(
      { email, redirectTo: "/reset-password" },
      {
        headers: captcha.headers,
        onSuccess: () => {
          setSent(true);
          setCooldown(true);
        },
        onError: (ctx) => setError(ctx.error.message ?? "Could not send the reset email"),
        onResponse: () => {
          setPending(false);
          captcha.reset();
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {captcha.widget}
      <Button
        variant="outline"
        fullWidth
        className="gap-2"
        onPress={handleClick}
        isDisabled={pending || cooldown || !captcha.ready}
      >
        <KeyRound className="size-4" />
        {cooldown ? "Reset email sent" : sent ? "Send again" : "Reset password"}
      </Button>
      {error && <InlineAlert>{error}</InlineAlert>}
    </div>
  );
}
