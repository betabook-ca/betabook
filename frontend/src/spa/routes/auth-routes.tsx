import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router";

import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { SignInForm } from "@/components/sign-in-form";
import { SignUpForm } from "@/components/sign-up-form";
import { TermsAcceptanceForm } from "@/components/terms-acceptance-form";
import { AppLink } from "@/components/ui/app-link";
import { FORM_CARD_CLASS } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/typography";
import { formatAuthErrorMessage, safeNextPath, signInUrl } from "@/lib/sign-in-redirect";
import { CURRENT_TERMS_PROMPT } from "@/lib/terms";
import { acceptTermsUrl, termsNextPath } from "@/lib/terms-navigation";
import { fetchApi, type ApiResponse } from "@/spa/lib/api";
import type { AuthConfig } from "@/spa/lib/fetch-json";

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
  const [config, setConfig] = useState<AuthConfig>({
    googleEnabled: false,
    turnstileSiteKey: null,
  });
  const needsAuthConfig = kind === "sign-in" || kind === "sign-up" || kind === "forgot-password";

  useEffect(() => {
    if (!needsAuthConfig) {
      return;
    }
    let cancelled = false;
    async function loadConfig() {
      try {
        const res = await fetchApi("/api/config/auth", {});
        if (!cancelled) {
          setConfig(res);
        }
      } catch {
        // Leave Google OAuth / Turnstile disabled on config read failure.
      }
    }
    void loadConfig();
    return () => {
      cancelled = true;
    };
  }, [needsAuthConfig]);

  if (kind === "sign-in") {
    const nextPath = safeNextPath(searchParams.get("next") ?? undefined);
    if (viewerId) {
      return <Navigate to={nextPath ?? `/users/${viewerId}`} replace />;
    }
    const initialError = formatAuthErrorMessage(searchParams.get("error") ?? undefined);
    return (
      <SignInForm
        next={nextPath}
        googleEnabled={config.googleEnabled}
        initialError={initialError}
        turnstileSiteKey={config.turnstileSiteKey}
      />
    );
  }

  if (kind === "sign-up") {
    const nextPath = safeNextPath(searchParams.get("next") ?? undefined);
    if (viewerId) {
      return <Navigate to={nextPath ?? `/users/${viewerId}`} replace />;
    }
    return (
      <SignUpForm
        next={nextPath}
        googleEnabled={config.googleEnabled}
        turnstileSiteKey={config.turnstileSiteKey}
      />
    );
  }

  if (kind === "forgot-password") {
    return <ForgotPasswordForm turnstileSiteKey={config.turnstileSiteKey} />;
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
