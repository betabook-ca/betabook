import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { getTurnstileSiteKey } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Forgot password",
  robots: { index: false },
};

export default async function ForgotPasswordPage() {
  return <ForgotPasswordForm turnstileSiteKey={await getTurnstileSiteKey()} />;
}
