"use client";

import { Button, Checkbox, Input, Label, TextField } from "@heroui/react";
import { useId, useState } from "react";

import { AuthDivider, ResendVerificationButton } from "@/components/auth-form-parts";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { useTurnstile } from "@/components/turnstile";
import { AppLink } from "@/components/ui/app-link";
import { FORM_CARD_CLASS } from "@/components/ui/card";
import { FieldFeedback } from "@/components/ui/field-support";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageTitle } from "@/components/ui/typography";
import { GENERIC_ERROR_MESSAGE } from "@/lib/action-result";
import { authClient } from "@/lib/auth-client";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/display-name";
import { profileShareFromPath } from "@/lib/profile-share";
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
  const agreementId = useId();
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

  const passwordMismatch = submitAttempted && password !== confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitAttempted(true);
    if (pending || !termsAccepted || !captcha.ready || password !== confirmPassword) return;
    setPending(true);
    try {
      await authClient.signUp.email(
        // The verification link lands back on sign-in, carrying the original
        // destination so the continuation survives sign-up → verify → sign-in.
        { name, email, password, callbackURL: signInUrl(nextPath) },
        {
          body: {
            acceptedTermsVersion: TERMS_VERSION,
            sharePath: profileShareFromPath(nextPath) ? nextPath : undefined,
          },
          headers: captcha.headers,
          onSuccess: () => setDone(true),
          onError: (ctx) => setError(ctx.error.message ?? "Sign up failed"),
          onResponse: () => {
            setPending(false);
            captcha.reset();
          },
        },
      );
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
      setPending(false);
      captcha.reset();
    }
  }

  if (done) {
    return (
      <div className={FORM_CARD_CLASS}>
        <PageTitle>Check your email</PageTitle>
        <InlineAlert status="success">
          We sent a verification link to {email}. Verify your address, then{" "}
          <AppLink href={signInUrl(nextPath)}>sign in</AppLink>.
        </InlineAlert>
        <ResendVerificationButton email={email} nextPath={nextPath} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={FORM_CARD_CLASS}>
      <PageTitle>Sign up</PageTitle>
      <div className="flex items-center gap-2 text-sm">
        <Checkbox
          id={agreementId}
          aria-labelledby={`${agreementId}-label`}
          isSelected={termsAccepted}
          onChange={setTermsAccepted}
          isDisabled={pending}
          isRequired
        >
          <Checkbox.Content>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
          </Checkbox.Content>
        </Checkbox>
        <span id={`${agreementId}-label`}>
          <label htmlFor={agreementId}>I agree to the </label>{" "}
          <AppLink
            href={termsHref()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline underline"
          >
            Terms of Service
          </AppLink>
        </span>
      </div>
      {googleEnabled && (
        <>
          <GoogleSignInButton
            nextPath={nextPath}
            onError={setError}
            disabled={pending || !termsAccepted}
          />
          <AuthDivider />
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
