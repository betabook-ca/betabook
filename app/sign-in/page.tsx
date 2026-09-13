import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/sign-in-form";
import { getTurnstileSiteKey, isGoogleOAuthEnabled } from "@/lib/auth";
import { getMemberSession as getSession } from "@/lib/session";
import { formatAuthErrorMessage, safeNextPath } from "@/lib/sign-in-redirect";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const session = await getSession();
  const { next, error } = await searchParams;
  const nextPath = safeNextPath(next);
  if (session) {
    redirect(nextPath ?? `/users/${session.user.id}`);
  }
  const googleEnabled = await isGoogleOAuthEnabled();
  const turnstileSiteKey = await getTurnstileSiteKey();
  const initialError = formatAuthErrorMessage(error);
  return (
    <SignInForm
      next={nextPath}
      googleEnabled={googleEnabled}
      initialError={initialError}
      turnstileSiteKey={turnstileSiteKey}
    />
  );
}
