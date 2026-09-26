import { TermsContent } from "@/components/terms-content";
import { AppLink } from "@/components/ui/app-link";
import { READING_MAX_WIDTH_CLASS } from "@/components/ui/layout";
import { pageMetadata } from "@/lib/seo";
import { TERMS_VERSIONS, termsHref } from "@/lib/terms";

export const metadata = pageMetadata({
  title: "Terms of Service",
  description: "Terms for using Betabook’s climbing logbook and community crag database.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <div className={`mx-auto flex w-full ${READING_MAX_WIDTH_CLASS} flex-col gap-6`}>
      <TermsContent />
      <nav aria-label="Published terms versions" className="flex flex-col gap-2 text-sm">
        <p>Published versions</p>
        {TERMS_VERSIONS.map((entry) => (
          <AppLink key={entry.version} href={termsHref(entry.version)}>
            {entry.label}
          </AppLink>
        ))}
      </nav>
    </div>
  );
}
