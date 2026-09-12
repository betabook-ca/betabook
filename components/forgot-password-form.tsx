"use client";

import { Button, Input, Label, TextField } from "@heroui/react";
import { useState } from "react";

import { useTurnstile } from "@/components/turnstile";
import { AppLink } from "@/components/ui/app-link";
import { FORM_CARD_CLASS } from "@/components/ui/card";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageTitle } from "@/components/ui/typography";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm({ turnstileSiteKey }: { turnstileSiteKey?: string | null }) {
  const captcha = useTurnstile(turnstileSiteKey);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    void authClient.requestPasswordReset(
      { email, redirectTo: "/reset-password" },
      {
        headers: captcha.headers,
        onSuccess: () => setDone(true),
        onError: (ctx) => setError(ctx.error.message ?? "Request failed"),
        onResponse: () => {
          setPending(false);
          captcha.reset();
        },
      },
    );
  }

  if (done) {
    return (
      <div className={FORM_CARD_CLASS}>
        <PageTitle>Check your email</PageTitle>
        <InlineAlert status="success">
          If an account exists for {email}, we sent a link to reset your password.{" "}
          <AppLink href="/sign-in">Back to sign in</AppLink>.
        </InlineAlert>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={FORM_CARD_CLASS}>
      <PageTitle>Forgot password</PageTitle>
      <p className="text-sm text-muted">
        Enter your email and we&apos;ll send you a link to reset your password.
      </p>
      <TextField value={email} onChange={setEmail} type="email" isRequired>
        <Label>Email</Label>
        <Input placeholder="you@example.com" />
      </TextField>
      {error && <InlineAlert>{error}</InlineAlert>}
      {captcha.widget}
      <Button type="submit" fullWidth isDisabled={pending || !captcha.ready}>
        Send reset link
      </Button>
      <p className="text-sm text-muted">
        Remembered your password? <AppLink href="/sign-in">Sign in</AppLink>
      </p>
    </form>
  );
}
