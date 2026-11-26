/* oxlint-disable nextjs/no-html-link-for-pages -- These documents support navigation without client JavaScript. */
import { buttonVariants } from "@heroui/styles";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";

import { SidebarLayout } from "@/components/app-sidebar";
import { Brand } from "@/components/brand";
import { HomeIntroduction } from "@/components/home-introduction";
import { TermsContent } from "@/components/terms-content";
import { CARD_PADDING } from "@/components/ui/card";
import { FIELD_CLASS, FIELD_HEIGHT_CLASS, FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { PAGE_MAX_WIDTH_CLASS } from "@/components/ui/layout";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import { TERMS_VERSIONS, termsHref, type TermsVersion } from "@/lib/terms";
import AboutContent from "@/spa/routes/about-content";
import LogbookContent from "@/spa/routes/logbook-content";

const buildYear = new Date().getUTCFullYear();

function PublicFrame({
  children,
  progressive = false,
}: {
  children: ReactNode;
  progressive?: boolean;
}) {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border bg-background/95">
        <div className="mx-auto grid h-14 w-full max-w-5xl grid-cols-[1fr_minmax(12rem,1fr)_1fr] items-center gap-2 px-4">
          <div>
            <a
              href="/"
              aria-label="Betabook home"
              className="hidden h-10 items-center gap-2 md:inline-flex"
            >
              <Brand decorative className="size-6" />
              <Brand variant="wordmark" decorative className="w-24" />
            </a>
          </div>
          <a
            href="/search"
            aria-label="Search"
            className="flex h-11 items-center justify-center gap-2 rounded-full border border-border px-3 md:h-10"
          >
            <span className="md:hidden">
              <Brand decorative className="size-6" />
            </span>
            Search
          </a>
          <a href="/sign-in" className="justify-self-end">
            Sign in
          </a>
        </div>
      </header>
      <main
        id="main"
        className={progressive ? "flex-1 p-4 md:pt-2" : "mx-auto w-full max-w-5xl flex-1 px-4 py-6"}
      >
        {progressive ? (
          <div className={`mx-auto w-full ${PAGE_MAX_WIDTH_CLASS}`}>{children}</div>
        ) : (
          children
        )}
      </main>
      <footer className="border-t border-border p-4 text-sm text-muted">
        <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-4">
          <span>
            © {buildYear} {SITE_NAME} — <span className="whitespace-nowrap">{SITE_TAGLINE}</span>
          </span>
          <nav aria-label="Footer" className="flex gap-4">
            <a href="/about">About</a>
            <a href="/climbing-logbook">Features</a>
            <a href="/contact">Contact us</a>
            <a href="/terms">Terms of Service</a>
          </nav>
        </div>
      </footer>
    </>
  );
}

function TermsDocument({ version }: { version: TermsVersion }) {
  return (
    <div className="mx-auto flex max-w-prose flex-col gap-6">
      <TermsContent version={version} />
      <nav aria-label="Published terms versions">
        Published versions{" "}
        {TERMS_VERSIONS.map((item) => (
          <a key={item.version} href={termsHref(item.version)}>
            {item.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

function HomeEntry() {
  return (
    <div className={`flex flex-col gap-6 ${CARD_PADDING.fluid}`}>
      <HomeIntroduction />
      <form
        action="/search"
        method="get"
        role="search"
        className="flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="mode" value="all" />
        <input
          type="search"
          name="name"
          aria-label="Search Betabook"
          placeholder="Search climbs, areas, and climbers…"
          className={`${FIELD_CLASS} ${FIELD_HEIGHT_CLASS} ${FIELD_WIDTH_CLASS.long}`}
        />
        <button type="submit" className={buttonVariants({ variant: "outline" })}>
          Search
        </button>
      </form>
    </div>
  );
}

export function publicEntry(home: boolean) {
  return renderToStaticMarkup(
    <StaticRouter location={home ? "/" : "/search"}>
      <div id="public-entry" className="flex min-h-full flex-1 flex-col">
        <SidebarLayout account={null} showToggle={false}>
          <PublicFrame progressive>
            {home ? <HomeEntry /> : "BETABOOK_PUBLIC_BODY_SLOT"}
          </PublicFrame>
        </SidebarLayout>
      </div>
    </StaticRouter>,
  ).replace("BETABOOK_PUBLIC_BODY_SLOT", "<!--BETABOOK_PUBLIC_BODY-->");
}

export function staticDocuments() {
  function render(path: string, children: ReactNode) {
    return renderToStaticMarkup(
      <StaticRouter location={path}>
        <PublicFrame>{children}</PublicFrame>
      </StaticRouter>,
    );
  }
  return Object.fromEntries([
    ["about", render("/about", <AboutContent />)],
    ["climbing-logbook", render("/climbing-logbook", <LogbookContent />)],
    ...TERMS_VERSIONS.map(({ version }) => [
      "terms-" + version,
      render(termsHref(version), <TermsDocument version={version} />),
    ]),
  ]);
}
