use pulldown_cmark::{CodeBlockKind, Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use url::Url;

use crate::seo::escape_html;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum HeadingTopLevel {
    H2 = 2,
    #[default]
    H3 = 3,
    H4 = 4,
}

const HEADING_CLASSES: [&str; 2] = ["text-base font-semibold", "text-sm font-semibold"];
const EXTERNAL_LINK_ATTRS: &str = "target=\"_blank\" rel=\"noopener noreferrer nofollow ugc\" class=\"link inline underline focus-visible:status-focused\"";

#[derive(Debug, Clone)]
struct PendingImage {
    safe_url: Option<String>,
    alt: String,
}

fn heading_depth(level: HeadingLevel) -> usize {
    match level {
        HeadingLevel::H1 => 0,
        HeadingLevel::H2 => 1,
        HeadingLevel::H3 => 2,
        HeadingLevel::H4 => 3,
        HeadingLevel::H5 => 4,
        HeadingLevel::H6 => 5,
    }
}

/// Keeps only absolute `http(s)` and `mailto:` links so relative paths or
/// script URLs cannot resolve against the page rendering user text.
pub fn safe_markdown_url(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.chars().any(char::is_control) {
        return None;
    }
    let parsed = Url::parse(trimmed).ok()?;
    match parsed.scheme() {
        "http" | "https" | "mailto" => Some(trimmed.to_string()),
        _ => None,
    }
}

/// Renders user-written Markdown into sanitized HTML matching
/// `components/ui/markdown.tsx`: raw HTML is escaped, unsafe link schemes are
/// stripped, and images render as links so viewers never leak their IP address
/// to third-party hosts.
pub fn render_safe_markdown(input: &str, top_level: HeadingTopLevel) -> String {
    let options =
        Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TASKLISTS;
    let parser = Parser::new_ext(input, options);

    let mut out = String::from("<div class=\"space-y-3 text-sm leading-relaxed break-words\">");
    let mut link_stack: Vec<bool> = Vec::new();
    let mut pending_image: Option<PendingImage> = None;
    let mut in_code_block = false;
    let mut in_table_head = false;
    let mut table_body_open = false;

    for event in parser {
        if let Some(image) = pending_image.as_mut() {
            match event {
                Event::Text(text) | Event::Code(text) => {
                    image.alt.push_str(&text);
                    continue;
                }
                Event::SoftBreak | Event::HardBreak => {
                    image.alt.push(' ');
                    continue;
                }
                Event::End(TagEnd::Image) => {
                    let completed = pending_image.take().unwrap();
                    let label = if completed.alt.trim().is_empty() {
                        completed.safe_url.as_deref().unwrap_or("")
                    } else {
                        completed.alt.trim()
                    };
                    if let Some(ref safe) = completed.safe_url {
                        out.push_str("<a href=\"");
                        out.push_str(&escape_html(safe));
                        out.push_str("\" ");
                        out.push_str(EXTERNAL_LINK_ATTRS);
                        out.push('>');
                        out.push_str(&escape_html(label));
                        out.push_str("</a>");
                    } else {
                        out.push_str(&escape_html(label));
                    }
                    continue;
                }
                Event::Start(_) | Event::End(_) | Event::Html(_) | Event::InlineHtml(_) => {
                    continue;
                }
                _ => continue,
            }
        }

        match event {
            Event::Start(tag) => match tag {
                Tag::Paragraph => out.push_str("<p>"),
                Tag::Heading { level, .. } => {
                    let depth = heading_depth(level);
                    let tag_level = ((top_level as usize) + depth).min(6);
                    let class_name = HEADING_CLASSES[depth.min(HEADING_CLASSES.len() - 1)];
                    out.push_str(&format!("<h{tag_level} class=\"{class_name}\">"));
                }
                Tag::BlockQuote(_) => out.push_str(
                    "<blockquote class=\"flex flex-col gap-3 border-l-2 border-border pl-3 text-muted\">",
                ),
                Tag::CodeBlock(kind) => {
                    in_code_block = true;
                    let lang_attr = match kind {
                        CodeBlockKind::Fenced(lang) if !lang.trim().is_empty() => format!(
                            " data-language=\"{}\"",
                            escape_html(lang.split_whitespace().next().unwrap_or(""))
                        ),
                        _ => String::new(),
                    };
                    out.push_str(&format!(
                        "<pre class=\"overflow-x-auto rounded-md bg-default p-3 font-sans [&amp;>code]:bg-transparent [&amp;>code]:p-0\"{lang_attr}><code>"
                    ));
                }
                Tag::List(Some(start)) => {
                    out.push_str(&format!(
                        "<ol start=\"{start}\" class=\"list-decimal space-y-1 pl-5\">"
                    ));
                }
                Tag::List(None) => {
                    out.push_str("<ul role=\"list\" class=\"list-disc space-y-1 pl-5\">");
                }
                Tag::Item => out.push_str("<li class=\"[&amp;>ol]:mt-1 [&amp;>ul]:mt-1\">"),
                Tag::Table(_) => {
                    table_body_open = false;
                    out.push_str(
                        "<div class=\"overflow-x-auto\"><table class=\"w-full border-collapse text-left\">",
                    );
                }
                Tag::TableHead => {
                    in_table_head = true;
                    out.push_str("<thead><tr>");
                }
                Tag::TableRow => {
                    if !in_table_head && !table_body_open {
                        out.push_str("<tbody>");
                        table_body_open = true;
                    }
                    out.push_str("<tr>");
                }
                Tag::TableCell => {
                    if in_table_head {
                        out.push_str("<th class=\"border border-border px-2 py-1 font-semibold\">");
                    } else {
                        out.push_str("<td class=\"border border-border px-2 py-1\">");
                    }
                }
                Tag::Emphasis => out.push_str("<em>"),
                Tag::Strong => out.push_str("<strong>"),
                Tag::Strikethrough => out.push_str("<del>"),
                Tag::Link { dest_url, .. } => {
                    if let Some(safe) = safe_markdown_url(&dest_url) {
                        out.push_str("<a href=\"");
                        out.push_str(&escape_html(&safe));
                        out.push_str("\" ");
                        out.push_str(EXTERNAL_LINK_ATTRS);
                        out.push('>');
                        link_stack.push(true);
                    } else {
                        link_stack.push(false);
                    }
                }
                Tag::Image { dest_url, .. } => {
                    pending_image = Some(PendingImage {
                        safe_url: safe_markdown_url(&dest_url),
                        alt: String::new(),
                    });
                }
                Tag::HtmlBlock
                | Tag::FootnoteDefinition(_)
                | Tag::MetadataBlock(_)
                | Tag::DefinitionList
                | Tag::DefinitionListTitle
                | Tag::DefinitionListDefinition
                | Tag::Superscript
                | Tag::Subscript => {}
            },
            Event::End(tag_end) => match tag_end {
                TagEnd::Paragraph => out.push_str("</p>"),
                TagEnd::Heading(level) => {
                    let tag_level = ((top_level as usize) + heading_depth(level)).min(6);
                    out.push_str(&format!("</h{tag_level}>"));
                }
                TagEnd::BlockQuote(_) => out.push_str("</blockquote>"),
                TagEnd::CodeBlock => {
                    in_code_block = false;
                    out.push_str("</code></pre>");
                }
                TagEnd::List(true) => out.push_str("</ol>"),
                TagEnd::List(false) => out.push_str("</ul>"),
                TagEnd::Item => out.push_str("</li>"),
                TagEnd::Table => {
                    if table_body_open {
                        out.push_str("</tbody>");
                        table_body_open = false;
                    }
                    out.push_str("</table></div>");
                }
                TagEnd::TableHead => {
                    in_table_head = false;
                    out.push_str("</tr></thead>");
                }
                TagEnd::TableRow => out.push_str("</tr>"),
                TagEnd::TableCell => {
                    if in_table_head {
                        out.push_str("</th>");
                    } else {
                        out.push_str("</td>");
                    }
                }
                TagEnd::Emphasis => out.push_str("</em>"),
                TagEnd::Strong => out.push_str("</strong>"),
                TagEnd::Strikethrough => out.push_str("</del>"),
                TagEnd::Link => {
                    if link_stack.pop() == Some(true) {
                        out.push_str("</a>");
                    }
                }
                TagEnd::Image
                | TagEnd::HtmlBlock
                | TagEnd::FootnoteDefinition
                | TagEnd::MetadataBlock(_)
                | TagEnd::DefinitionList
                | TagEnd::DefinitionListTitle
                | TagEnd::DefinitionListDefinition
                | TagEnd::Superscript
                | TagEnd::Subscript => {}
            },
            Event::Text(text) | Event::Html(text) | Event::InlineHtml(text) => {
                out.push_str(&escape_html(&text));
            }
            Event::Code(code) => {
                if in_code_block {
                    out.push_str(&escape_html(&code));
                } else {
                    out.push_str("<code class=\"rounded-md bg-default px-1 font-sans text-[0.9em]\">");
                    out.push_str(&escape_html(&code));
                    out.push_str("</code>");
                }
            }
            Event::SoftBreak | Event::HardBreak => out.push_str("<br>"),
            Event::Rule => out.push_str("<hr class=\"border-border\">"),
            Event::TaskListMarker(checked) => {
                let label = if checked { "Done" } else { "Not done" };
                let glyph = if checked { "☑" } else { "☐" };
                out.push_str(&format!(
                    "<span role=\"img\" aria-label=\"{label}\" class=\"mr-1.5 inline-block text-muted\">{glyph}</span>"
                ));
            }
            Event::FootnoteReference(_) | Event::InlineMath(_) | Event::DisplayMath(_) => {}
        }
    }

    out.push_str("</div>");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_raw_html_and_strips_unsafe_links() {
        let md = "<script>alert(1)</script>\n\n[bad](javascript:alert(1)) and [rel](/feed) and [ok](https://betabook.ca)";
        let html = render_safe_markdown(md, HeadingTopLevel::H3);
        assert!(!html.contains("<script>"));
        assert!(html.contains("&lt;script&gt;alert(1)&lt;/script&gt;"));
        assert!(!html.contains("javascript:"));
        assert!(!html.contains("href=\"/feed\""));
        assert!(html.contains("href=\"https://betabook.ca\""));
        assert!(html.contains("rel=\"noopener noreferrer nofollow ugc\""));
    }

    #[test]
    fn renders_remote_images_as_links_never_img() {
        let md = "![topo](https://example.com/topo.png) and ![bad](javascript:evil())";
        let html = render_safe_markdown(md, HeadingTopLevel::H3);
        assert!(!html.contains("<img"));
        assert!(html.contains("<a href=\"https://example.com/topo.png\""));
        assert!(html.contains(">topo</a>"));
        assert!(!html.contains("javascript:"));
        assert!(html.contains("bad"));
    }

    #[test]
    fn shifts_headings_and_renders_gfm_features() {
        let md = "# Top\n\n## Sub\n\n- [x] Sent\n- [ ] Project\n\nLine 1\nLine 2\n\n| A | B |\n| --- | --- |\n| 1 | 2 |";
        let html = render_safe_markdown(md, HeadingTopLevel::H3);
        assert!(html.contains("<h3 class=\"text-base font-semibold\">Top</h3>"));
        assert!(html.contains("<h4 class=\"text-sm font-semibold\">Sub</h4>"));
        assert!(html.contains("aria-label=\"Done\""));
        assert!(html.contains("aria-label=\"Not done\""));
        assert!(html.contains("Line 1<br>Line 2"));
        assert!(html.contains("<thead><tr><th"));
        assert!(html.contains("<tbody><tr><td"));
    }
}
