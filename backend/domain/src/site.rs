pub const SITE_URL: &str = "https://betabook.ca";
pub const SITE_NAME: &str = "Betabook";
pub const SITE_DESCRIPTION: &str =
    "Climbing logbook and crag database — routes, boulder problems, grades, and logged ascents.";
pub const SITE_TAGLINE: &str = "Climb · Log · Progress";
pub const SITE_LOCKUP_ALT: &str = "Betabook — Climb · Log · Progress";

pub const PALETTE_NIGHT: &str = "#191e25";
pub const PALETTE_INK: &str = "#252423";
pub const PALETTE_PRIMARY: &str = "#994b35";
pub const PALETTE_PAPER: &str = "#faf9f5";

pub const OG_IMAGE_URL: &str = "/opengraph-image.png";
pub const OG_IMAGE_WIDTH: u32 = 1200;
pub const OG_IMAGE_HEIGHT: u32 = 630;
pub const OG_IMAGE_ALT: &str =
    "Betabook — Climb · Log · Progress. Climbing logbook and crag database.";

pub const LANDING_PAGE_PATHS: [&str; 5] = [
    "/climbing-logbook",
    "/kaya-import",
    "/sendage-import",
    "/mountain-project-import",
    "/costs",
];

pub fn is_terms_exempt_path(pathname: &str) -> bool {
    let static_exempt = [
        "/",
        "/about",
        "/contact",
        "/terms",
        "/accept-terms",
        "/sign-in",
        "/sign-up",
        "/forgot-password",
        "/reset-password",
        "/search",
    ];
    if static_exempt.contains(&pathname) || LANDING_PAGE_PATHS.contains(&pathname) {
        return true;
    }
    pathname.starts_with("/terms/")
        || pathname.starts_with("/areas/")
        || pathname.starts_with("/climbs/")
        || pathname.starts_with("/projects/")
        || pathname.starts_with("/trips/")
        || pathname.starts_with("/lists/")
}
