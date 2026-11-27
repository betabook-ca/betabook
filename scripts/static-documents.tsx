/* oxlint-disable nextjs/no-html-link-for-pages -- These documents support navigation without client JavaScript. */
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";

import { Brand } from "@/components/brand";
import { TermsContent } from "@/components/terms-content";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import { TERMS_VERSIONS, termsHref, type TermsVersion } from "@/lib/terms";
import AboutContent from "@/spa/routes/about-content";

const buildYear = new Date().getUTCFullYear();

function StaticDocument({ version }: { version?: TermsVersion }) {
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
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {version ? (
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
        ) : (
          <AboutContent />
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

export function staticDocuments() {
  return Object.fromEntries([
    [
      "about",
      renderToStaticMarkup(
        <StaticRouter location="/about">
          <StaticDocument />
        </StaticRouter>,
      ),
    ],
    ...TERMS_VERSIONS.map(({ version }) => [
      "terms-" + version,
      renderToStaticMarkup(
        <StaticRouter location={termsHref(version)}>
          <StaticDocument version={version} />
        </StaticRouter>,
      ),
    ]),
  ]);
}
