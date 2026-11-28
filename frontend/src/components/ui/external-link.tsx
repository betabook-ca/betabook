import type { ReactNode } from "react";

/** A link off the site, opened in a new tab. Underlined inside running text,
 * where color alone wouldn't set it apart (WCAG 1.4.1). Use AppLink for
 * anything the app routes itself. `rel` adds to `noreferrer`, e.g.
 * "nofollow ugc" for links people wrote. */
export function ExternalLink({
  href,
  rel,
  children,
}: {
  href: string;
  rel?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel={rel ? `noopener noreferrer ${rel}` : "noreferrer"}
      className="link inline underline focus-visible:status-focused"
    >
      {children}
    </a>
  );
}
