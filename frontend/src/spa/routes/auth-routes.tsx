import { Button } from "@heroui/react";
import { useState } from "react";
import { Navigate, useSearchParams } from "react-router";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { SignInForm } from "@/components/auth/sign-in-form";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { TermsAcceptanceForm } from "@/components/terms/terms-acceptance-form";
import { AppLink } from "@/components/ui/app-link";
import { FORM_CARD_CLASS } from "@/components/ui/card";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageTitle } from "@/components/ui/typography";
import { formatAuthErrorMessage, safeNextPath, signInUrl } from "@/lib/sign-in-redirect";
import { CURRENT_TERMS_PROMPT } from "@/lib/terms";
import { acceptTermsUrl, termsNextPath } from "@/lib/terms-navigation";
import { fetchApi, type ApiResponse } from "@/spa/lib/api";
import { useRetainedPage } from "@/spa/lib/use-retained-page";

type AuthRouteKind = "sign-in" | "sign-up" | "forgot-password" | "reset-password" | "accept-terms";

function AuthRouteView({
  kind,
  viewerId,
  termsStatus,
}: {
  kind: AuthRouteKind;
  viewerId: string | null;
  termsStatus?: ApiResponse<"/api/terms/status"> | null;
}) {
  const [searchParams] = useSearchParams();
  if (kind === "sign-in" || kind === "sign-up" || kind === "forgot-password") {
    const next = safeNextPath(searchParams.get("next") ?? undefined);
    if (viewerId && kind !== "forgot-password") {
      return <Navigate to={next ?? `/users/${viewerId}`} replace />;
    }
    return <CredentialForm kind={kind} next={next} errorParam={searchParams.get("error")} />;
  }

  if (kind === "reset-password") {
    const token = searchParams.get("token");
    const error = searchParams.get("error");
    if (!token || error) {
      return (
        <div className={FORM_CARD_CLASS}>
          <PageTitle>Invalid reset link</PageTitle>
          <p className="text-sm text-muted">
            This password reset link is invalid or has expired.{" "}
            <AppLink href="/forgot-password">Request a new one</AppLink>.
          </p>
        </div>
      );
    }
    return <ResetPasswordForm token={token} />;
  }

  return (
    <AcceptTermsRoute
      viewerId={viewerId}
      termsStatus={termsStatus}
      next={termsNextPath(searchParams.get("next") ?? undefined)}
    />
  );
}

function CredentialForm({
  kind,
  next,
  errorParam,
}: {
  kind: "sign-in" | "sign-up" | "forgot-password";
  next?: string;
  errorParam: string | null;
}) {
  const [attempt, setAttempt] = useState(0);
  const { data: config, error } = useRetainedPage({
    resource: "auth-routes:CredentialForm",
    scope: "auth-config",
    query: String(attempt),
    load: (signal) => fetchApi("/api/config/auth", { signal }),
  });
  if (!config) {
    return (
      <div className={FORM_CARD_CLASS}>
        {error ? (
          <InlineAlert
            action={
              <Button size="sm" onPress={() => setAttempt((n) => n + 1)}>
                Retry
              </Button>
            }
          >
            Couldn’t load sign-in options.
          </InlineAlert>
        ) : (
          <p role="status">Loading sign-in options…</p>
        )}
      </div>
    );
  }
  if (kind === "forgot-password")
    return <ForgotPasswordForm turnstileSiteKey={config.turnstileSiteKey} />;
  if (kind === "sign-up") return <SignUpForm next={next} {...config} />;
  return (
    <SignInForm
      next={next}
      initialError={formatAuthErrorMessage(errorParam ?? undefined)}
      {...config}
    />
  );
}

function AcceptTermsRoute({
  viewerId,
  termsStatus,
  next,
}: {
  viewerId: string | null;
  termsStatus?: ApiResponse<"/api/terms/status"> | null;
  next: string;
}) {
  if (!viewerId) {
    return <Navigate to={signInUrl(acceptTermsUrl(next))} replace />;
  }
  if (termsStatus === undefined) {
    return null;
  }
  if (termsStatus && !termsStatus.required) {
    return <Navigate to={next} replace />;
  }
  const prompt = termsStatus ?? CURRENT_TERMS_PROMPT;
  return (
    <TermsAcceptanceForm
      version={prompt.version}
      versionLabel={prompt.versionLabel}
      previousVersion={prompt.previousVersion}
      next={next}
    />
  );
}

export default AuthRouteView;
