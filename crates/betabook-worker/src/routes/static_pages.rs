use axum::{
    body::Body,
    extract::{Path, State},
    http::{StatusCode, header},
    response::Response,
};
use betabook_domain::seo::{PageMetadata, escape_html};
use betabook_domain::site::{PALETTE_INK, PALETTE_PAPER, SITE_DESCRIPTION, SITE_NAME};
use betabook_domain::terms::{TERMS_UPDATED_LABEL, TERMS_VERSION, TERMS_VERSIONS, terms_href};

use crate::routes::seo::{load_spa_manifest, primary_stylesheet_href};
use crate::state::{ApiError, AppState};

async fn render_static_document(
    state: &AppState,
    status: StatusCode,
    meta: &PageMetadata,
    body_html: &str,
) -> Result<Response, ApiError> {
    let manifest = load_spa_manifest(state).await?;
    let stylesheet_link = primary_stylesheet_href(&manifest)
        .map(|href| format!("<link rel=\"stylesheet\" href=\"{}\">", escape_html(&href)))
        .unwrap_or_default();
    let head_tags = meta.render_head_tags();

    let html = format!(
        "<!doctype html>
<html lang=\"en\" class=\"h-full antialiased\">
  <head>
    <meta charset=\"utf-8\">
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1, interactive-widget=resizes-content\">
    <meta name=\"theme-color\" media=\"(prefers-color-scheme: light)\" content=\"{PALETTE_PAPER}\">
    <meta name=\"theme-color\" media=\"(prefers-color-scheme: dark)\" content=\"{PALETTE_INK}\">
    {head_tags}
    {stylesheet_link}
  </head>
  <body class=\"flex min-h-full flex-col bg-background text-foreground\">
    <script>
      (function () {{
        try {{
          var theme = localStorage.getItem(\"heroui-theme\") || \"system\";
          var resolved =
            theme === \"system\"
              ? (window.matchMedia(\"(prefers-color-scheme: dark)\").matches ? \"dark\" : \"light\")
              : theme;
          document.documentElement.classList.add(resolved);
          document.documentElement.setAttribute(\"data-theme\", resolved);
          if (theme !== \"system\") {{
            var m = document.createElement(\"meta\");
            m.name = \"theme-color\";
            m.content = resolved === \"dark\" ? \"{PALETTE_INK}\" : \"{PALETTE_PAPER}\";
            m.setAttribute(\"data-explicit-theme\", \"\");
            document.head.insertBefore(m, document.head.firstChild);
          }}
        }} catch (_e) {{}}
      }})();
    </script>
    <header class=\"sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur\">
      <div class=\"mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4\">
        <a href=\"/\" class=\"font-display text-xl font-bold tracking-tight no-underline\">{SITE_NAME}</a>
        <nav aria-label=\"Primary\" class=\"flex items-center gap-4 text-sm\">
          <a href=\"/\" class=\"link no-underline\">Catalog</a>
          <a href=\"/about\" class=\"link no-underline\">About</a>
          <a href=\"/terms\" class=\"link no-underline\">Terms</a>
          <a href=\"/sign-in\" class=\"link font-medium no-underline\">Sign in</a>
        </nav>
      </div>
    </header>
    <main id=\"main\" class=\"mx-auto w-full max-w-5xl flex-1 px-4 py-6\">
      {body_html}
    </main>
  </body>
</html>
"
    );

    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .body(Body::from(html))
        .map_err(ApiError::internal)
}

#[worker::send]
pub async fn about_page(State(state): State<AppState>) -> Result<Response, ApiError> {
    let meta = PageMetadata::indexable(
        "About",
        "Who builds Betabook, how the site stays free, and who can see your profile, sends and journal.",
        "/about",
        "website",
    );

    let body = r#"<div class="mx-auto flex w-full max-w-prose flex-col gap-4">
  <h1 class="font-display text-3xl font-bold tracking-tight">About Betabook</h1>

  <h2 class="mt-4 font-display text-xl font-bold">What is Betabook</h2>
  <p class="leading-relaxed text-pretty">
    Betabook is a journal for your personal climbing journey. It is not just for your sends, but also for logging your sessions, your failures, and most importantly, your progress over the years. Betabook is a place to share your climbing experiences with others, and to learn from the experiences of others.
  </p>
  <p class="leading-relaxed text-pretty">
    See the <a href="/climbing-logbook" class="link inline underline focus-visible:status-focused">logbook’s features</a>, or import your sends from
    <a href="/kaya-import" class="link inline underline focus-visible:status-focused">KAYA</a>,
    <a href="/sendage-import" class="link inline underline focus-visible:status-focused">Sendage</a> or
    <a href="/mountain-project-import" class="link inline underline focus-visible:status-focused">Mountain Project</a>.
  </p>

  <section aria-labelledby="about-privacy" class="mt-4 flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
    <h2 id="about-privacy" class="font-display text-xl font-bold">Privacy controls</h2>
    <ul role="list" class="flex list-disc flex-col gap-2 ps-5 leading-relaxed text-pretty">
      <li>Profiles, journals and stats need an account. Signed-out visitors see each climb’s latest 10 sends, without names unless send notes are set to Everyone.</li>
      <li>A private profile and its history are visible only to you. Friends and people you send requests to still see your name, and climb pages list your sends without it.</li>
      <li>You set one audience for your journal and finished goals and another for send notes, from Only me to Members. Send notes can also be set to Everyone, which shows them with your name to signed-out visitors.</li>
      <li>Your profile link and QR code show your name, photo, send stats and latest sends to anyone who has them. Resetting the link, or making your profile private, stops old links working.</li>
      <li>Only you can see your projects, unless you share one: anyone with the link sees your name, sessions, notes and send.</li>
      <li>You choose who else can see your trips, from Only me to Members. Your friends can read trip notes regardless of your journal setting.</li>
      <li>Only you can export your sends.</li>
    </ul>
  </section>

  <h2 class="mt-4 font-display text-xl font-bold">Not a guidebook or social media</h2>
  <p class="leading-relaxed text-pretty">
    Betabook does not aim to become a guidebook site or a social media platform. While there is detailed info on the platform to help find and share crags, the aim is simply to be a gathering place where users can share what they’re climbing.
  </p>

  <h2 class="mt-4 font-display text-xl font-bold">For the community</h2>
  <p class="leading-relaxed text-pretty">
    The source code for Betabook remains public and available on <a href="https://github.com/betabook-ca/betabook" target="_blank" rel="noreferrer" class="link inline underline focus-visible:status-focused">GitHub</a>. Anyone can contribute to features they want to see and help keep crag information accurate.
  </p>

  <h2 class="mt-4 font-display text-xl font-bold">Keeping this site free</h2>
  <p class="leading-relaxed text-pretty">
    Betabook is built to stay free of user fees and ads. The <a href="/costs" class="link inline underline focus-visible:status-focused">cost transparency page</a> shows this month’s Cloudflare usage against what the plan includes.
  </p>

  <h2 class="mt-4 font-display text-xl font-bold">Filling in the Beta</h2>
  <p class="leading-relaxed text-pretty">
    The database was seeded with climbs and their known physical locations, without copyrighted guidebook descriptions. If you come across a climb or area missing a description, please contribute in your own words.
  </p>
</div>"#;

    render_static_document(&state, StatusCode::OK, &meta, body).await
}

fn render_terms_body(version: &str, canonical_path: &str) -> String {
    let mut versions_nav = String::from(
        "<nav aria-label=\"Published terms versions\" class=\"flex flex-col gap-2 text-sm\"><p class=\"font-medium\">Published versions</p>",
    );
    for entry in TERMS_VERSIONS {
        let href = terms_href(entry.version);
        let label = escape_html(entry.label);
        let active = if entry.version == version && canonical_path != "/terms" {
            " (current)"
        } else {
            ""
        };
        versions_nav.push_str(&format!(
            "<a href=\"{}\" class=\"link underline\">{label}{active}</a>",
            escape_html(&href)
        ));
    }
    versions_nav.push_str("</nav>");

    format!(
        r#"<div class="mx-auto flex w-full max-w-prose flex-col gap-6">
  <article class="flex flex-col gap-4 leading-relaxed">
    <h1 class="font-display text-3xl font-bold tracking-tight">Terms of Service</h1>
    <p class="text-sm text-muted">Last updated: <time datetime="{TERMS_VERSION}">{TERMS_UPDATED_LABEL}</time></p>
    <p>
      These terms govern your use of Betabook, a climbing logbook and community crag database at betabook.ca. “We” and “us” refer to the operators of Betabook. By agreeing when you create an account, you accept these terms. If you do not agree, do not create an account.
    </p>

    <h2 class="mt-4 font-display text-xl font-bold">1. Your account</h2>
    <p>
      You must be able to enter into a binding agreement under the laws that apply to you. Provide accurate account information, keep your sign-in credentials secure, and use only accounts you are authorized to access. Contact us if you believe someone has accessed your account without permission.
    </p>

    <h2 class="mt-4 font-display text-xl font-bold">2. Climbing and outdoor safety</h2>
    <p>
      Climbing is dangerous and can cause serious injury or death. Betabook is a record of climbing experiences, not a safety service, guidebook, or substitute for qualified instruction, appropriate equipment, current local guidance, and your own assessment.
    </p>
    <p>
      Community descriptions, grades, locations, ratings, and activity may be inaccurate, incomplete, or out of date. Check conditions, access restrictions, closures, equipment, and your abilities independently. Respect landowners, local communities, and the environment.
    </p>

    <h2 class="mt-4 font-display text-xl font-bold">3. Respectful and lawful use</h2>
    <ul role="list" class="list-disc space-y-2 pl-6">
      <li>Do not harass, threaten, impersonate, or publish someone else’s private information.</li>
      <li>Do not post unlawful content, spam, malicious software, or deliberately misleading beta.</li>
      <li>Do not bypass access controls, access private records, or disrupt the service.</li>
      <li>Contribute only material you have the right to share, including when using imports.</li>
    </ul>

    <h2 class="mt-4 font-display text-xl font-bold">4. Your contributions</h2>
    <p>
      You retain ownership of content you contribute. You grant us a non-exclusive, royalty-free license to store, reproduce, format, and display that content as needed to operate Betabook. Area and climb names, locations, grades, and descriptions are public contributions to the shared catalog. Do not copy guidebook descriptions without permission. Report concerns through our <a href="/contact" class="link inline underline">contact form</a>.
    </p>

    <h2 class="mt-4 font-display text-xl font-bold">5. Sharing and third-party services</h2>
    <p>
      Your profile and activity have audience controls in Account. Google sign-in, linked websites, and services you import from operate under their own terms.
    </p>

    <h2 class="mt-4 font-display text-xl font-bold">6. Availability and account closure</h2>
    <p>
      We may change, interrupt, or discontinue features where necessary to address misuse, security issues, or legal obligations. You can stop using Betabook at any time and delete your account from Account.
    </p>

    <h2 class="mt-4 font-display text-xl font-bold">7. Disclaimers and limits</h2>
    <p>
      To the extent permitted by applicable law, Betabook and its community information are provided “as is” and “as available,” without warranties of accuracy, availability, or fitness for a particular purpose.
    </p>

    <h2 class="mt-4 font-display text-xl font-bold">8. Changes and contact</h2>
    <p>
      Revised terms will be posted on this page with an updated date. For questions about these terms or the service, use our <a href="/contact" class="link inline underline">contact form</a>.
    </p>
  </article>
  {versions_nav}
</div>"#
    )
}

#[worker::send]
pub async fn terms_page(State(state): State<AppState>) -> Result<Response, ApiError> {
    let meta = PageMetadata::indexable(
        "Terms of Service",
        "Terms for using Betabook’s climbing logbook and community crag database.",
        "/terms",
        "website",
    );
    let body = render_terms_body(TERMS_VERSION, "/terms");
    render_static_document(&state, StatusCode::OK, &meta, &body).await
}

#[worker::send]
pub async fn terms_version_page(
    State(state): State<AppState>,
    Path(version): Path<String>,
) -> Result<Response, ApiError> {
    let Some(entry) = TERMS_VERSIONS.iter().find(|entry| entry.version == version) else {
        let meta = PageMetadata::noindex("Not found", SITE_DESCRIPTION);
        let not_found_body = "<section class=\"rounded-xl border border-border bg-surface p-6\"><h1 class=\"font-display text-2xl font-bold\">Terms version not found</h1><p class=\"mt-2 text-sm text-muted\">Return to the <a href=\"/terms\" class=\"link underline\">current Terms of Service</a>.</p></section>";
        return render_static_document(&state, StatusCode::NOT_FOUND, &meta, not_found_body).await;
    };

    let path = terms_href(entry.version);
    let meta = PageMetadata::indexable(
        format!("Terms of Service ({})", entry.label),
        "Terms for using Betabook’s climbing logbook and community crag database.",
        &path,
        "website",
    );
    let body = render_terms_body(entry.version, &path);
    render_static_document(&state, StatusCode::OK, &meta, &body).await
}
