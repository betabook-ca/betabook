import { notFound } from "next/navigation";

import { TermsContent } from "@/components/terms-content";
import { AppLink } from "@/components/ui/app-link";
import { pageMetadata } from "@/lib/seo";
import { getTermsVersion, TERMS_VERSIONS, termsHref } from "@/lib/terms";

// Only published versions are archive routes; all others use Next's not-found response.
export const dynamicParams = false;

export function generateStaticParams() {
  return TERMS_VERSIONS.map(({ version }) => ({ version }));
}

export async function generateMetadata({ params }: { params: Promise<{ version: string }> }) {
  const entry = getTermsVersion((await params).version);
  if (!entry) notFound();
  return pageMetadata({
    title: `Terms of Service · ${entry.label}`,
    description: `Betabook terms published ${entry.label}.`,
    path: termsHref(entry.version),
  });
}

export default async function ArchivedTermsPage({
  params,
}: {
  params: Promise<{ version: string }>;
}) {
  const entry = getTermsVersion((await params).version);
  if (!entry) notFound();
  return (
    <div className="flex flex-col gap-6">
      <TermsContent version={entry.version} />
      <div className="mx-auto w-full max-w-2xl">
        <AppLink href="/terms">Current terms and published versions</AppLink>
      </div>
    </div>
  );
}
