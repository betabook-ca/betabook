import type { Metadata } from "next";

import { ResetPasswordForm } from "@/components/reset-password-form";
import { AppLink } from "@/components/ui/app-link";
import { FORM_CARD_CLASS } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/typography";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  // better-auth's emailed link runs through /api/auth/reset-password/:token,
  // which validates the token server-side and redirects here with ?token=…
  // when it's good or ?error=INVALID_TOKEN when it's not — that redirect is
  // the cheap validation, so no extra API call is needed. Without a token
  // (or with an error) the form below can never succeed; dead-end the link
  // up front instead of after the user has typed a new password twice.
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
