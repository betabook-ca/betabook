use crate::seo::escape_html;
use crate::site::{
    PALETTE_INK, PALETTE_PAPER, PALETTE_PRIMARY, SITE_LOCKUP_ALT, SITE_NAME, SITE_TAGLINE,
};

pub struct EmailLink<'a> {
    pub href: &'a str,
    pub label: &'a str,
}

pub struct RenderedEmail {
    pub text: String,
    pub html: String,
}

pub fn render_email(
    base_url: &str,
    title: &str,
    text: &str,
    links: &[EmailLink<'_>],
    show_link_urls: bool,
) -> RenderedEmail {
    let base = escape_html(base_url.trim_end_matches('/'));
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    let body: String = normalized
        .split("\n\n")
        .map(|paragraph| {
            let lines: Vec<String> = paragraph
                .split('\n')
                .map(|line| {
                    if let Some(link) = links.iter().find(|l| l.href == line) {
                        let href = escape_html(link.href);
                        let button = format!(
                            "<a href=\"{href}\" style=\"display:inline-block;padding:12px 18px;background-color:{PALETTE_PRIMARY};color:{PALETTE_INK};font-weight:bold;text-decoration:underline;border-radius:12px;\">{}</a>",
                            escape_html(link.label)
                        );
                        if show_link_urls {
                            format!(
                                "{button}<br><a href=\"{href}\" style=\"font-size:12px;color:{PALETTE_INK};text-decoration:underline;word-break:break-all;\">{href}</a>"
                            )
                        } else {
                            button
                        }
                    } else {
                        escape_html(line)
                    }
                })
                .collect();
            format!(
                "<p style=\"margin:0 0 20px;overflow-wrap:anywhere;word-wrap:break-word;\">{}</p>",
                lines.join("<br>")
            )
        })
        .collect();

    let escaped_title = escape_html(title);
    let html = format!(
        "<!DOCTYPE html>
<html lang=\"en\">
<head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>{escaped_title}</title></head>
<body style=\"margin:0;padding:0;background-color:{PALETTE_PAPER};color:{PALETTE_INK};\">
<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"background-color:{PALETTE_PAPER};\"><tr><td align=\"center\" style=\"padding:24px 16px;\">
<!--[if mso]><table role=\"presentation\" width=\"560\"><tr><td><![endif]-->
<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"max-width:560px;table-layout:fixed;\"><tr><td style=\"font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:{PALETTE_INK};\">
<a href=\"{base}\" style=\"display:block;max-width:350px;margin:0 auto;\"><img src=\"{base}/branding/betabook-lockup-email.png\" alt=\"{SITE_LOCKUP_ALT}\" width=\"350\" height=\"224\" style=\"display:block;width:100%;max-width:350px;height:auto;border:0;\"></a>
<h1 style=\"margin:16px 0 24px;font-size:26px;line-height:1.25;overflow-wrap:anywhere;word-wrap:break-word;\">{escaped_title}</h1>
{body}
<p style=\"margin:32px 0 0;font-size:12px;\"><a href=\"{base}\" style=\"color:{PALETTE_INK};\">{SITE_NAME}</a> — {SITE_TAGLINE}</p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>"
    );

    RenderedEmail {
        text: text.to_string(),
        html,
    }
}
