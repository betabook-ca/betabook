pub const SECURITY_HEADERS: [(&str, &str); 5] = [
    (
        "Strict-Transport-Security",
        "max-age=63072000; includeSubDomains",
    ),
    ("X-Content-Type-Options", "nosniff"),
    ("Referrer-Policy", "strict-origin-when-cross-origin"),
    ("X-Frame-Options", "DENY"),
    (
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    ),
];
