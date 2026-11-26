use axum::{
    body::Body,
    extract::{Path, State},
    http::{StatusCode, header},
    response::Response,
};
use betabook_domain::seo::{PageMetadata, escape_html};
use betabook_domain::site::{PALETTE_INK, PALETTE_PAPER, SITE_DESCRIPTION};
use betabook_domain::terms::{TERMS_VERSION, TERMS_VERSIONS, terms_href};

use crate::routes::seo::{load_asset_text, load_spa_manifest, primary_stylesheet_href};
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
    {body_html}
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

    published_document(&state, &meta, "about").await
}

#[worker::send]
pub async fn climbing_logbook(State(state): State<AppState>) -> Result<Response, ApiError> {
    let meta = PageMetadata::indexable(
        "Free climbing logbook",
        "A free climbing logbook for bouldering, sport and trad. Log sends and sessions, see your progression, and import from KAYA, Sendage or Mountain Project.",
        "/climbing-logbook",
        "website",
    );
    published_document(&state, &meta, "climbing-logbook").await
}

async fn published_document(
    state: &AppState,
    meta: &PageMetadata,
    name: &str,
) -> Result<Response, ApiError> {
    let body = load_asset_text(state, &format!("/static-documents/{name}.txt"))
        .await?
        .ok_or_else(|| ApiError::internal("Missing published document asset"))?;
    render_static_document(state, StatusCode::OK, meta, &body).await
}

#[worker::send]
pub async fn terms_page(State(state): State<AppState>) -> Result<Response, ApiError> {
    let meta = PageMetadata::indexable(
        "Terms of Service",
        "Terms for using Betabook’s climbing logbook and community crag database.",
        "/terms",
        "website",
    );
    published_document(&state, &meta, &format!("terms-{TERMS_VERSION}")).await
}

#[worker::send]
pub async fn terms_version_page(
    State(state): State<AppState>,
    Path(version): Path<String>,
) -> Result<Response, ApiError> {
    let Some(entry) = TERMS_VERSIONS.iter().find(|entry| entry.version == version) else {
        let meta = PageMetadata::noindex("Not found", SITE_DESCRIPTION);
        let not_found_body = "<section class=\"rounded-xl border border-border bg-surface p-6\"><h1 class=\"font-display text-2xl font-bold\">Page not found</h1><p class=\"mt-2 text-sm text-muted\">Return to the <a href=\"/terms\" class=\"link underline\">current Terms of Service</a>.</p></section>";
        return render_static_document(&state, StatusCode::NOT_FOUND, &meta, not_found_body).await;
    };

    let path = terms_href(entry.version);
    let meta = PageMetadata::indexable(
        format!("Terms of Service ({})", entry.label),
        "Terms for using Betabook’s climbing logbook and community crag database.",
        &path,
        "website",
    );
    published_document(&state, &meta, &format!("terms-{}", entry.version)).await
}
