//! First-paint catalog content. Only the rows projected for anonymous readers
//! enter these functions; the interactive routes consume the same bootstrap data.
use std::fmt::Write;

use betabook_db::social::ClimbVideos;
use betabook_domain::grades::{GradePreferences, format_grade};
use betabook_domain::public_catalog::{
    PublicArea, PublicAreaDetails, PublicClimb, PublicClimbSend, PublicClimbsPage,
};
use betabook_domain::sends::parse_send_video_link;
use betabook_domain::seo::escape_html;
use betabook_domain::slug::{area_href, climb_href};

const TITLE: &str = "font-display text-3xl font-semibold tracking-tight";
const SECTION: &str = "text-lg font-semibold";

fn area_link(id: i64, name: &str) -> String {
    format!(
        r#"<a class="link" href="{}">{}</a>"#,
        area_href(id, name),
        escape_html(name)
    )
}

fn trail(ancestors: &[PublicAreaDetails], current: &str) -> String {
    let mut html = String::from(
        r#"<nav aria-label="Breadcrumb" class="flex flex-wrap items-center gap-2 text-sm text-muted">"#,
    );
    for area in ancestors {
        let _ = write!(
            html,
            "{} <span aria-hidden=\"true\">/</span> ",
            area_link(area.id, &area.name)
        );
    }
    let _ = write!(
        html,
        r#"<span aria-current="page">{}</span></nav>"#,
        escape_html(current)
    );
    html
}

