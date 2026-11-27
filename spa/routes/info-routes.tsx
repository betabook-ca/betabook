import { useEffect, useState } from "react";
import { useParams } from "react-router";

import { ContactForm } from "@/components/contact-form";
import { ImportLandingPage } from "@/components/import-landing-page";
import { RunningCosts } from "@/components/running-costs";
import { TermsContent } from "@/components/terms-content";
import { AppLink } from "@/components/ui/app-link";
import { READING_MAX_WIDTH_CLASS } from "@/components/ui/layout";
import { PageTitle } from "@/components/ui/typography";
import type { CloudflareUsage } from "@/lib/running-costs";
import { SUPPORT_URL } from "@/lib/site";
import { TERMS_VERSIONS, termsHref } from "@/lib/terms";
import { fetchJson } from "@/spa/lib/fetch-json";
import AboutContent from "@/spa/routes/about-content";
import ClimbingLogbookContent from "@/spa/routes/logbook-content";

function Costs() {
  const [usage, setUsage] = useState<CloudflareUsage | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const data = await fetchJson<CloudflareUsage | null>("/api/public/usage", {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setUsage(data);
      } catch {
        // Fixed running costs remain visible when sampled usage is unavailable.
      }
    }
    void load();
    return () => controller.abort();
  }, []);
  return <RunningCosts usage={usage} supportUrl={SUPPORT_URL} />;
}

type InfoRouteKind =
  | "about"
  | "terms"
  | "terms-version"
  | "contact"
  | "climbing-logbook"
  | "kaya-import"
  | "sendage-import"
  | "mountain-project-import"
  | "costs";

function TermsRouteView({ versioned }: { versioned: boolean }) {
  const { version } = useParams<{ version?: string }>();
  const matched = versioned
    ? TERMS_VERSIONS.find((entry) => entry.version === version)
    : TERMS_VERSIONS[0];

  if (!matched) {
    return (
      <div className={`mx-auto flex w-full ${READING_MAX_WIDTH_CLASS} flex-col gap-4`}>
        <PageTitle>Terms version not found</PageTitle>
        <p className="text-sm text-muted">
          Return to the <AppLink href="/terms">current Terms of Service</AppLink>.
        </p>
      </div>
    );
  }

  return (
    <div className={`mx-auto flex w-full ${READING_MAX_WIDTH_CLASS} flex-col gap-6`}>
      <TermsContent version={matched.version} />
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

function InfoRouteView({ kind }: { kind: InfoRouteKind }) {
  if (kind === "about") {
    return <AboutContent />;
  }
  if (kind === "terms") {
    return <TermsRouteView versioned={false} />;
  }
  if (kind === "terms-version") {
    return <TermsRouteView versioned />;
  }
  if (kind === "contact") {
    return (
      <div className={`mx-auto flex w-full ${READING_MAX_WIDTH_CLASS} flex-col gap-4`}>
        <PageTitle>Contact us</PageTitle>
        <p className="text-lg leading-relaxed text-pretty text-muted">
          Found a climb with the wrong grade, an area in the wrong place, or something that plainly
          doesn’t work? Say so here.
        </p>
        <p className="leading-relaxed text-pretty">
          You don’t need an account. Leave an email to get a reply, or file it on the{" "}
          <a
            href="https://github.com/betabook-ca/betabook/issues"
            target="_blank"
            rel="noreferrer"
            className="link inline underline focus-visible:status-focused"
          >
            issue tracker
          </a>
          .
        </p>
        <ContactForm />
      </div>
    );
  }
  if (kind === "kaya-import") {
    return <ImportLandingPage source="kaya" />;
  }
  if (kind === "sendage-import") {
    return <ImportLandingPage source="sendage" />;
  }
  if (kind === "mountain-project-import") {
    return <ImportLandingPage source="mountainProject" />;
  }
  if (kind === "costs") {
    return (
      <div className={`mx-auto flex w-full ${READING_MAX_WIDTH_CLASS} flex-col gap-6`}>
        <div className="flex flex-col gap-3">
          <PageTitle>Cost transparency</PageTitle>
          <p className="text-lg leading-relaxed text-pretty text-muted">
            Betabook has no ads or fees. Its code runs on Cloudflare Workers and its data lives in
            Cloudflare D1, a SQL database.
          </p>
        </div>
        <Costs />
        <p className="text-sm leading-relaxed text-pretty text-muted">
          Usage comes from Cloudflare’s sampled analytics and refreshes hourly. Amounts are in US
          dollars.
        </p>
      </div>
    );
  }

  return <ClimbingLogbookContent />;
}

export default InfoRouteView;
