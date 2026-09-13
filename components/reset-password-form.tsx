"use client";

import { Button, Input, Label, TextField } from "@heroui/react";
import { useState } from "react";

import { AppLink } from "@/components/ui/app-link";
import { FORM_CARD_CLASS } from "@/components/ui/card";
import { FieldFeedback } from "@/components/ui/field-support";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageTitle } from "@/components/ui/typography";
import { authClient } from "@/lib/auth-client";

// The page only renders this form when a token is present (missing/invalid
// links get a dead-end state there), so the prop is required. The token can
// still expire between page load and submit — resetPassword's onError
// surfaces that.
export function ResetPasswordForm({ token }: { token: string }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [done, setDone] = useState(false);

  const passwordMismatch = submitAttempted && newPassword !== confirmPassword;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitAttempted(true);
    if (newPassword !== confirmPassword) return;
    setPending(true);
    void authClient.resetPassword(
      { newPassword, token },
      {
        onSuccess: () => setDone(true),
        onError: (ctx) => setError(ctx.error.message ?? "Reset failed"),
        onResponse: () => setPending(false),
      },
    );
  }

  if (done) {
    return (
      <div className={FORM_CARD_CLASS}>
        <PageTitle>Password reset</PageTitle>
        <InlineAlert status="success">
          Your password has been reset. <AppLink href="/sign-in">Sign in</AppLink> with your new
          password.
        </InlineAlert>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={FORM_CARD_CLASS}>
      <PageTitle>Reset password</PageTitle>
      <TextField value={newPassword} onChange={setNewPassword} type="password" isRequired>
        <Label>New password</Label>
        <Input />
      </TextField>
      <TextField
        value={confirmPassword}
        onChange={setConfirmPassword}
        type="password"
        isRequired
        isInvalid={passwordMismatch}
      >
        <Label>Confirm new password</Label>
        <Input />
        <FieldFeedback error={passwordMismatch ? "Passwords do not match." : null} />
      </TextField>
      {error && <InlineAlert>{error}</InlineAlert>}
      <Button type="submit" fullWidth isDisabled={pending}>
        Reset password
      </Button>
    </form>
  );
}
