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
import { TERMS_UPDATED_LABEL, TERMS_VERSION } from "@/lib/terms";
import { acceptTermsUrl, termsNextPath } from "@/lib/terms-navigation";
import { fetchJson, type AuthConfig } from "@/spa/lib/fetch-json";

type AuthRouteKind = "sign-in" | "sign-up" | "forgot-password" | "reset-password" | "accept-terms";

function AuthRouteView({ kind, viewerId }: { kind: AuthRouteKind; viewerId: string | null }) {
  const [searchParams] = useSearchParams();
  const [config, setConfig] = useState<AuthConfig>({
    googleEnabled: false,
    turnstileSiteKey: null,
  });
  const [termsStatus, setTermsStatus] = useState<{
    checkedFor: string | null;
    required: boolean;
    version: string;
    versionLabel: string;
    previousVersion: string | null;
  }>({
    checkedFor: null,
    required: false,
    version: TERMS_VERSION,
    versionLabel: TERMS_UPDATED_LABEL,
    previousVersion: null,
  });

  const needsAuthConfig = kind === "sign-in" || kind === "sign-up" || kind === "forgot-password";

  useEffect(() => {
    if (!needsAuthConfig) {
      return;
    }
    let cancelled = false;
    async function loadConfig() {
      try {
        const res = await fetchJson<AuthConfig>("/api/config/auth");
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

  useEffect(() => {
    if (kind !== "accept-terms" || !viewerId) {
      return;
    }
    const targetViewer = viewerId;
    let cancelled = false;
    async function loadTerms() {
      try {
        const res = await fetchJson<{
          required?: boolean;
          version?: string;
          versionLabel?: string;
          previousVersion?: string | null;
        }>("/api/terms/status");
        if (!cancelled) {
          setTermsStatus({
            checkedFor: targetViewer,
            required: res.required === true,
            version: res.version ?? TERMS_VERSION,
            versionLabel: res.versionLabel ?? TERMS_UPDATED_LABEL,
            previousVersion: res.previousVersion ?? null,
          });
        }
      } catch {
        if (!cancelled) {
          setTermsStatus((current) => ({ ...current, checkedFor: targetViewer, required: true }));
        }
      }
    }
    void loadTerms();
    return () => {
      cancelled = true;
    };
  }, [kind, viewerId]);

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

  const next = termsNextPath(searchParams.get("next") ?? undefined);
  if (!viewerId) {
    return <Navigate to={signInUrl(acceptTermsUrl(next))} replace />;
  }
  if (termsStatus.checkedFor !== viewerId) {
    return null;
  }
  if (!termsStatus.required) {
    return <Navigate to={next} replace />;
  }
  return (
    <TermsAcceptanceForm
      version={termsStatus.version}
      versionLabel={termsStatus.versionLabel}
      previousVersion={termsStatus.previousVersion}
      next={next}
    />
  );
}

export default AuthRouteView;
