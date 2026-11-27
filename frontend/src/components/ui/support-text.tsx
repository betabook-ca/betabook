import { SUPPORT_EMAIL } from "@/lib/support";

/** Links the support address to an email that carries the whole message. */
export function SupportText({ children, subject }: { children: string; subject: string }) {
  const index = children.indexOf(SUPPORT_EMAIL);
  if (index === -1) return children;
  const href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(children)}`;
  return (
    <>
      {children.slice(0, index)}
      <a href={href} className="link focus-visible:status-focused">
        {SUPPORT_EMAIL}
      </a>
      {children.slice(index + SUPPORT_EMAIL.length)}
    </>
  );
}
