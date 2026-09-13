"use client";

import { Button, Input, Label, TextField } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { useTurnstile } from "@/components/turnstile";
import { AppLink } from "@/components/ui/app-link";
import { FORM_CARD_CLASS } from "@/components/ui/card";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageTitle } from "@/components/ui/typography";
import { authClient } from "@/lib/auth-client";
import { DEFAULT_SIGNED_IN_PATH, safeNextPath, signInUrl, signUpUrl } from "@/lib/sign-in-redirect";
import { termsHref } from "@/lib/terms";

export function SignInForm({
  next,
  googleEnabled = false,
  initialError,
  turnstileSiteKey,
}: {
  next?: string;
  googleEnabled?: boolean;
  initialError?: string | null;
  turnstileSiteKey?: string | null;
}) {
  const router = useRouter();
  // The page already validates the param, but re-validate the prop here so
  // the form can never be handed an off-origin destination.
  const nextPath = safeNextPath(next);
  const captcha = useTurnstile(turnstileSiteKey);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  // The address an unverified-login error came back for. The resend
  // affordance is bound to this, not to whatever is currently typed in the
  // email field.
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [resendPending, setResendPending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const attemptedEmail = email;
    setError(null);
    setUnverifiedEmail(null);
    setResent(false);
    setResendError(null);
    setPending(true);
    void authClient.signIn.email(
      { email: attemptedEmail, password },
      {
        headers: captcha.headers,
        onSuccess: (ctx) => {
          const userDestination =
            ctx.data && typeof ctx.data === "object" && "user" in ctx.data && ctx.data.user
              ? `/users/${(ctx.data.user as { id: string }).id}`
              : DEFAULT_SIGNED_IN_PATH;
          router.push(nextPath ?? userDestination);
        },
        onError: (ctx) => {
          // A failed captcha is also a 403.
          if (ctx.error.code === "EMAIL_NOT_VERIFIED") {
            setUnverifiedEmail(attemptedEmail);
          } else {
            setError(ctx.error.message ?? "Sign in failed");
          }
        },
        onResponse: () => {
          setPending(false);
          captcha.reset();
        },
      },
    );
  }

  function handleEmailChange(value: string) {
    setEmail(value);
    // The unverified prompt refers to the attempted address; once the field
    // is edited it no longer applies.
    if (unverifiedEmail !== null) {
      setUnverifiedEmail(null);
      setResent(false);
      setResendError(null);
    }
  }

  function resendVerification() {
    if (!unverifiedEmail) return;
    setResent(false);
    setResendError(null);
    setResendPending(true);
    void authClient.sendVerificationEmail(
      // After the verification link is clicked, land back on this sign-in
      // URL, continuation included.
      { email: unverifiedEmail, callbackURL: signInUrl(nextPath) },
      {
        onSuccess: () => setResent(true),
        onError: (ctx) =>
          setResendError(ctx.error.message ?? "Could not resend the verification email"),
        onResponse: () => setResendPending(false),
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className={FORM_CARD_CLASS}>
      <PageTitle>Sign in</PageTitle>
      {googleEnabled && (
        <>
          <p className="text-sm text-muted">
            By continuing with Google, you agree to the{" "}
            <AppLink
              href={termsHref()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline underline"
            >
              Terms of Service
            </AppLink>
            .
          </p>
          <GoogleSignInButton nextPath={nextPath} onError={setError} disabled={pending} />
          <div className="relative flex items-center py-1">
            <div className="grow border-t border-separator" />
            <span className="mx-3 shrink text-xs text-muted uppercase">or</span>
            <div className="grow border-t border-separator" />
          </div>
        </>
      )}
      <TextField value={email} onChange={handleEmailChange} type="email" isRequired>
        <Label>Email</Label>
        <Input placeholder="you@example.com" />
      </TextField>
      <TextField value={password} onChange={setPassword} type="password" isRequired>
        <Label>Password</Label>
        <Input />
      </TextField>
      <AppLink href="/forgot-password" className="text-sm text-muted">
        Forgot password?
      </AppLink>
      {error && <InlineAlert>{error}</InlineAlert>}
      {unverifiedEmail !== null && (
        <div className="flex flex-col gap-2">
          <InlineAlert status="warning">
            Please verify your email address before signing in.
          </InlineAlert>
          <Button variant="ghost" onPress={resendVerification} isDisabled={resent || resendPending}>
            {resent ? "Verification email sent" : "Resend verification email"}
          </Button>
          {resendError && <InlineAlert>{resendError}</InlineAlert>}
        </div>
      )}
      {captcha.widget}
      <Button type="submit" fullWidth isDisabled={pending || !captcha.ready}>
        Sign in
      </Button>
      <p className="text-sm text-muted">
        Don&apos;t have an account? <AppLink href={signUpUrl(nextPath)}>Sign up</AppLink>
      </p>
    </form>
  );
}
