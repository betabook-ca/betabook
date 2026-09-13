"use client";

import { Button, Checkbox, Input, Label, TextField } from "@heroui/react";
import { useState } from "react";

import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { useTurnstile } from "@/components/turnstile";
import { AppLink } from "@/components/ui/app-link";
import { FORM_CARD_CLASS } from "@/components/ui/card";
import { FieldFeedback } from "@/components/ui/field-support";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageTitle } from "@/components/ui/typography";
import { authClient } from "@/lib/auth-client";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/display-name";
import { safeNextPath, signInUrl } from "@/lib/sign-in-redirect";
import { TERMS_VERSION, termsHref } from "@/lib/terms";

export function SignUpForm({
  next,
  googleEnabled = false,
  turnstileSiteKey,
}: {
  next?: string;
  googleEnabled?: boolean;
  turnstileSiteKey?: string | null;
}) {
  // The page already validates the param, but re-validate the prop here so
  // the form can never be handed an off-origin destination.
  const nextPath = safeNextPath(next);
  const captcha = useTurnstile(turnstileSiteKey);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [done, setDone] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendPending, setResendPending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  const passwordMismatch = submitAttempted && password !== confirmPassword;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitAttempted(true);
    if (pending || !termsAccepted || !captcha.ready || password !== confirmPassword) return;
    setPending(true);
    void authClient.signUp.email(
      // The verification link lands back on sign-in, carrying the original
      // destination so the continuation survives sign-up → verify → sign-in.
      { name, email, password, callbackURL: signInUrl(nextPath) },
      {
        body: { acceptedTermsVersion: TERMS_VERSION },
        headers: captcha.headers,
        onSuccess: () => setDone(true),
        onError: (ctx) => setError(ctx.error.message ?? "Sign up failed"),
        onResponse: () => {
          setPending(false);
          captcha.reset();
        },
      },
    );
  }

  // Bound to the just-registered address; same better-auth call (and the
  // same land-back-on-sign-in callback) as the sign-in form's resend.
  function resendVerification() {
    setResent(false);
    setResendError(null);
    setResendPending(true);
    void authClient.sendVerificationEmail(
      { email, callbackURL: signInUrl(nextPath) },
      {
        onSuccess: () => setResent(true),
        onError: (ctx) =>
          setResendError(ctx.error.message ?? "Could not resend the verification email"),
        onResponse: () => setResendPending(false),
      },
    );
  }

  if (done) {
    return (
      <div className={FORM_CARD_CLASS}>
        <PageTitle>Check your email</PageTitle>
        <InlineAlert status="success">
          We sent a verification link to {email}. Verify your address, then{" "}
          <AppLink href={signInUrl(nextPath)}>sign in</AppLink>.
        </InlineAlert>
        <Button variant="ghost" onPress={resendVerification} isDisabled={resent || resendPending}>
          {resent ? "Verification email sent" : "Resend verification email"}
        </Button>
        {resendError && <InlineAlert>{resendError}</InlineAlert>}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={FORM_CARD_CLASS}>
      <PageTitle>Sign up</PageTitle>
      <div className="flex flex-col gap-2 text-sm">
        <Checkbox
          isSelected={termsAccepted}
          onChange={setTermsAccepted}
          isDisabled={pending}
          isRequired
        >
          <Checkbox.Content>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            I agree to the Terms of Service
          </Checkbox.Content>
        </Checkbox>
        <AppLink
          href={termsHref()}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm underline"
        >
          Read the Terms of Service
        </AppLink>
      </div>
      {googleEnabled && (
        <>
          <GoogleSignInButton
            nextPath={nextPath}
            onError={setError}
            disabled={pending || !termsAccepted}
          />
          <div className="relative flex items-center py-1">
            <div className="grow border-t border-separator" />
            <span className="mx-3 shrink text-xs text-muted uppercase">or</span>
            <div className="grow border-t border-separator" />
          </div>
        </>
      )}
      <TextField value={name} onChange={setName} isRequired maxLength={MAX_DISPLAY_NAME_LENGTH}>
        <Label>Display name</Label>
        <Input placeholder="How you'll appear to other climbers" />
      </TextField>
      <TextField value={email} onChange={setEmail} type="email" isRequired>
        <Label>Email</Label>
        <Input placeholder="you@example.com" />
      </TextField>
      <TextField value={password} onChange={setPassword} type="password" isRequired>
        <Label>Password</Label>
        <Input />
      </TextField>
      <TextField
        value={confirmPassword}
        onChange={setConfirmPassword}
        type="password"
        isRequired
        isInvalid={passwordMismatch}
      >
        <Label>Confirm password</Label>
        <Input />
        <FieldFeedback error={passwordMismatch ? "Passwords do not match." : null} />
      </TextField>
      {error && <InlineAlert>{error}</InlineAlert>}
      {captcha.widget}
      <Button type="submit" fullWidth isDisabled={pending || !termsAccepted || !captcha.ready}>
        Sign up
      </Button>
      <p className="text-sm text-muted">
        Already have an account? <AppLink href={signInUrl(nextPath)}>Sign in</AppLink>
      </p>
    </form>
  );
}
