import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { Markdown } from "./markdown";

function render(source: string, headingLevel?: 2 | 3 | 4) {
  return renderToStaticMarkup(<Markdown headingLevel={headingLevel}>{source}</Markdown>);
}

it("formats emphasis and lists", () => {
  const html = render("**Sent** the *project*.\n\n- Buttermilks\n- Happies");
  expect(html).toContain("<strong>Sent</strong>");
  expect(html).toContain("<em>project</em>");
  expect(html).toMatch(/<ul[^>]*>\s*<li[^>]*>Buttermilks<\/li>\s*<li[^>]*>Happies<\/li>\s*<\/ul>/);
});

it("renders headings below the page's heading level", () => {
  expect(render("# Day one\n\n## Morning")).toMatch(
    /<h3[^>]*>Day one<\/h3>\s*<h4[^>]*>Morning<\/h4>/,
  );
  expect(render("# Day one", 2)).toMatch(/<h2[^>]*>Day one<\/h2>/);
  expect(render("###### Deep", 4)).toMatch(/<h6[^>]*>Deep<\/h6>/);
});

it("keeps single line breaks", () => {
  expect(render("Day one\nDay two")).toMatch(/Day one<br\/>\s*Day two/);
});

it("links a pasted URL and opens it in a new tab", () => {
  const html = render("Photos: https://photos.app.goo.gl/abc123");
  expect(html).toContain('href="https://photos.app.goo.gl/abc123"');
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noopener noreferrer nofollow ugc"');
});

it("shows raw HTML as text instead of rendering it", () => {
  const html = render('<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">');
  expect(html).not.toContain("<script");
  expect(html).not.toContain("<img");
  expect(html).toContain("&lt;script&gt;");
});

it.each([
  ["a javascript: URL", "[open](javascript:alert(1))"],
  ["a data: URL", "[open](data:text/html;base64,PHNjcmlwdD4=)"],
  ["a relative path", "[open](/account)"],
])("renders %s as plain text, not a link", (_label, source) => {
  const html = render(source);
  expect(html).toContain("open");
  expect(html).not.toContain("<a");
  expect(html).not.toContain("href");
});

it("links an image instead of loading it", () => {
  const html = render("![Topo](https://example.com/topo.jpg)");
  expect(html).not.toContain("<img");
  expect(html).toMatch(/<a href="https:\/\/example\.com\/topo\.jpg"[^>]*>Topo<\/a>/);
});

it("renders task lists with icons instead of checkboxes", () => {
  const html = render("- [x] Send the project\n- [ ] Rest day");
  expect(html).not.toContain("<input");
  expect(html).not.toMatch(/[☑☐]/);
  expect(html).toMatch(/<svg[^>]*aria-label="Done"/);
  expect(html).toMatch(/<svg[^>]*aria-label="Not done"/);
});

it("uses the app font for code", () => {
  const html = render("Beta in `code`.\n\n```\nleft hand crimp\n```");
  // Set explicitly, because browsers default `code` to monospace.
  expect(html).toMatch(/<code class="[^"]*\bfont-sans\b/);
  expect(html).toMatch(/<pre class="[^"]*\bfont-sans\b/);
  expect(html).not.toContain("font-mono");
});
