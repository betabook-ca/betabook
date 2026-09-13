import { SITE_LOCKUP_ALT, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

type EmailLink = { href: string; label: string };

export type EmailTemplateOptions = {
  baseUrl: string;
  title: string;
  text: string;
  /** Only these application-generated URLs become links. Visitor text stays text. */
  links?: EmailLink[];
  /** Show a copyable URL beneath each HTML button. Plain text always retains URLs. */
  showLinkUrls?: boolean;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Email clients need inline styles, literal palette colors, and ordinary PNGs.
 * Keep these colors aligned with the ink/paper/primary tokens in globals.css.
 * The full About-page logo has a paper canvas so its lettering remains legible
 * when an inbox recolors the surrounding mail.
 */
export function renderEmail({
  baseUrl,
  title,
  text,
  links = [],
  showLinkUrls = true,
}: EmailTemplateOptions) {
  const base = escapeHtml(baseUrl.replace(/\/$/, ""));
  const body = text
    .replace(/\r\n?/g, "\n")
    .split("\n\n")
    .map((paragraph) => {
      const lines = paragraph.split("\n").map((line) => {
        const link = links.find(({ href }) => href === line);
        if (!link) return escapeHtml(line);
        const href = escapeHtml(link.href);
        const button = `<a href="${href}" style="display:inline-block;padding:12px 18px;background-color:#83ba73;color:#000000;font-weight:bold;text-decoration:underline;border-radius:12px;">${escapeHtml(link.label)}</a>`;
        return showLinkUrls
          ? `${button}<br><a href="${href}" style="font-size:12px;color:#000000;text-decoration:underline;word-break:break-all;">${href}</a>`
          : button;
      });
      return `<p style="margin:0 0 20px;overflow-wrap:anywhere;word-wrap:break-word;">${lines.join("<br>")}</p>`;
    })
    .join("");

  return {
    text,
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background-color:#eaf7ef;color:#000000;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#eaf7ef;"><tr><td align="center" style="padding:24px 16px;">
<!--[if mso]><table role="presentation" width="560"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;table-layout:fixed;"><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#000000;">
<a href="${base}" style="display:block;max-width:350px;margin:0 auto;"><img src="${base}/branding/betabook-lockup-email.png" alt="${SITE_LOCKUP_ALT}" width="350" height="224" style="display:block;width:100%;max-width:350px;height:auto;border:0;"></a>
<h1 style="margin:16px 0 24px;font-size:26px;line-height:1.25;overflow-wrap:anywhere;word-wrap:break-word;">${escapeHtml(title)}</h1>
${body}
<p style="margin:32px 0 0;font-size:12px;"><a href="${base}" style="color:#000000;">${SITE_NAME}</a> — ${SITE_TAGLINE}</p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`,
  };
}
