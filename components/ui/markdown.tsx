import { clsx } from "clsx";
import { Square, SquareCheck } from "lucide-react";
import type { ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

type HeadingLevel = 2 | 3 | 4;

const HEADING_CLASS = ["text-base font-semibold", "text-sm font-semibold"];

/** Only absolute http(s) and mailto links are kept. A relative path would
 * resolve against the page showing the text. */
function linkUrl(url: string): string {
  const safe = defaultUrlTransform(url);
  return /^(?:https?:\/\/|mailto:)/i.test(safe) ? safe : "";
}

function ExternalLink({ href, children }: { href?: string; children?: ReactNode }) {
  if (!href) return <>{children}</>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      className="link inline underline focus-visible:status-focused"
    >
      {children}
    </a>
  );
}

function heading(top: HeadingLevel, depth: number) {
  const Tag = `h${Math.min(top + depth, 6)}` as "h2";
  const className = HEADING_CLASS[Math.min(depth, HEADING_CLASS.length - 1)];
  return function Heading({ children }: { children?: ReactNode }) {
    return <Tag className={className}>{children}</Tag>;
  };
}

function componentsFor(top: HeadingLevel): Components {
  return {
    h1: heading(top, 0),
    h2: heading(top, 1),
    h3: heading(top, 2),
    h4: heading(top, 2),
    h5: heading(top, 2),
    h6: heading(top, 2),
    a: ({ href, children }) => <ExternalLink href={href}>{children}</ExternalLink>,
    // Images are rendered as links, not loaded. A remote image would expose
    // each viewer's IP address to its host.
    img: ({ src, alt }) => {
      const href = typeof src === "string" ? src : undefined;
      return <ExternalLink href={href}>{alt || href}</ExternalLink>;
    },
    ul: ({ className, children }) => (
      <ul
        className={clsx(
          "space-y-1",
          className?.includes("contains-task-list") ? "list-none" : "list-disc pl-5",
        )}
      >
        {children}
      </ul>
    ),
    ol: ({ start, children }) => (
      <ol start={start} className="list-decimal space-y-1 pl-5">
        {children}
      </ol>
    ),
    li: ({ className, children }) => (
      <li
        className={clsx(
          "[&>ol]:mt-1 [&>ul]:mt-1",
          // Leave room for the icon, so nested lists indent past it.
          className?.includes("task-list-item") && "relative pl-6",
        )}
      >
        {children}
      </li>
    ),
    // Uses an icon instead of a checkbox. A disabled input with no label fails
    // axe.
    input: ({ checked }) => {
      const Icon = checked ? SquareCheck : Square;
      return (
        <Icon
          role="img"
          aria-label={checked ? "Done" : "Not done"}
          className="absolute top-[0.2em] left-0 size-4 text-muted"
        />
      );
    },
    blockquote: ({ children }) => (
      <blockquote className="flex flex-col gap-3 border-l-2 border-border pl-3 text-muted">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="border-border" />,
    code: ({ children }) => (
      <code className="rounded-md bg-default px-1 font-sans text-[0.9em]">{children}</code>
    ),
    pre: ({ children }) => (
      <pre className="overflow-x-auto rounded-md bg-default p-3 font-sans [&>code]:bg-transparent [&>code]:p-0">
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">{children}</table>
      </div>
    ),
    th: ({ style, children }) => (
      <th style={style} className="border border-border px-2 py-1 font-semibold">
        {children}
      </th>
    ),
    td: ({ style, children }) => (
      <td style={style} className="border border-border px-2 py-1">
        {children}
      </td>
    ),
  };
}

const COMPONENTS: Record<HeadingLevel, Components> = {
  2: componentsFor(2),
  3: componentsFor(3),
  4: componentsFor(4),
};

const REMARK_PLUGINS = [remarkGfm, remarkBreaks];

/** The only renderer for user-written text. Raw HTML stays escaped and images
 * become links. Never add `rehype-raw`. */
export function Markdown({
  children,
  headingLevel = 3,
  className,
}: {
  children: string;
  /** Heading level to use for `#`, so headings nest under the page's own
   * heading. */
  headingLevel?: HeadingLevel;
  className?: string;
}) {
  return (
    // Uses block layout instead of a flex column, so text can wrap around a
    // floated element.
    <div className={clsx("space-y-3 text-sm leading-relaxed break-words", className)}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        components={COMPONENTS[headingLevel]}
        urlTransform={linkUrl}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