pub(super) fn climb_list(page: &PublicClimbsPage, empty_message: &str) -> String {
    if page.climbs.is_empty() {
        return format!(
            r#"<p class="text-muted">{}</p>"#,
            escape_html(empty_message)
        );
    }
    let mut html = String::from(r#"<ul class="divide-y divide-separator" role="list">"#);
    for c in &page.climbs {
        let _ = write!(
            html,
            r#"<li class="flex items-center justify-between gap-4 py-3"><div><a class="link font-semibold" href="{}">{}</a><div class="text-sm text-muted">"#,
            climb_href(c.id, &c.name),
            escape_html(&c.name)
        );
        if let Some(parts) = page.area_breadcrumbs.get(&c.area_id) {
            for part in parts.iter().filter(|p| p.id != c.area_id) {
                let _ = write!(html, "{} / ", escape_html(&part.name));
            }
        }
        let rating = c
            .avg_rating
            .map_or(String::new(), |r| format!(" · {r:.1} stars"));
        let ascents = if c.send_count == 1 {
            "ascent"
        } else {
            "ascents"
        };
        let _ = write!(
            html,
            r#"{}</div></div><div class="text-right text-sm">{} · <span class="capitalize">{}</span>{}<div class="text-xs text-muted">{} {ascents}{rating}</div></div></li>"#,
            area_link(c.area_id, &c.area_name),
            format_grade(c.climb_type, c.grade, GradePreferences::default()),
            c.climb_type.as_str(),
            if c.broken_on.is_some() {
                " · Broken"
            } else {
                ""
            },
            c.send_count
        );
    }
    html.push_str("</ul>");
    html
}

fn auth_link(path: &str, description: &str) -> String {
    let query = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("next", path)
        .finish();
    format!(
        r#"<aside class="rounded-xl border border-border bg-surface p-4"><p class="font-semibold">For Betabook members</p><p class="text-sm text-muted">{description}</p><a class="link underline" href="/sign-in?{query}">Sign in</a> · <a class="link underline" href="/sign-up?{query}">Sign up</a></aside>"#
    )
}

fn next_page(path: &str, step: usize) -> String {
    let (path, raw) = path.split_once('?').unwrap_or((path, ""));
    let opts = betabook_domain::public_catalog::parse_public_catalog_options(raw);
    let mut query = url::form_urlencoded::Serializer::new(String::new());
    for (key, value) in
        url::form_urlencoded::parse(raw.as_bytes()).filter(|(k, _)| k != "offset" && k != "page")
    {
        query.append_pair(&key, &value);
    }
    query.append_pair(
        "offset",
        &(opts.offset.unwrap_or_default() + step).to_string(),
    );
    escape_html(&format!("{path}?{}", query.finish()))
}

pub(super) fn area(
    area: &PublicAreaDetails,
    ancestors: &[PublicAreaDetails],
    children: &[PublicArea],
    page: &PublicClimbsPage,
    path: &str,
) -> String {
    let mut html = format!(
        r#"<article class="flex flex-col gap-6">{}<h1 class="{TITLE}">{}</h1><p class="text-muted">{}</p>{}"#,
        trail(ancestors, &area.name),
        escape_html(&area.name),
        escape_html(
            area.description
                .as_deref()
                .filter(|d| !d.is_empty())
                .unwrap_or("No description yet.")
        ),
        auth_link(
            path,
            "Sign in to see who has climbed these lines and to log your own sessions."
        )
    );
    if !children.is_empty() {
        html.push_str(r#"<section><h2 class="text-lg font-semibold">Sub-areas</h2><ul class="flex flex-wrap gap-3">"#);
        for child in children {
            let _ = write!(html, "<li>{}</li>", area_link(child.id, &child.name));
        }
        html.push_str("</ul></section>");
    }
    let _ = write!(
        html,
        r#"<section><h2 class="{SECTION}">Climbs</h2>{}</section>"#,
        climb_list(page, "No climbs match in this area.")
    );
    if page.has_next_page {
        let _ = write!(
            html,
            r#"<a class="link underline" href="{}">More climbs</a>"#,
            next_page(path, page.climbs.len())
        );
    }
    html.push_str("</article>");
    html
}

pub(super) fn climb(
    c: &PublicClimb,
    ancestors: &[PublicAreaDetails],
    sends: &[PublicClimbSend],
    videos: &ClimbVideos,
    path: &str,
) -> String {
    let mut html = format!(
        r#"<article class="flex flex-col gap-6">{}<header><h1 class="{TITLE}">{}</h1><p class="mt-1 font-semibold">{} · <span class="capitalize">{}</span></p>"#,
        trail(ancestors, &c.name),
        escape_html(&c.name),
        format_grade(c.climb_type, c.grade, GradePreferences::default()),
        c.climb_type.as_str()
    );
    if let Some(date) = &c.broken_on {
        let _ = write!(html, "<p>Broken · {}</p>", escape_html(date));
    }
    let rating = c
        .avg_rating
        .map(|r| format!("{r:.1}"))
        .unwrap_or_else(|| "—".into());
    let _ = write!(
        html,
        r#"<p class="mt-1 text-muted">{}</p></header><dl class="flex gap-6 rounded-xl border border-border p-4"><div><dt class="text-sm text-muted">Community rating</dt><dd>{rating}</dd></div><div><dt class="text-sm text-muted">Logged ascents</dt><dd>{}</dd></div></dl>"#,
        escape_html(
            c.description
                .as_deref()
                .filter(|d| !d.is_empty())
                .unwrap_or("No description yet.")
        ),
        c.send_count
    );
    let mut links = String::new();
    for v in &videos.videos {
        if let Ok(url) = parse_send_video_link(&v.video_url) {
            let _ = write!(
                links,
                r#"<li><a class="link underline" href="{}" rel="noreferrer">Video · {}</a></li>"#,
                escape_html(&url),
                escape_html(&v.user_name)
            );
        }
    }
    if !links.is_empty() {
        let _ = write!(
            html,
            r#"<section><h2 class="{SECTION}">Videos</h2><ul>{links}</ul></section>"#
        );
    }
    let _ = write!(
        html,
        r#"<section class="flex flex-col gap-3"><h2 class="{SECTION}">Sends</h2>"#
    );
    if sends.is_empty() {
        html.push_str("<p>No sends yet — this line is waiting for its first ascent.</p>");
    } else {
        html.push_str(r#"<ul class="divide-y divide-separator" role="list">"#);
        for s in sends {
            let _ = write!(
                html,
                r#"<li class="py-3"><span class="font-semibold">{}</span> · <span class="capitalize">{}</span> · {}"#,
                escape_html(s.user_name.as_deref().unwrap_or("Betabook climber")),
                escape_html(&s.ascent_style),
                escape_html(s.date_sent.as_deref().unwrap_or("Date unknown"))
            );
            if let Some(note) = &s.comment {
                let _ = write!(html, r#"<p class="text-sm">{}</p>"#, escape_html(note));
            }
            html.push_str("</li>");
        }
        html.push_str("</ul>");
    }
    html.push_str("</section>");
    html.push_str(&auth_link(path, "Sign in to log a session or send."));
    html.push_str("</article>");
    html
}
