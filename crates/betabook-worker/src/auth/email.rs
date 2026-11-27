use betabook_db::auth::{claim_welcome_email_once, get_referrer_for_user, insert_friend_request};
use betabook_domain::email_template::{EmailLink, render_email};
use serde_json::json;
use url::Url;

use crate::state::{ApiError, AppState, http_post_json};

const FROM_EMAIL: &str = "Betabook <noreply@betabook.ca>";

async fn deliver_email(
    state: &AppState,
    to: &str,
    subject: &str,
    title: &str,
    text: &str,
    links: &[EmailLink<'_>],
    show_link_urls: bool,
) -> Result<(), ApiError> {
    let base_url = state.auth_url();
    if let Some(api_key) = state.env_var("RESEND_API_KEY") {
        let rendered = render_email(&base_url, title, text, links, show_link_urls);
        let payload = json!({
            "from": FROM_EMAIL,
            "to": [to],
            "subject": subject,
            "text": rendered.text,
            "html": rendered.html,
        });
        let (status, resp_text) =
            http_post_json("https://api.resend.com/emails", Some(&api_key), &payload).await?;
        if !(200..300).contains(&status) {
            return Err(ApiError::internal(format!(
                "Resend rejected \"{subject}\": {status} {resp_text}"
            )));
        }
        return Ok(());
    }

    let parsed = Url::parse(&base_url).map_err(ApiError::internal)?;
    let is_local_host = matches!(parsed.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if !is_local_host {
        return Err(ApiError::internal("Email delivery is not configured"));
    }
    worker::console_log!("[dev] {subject} to {to}:\n{text}");
    Ok(())
}

pub async fn send_verification_email(
    state: &AppState,
    to: &str,
    url: &str,
) -> Result<(), ApiError> {
    let text = format!("Click the link below to verify your email address:\n\n{url}");
    let links = [EmailLink {
        href: url,
        label: "Verify email",
    }];
    deliver_email(
        state,
        to,
        "Verify your Betabook email",
        "Verify your email",
        &text,
        &links,
        true,
    )
    .await
}

pub async fn send_reset_password_email(
    state: &AppState,
    to: &str,
    url: &str,
) -> Result<(), ApiError> {
    let text = format!("Click the link below to reset your password:\n\n{url}");
    let links = [EmailLink {
        href: url,
        label: "Reset password",
    }];
    deliver_email(
        state,
        to,
        "Reset your Betabook password",
        "Reset your password",
        &text,
        &links,
        true,
    )
    .await
}

async fn send_welcome_email(state: &AppState, to: &str, name: &str) -> Result<(), ApiError> {
    let base = state.auth_url().trim_end_matches('/').to_string();
    let import_url = format!("{base}/account/import");
    let contact_url = format!("{base}/contact");
    let text = [
        format!("Hi {name},"),
        "Your email is verified — welcome to Betabook, a climbing logbook and crag database for keeping the routes you've climbed and the places you climbed them.".to_string(),
        "Somewhere to start:".to_string(),
        format!("Already logging sends somewhere else? Export a CSV and bring the whole history across.\n{import_url}"),
        format!("Search for a climb and log your first send.\n{base}"),
        format!("Betabook is free, ad-free, and source available. Questions or corrections? Get in touch:\n{contact_url}"),
    ]
    .join("\n\n");

    let links = [
        EmailLink {
            href: &import_url,
            label: "Import your sends",
        },
        EmailLink {
            href: &base,
            label: "Log your first send",
        },
        EmailLink {
            href: &contact_url,
            label: "Get in touch",
        },
    ];
    deliver_email(
        state,
        to,
        "Welcome to Betabook",
        "Welcome to Betabook",
        &text,
        &links,
        false,
    )
    .await
}

pub async fn send_friend_request_email(
    state: &AppState,
    to: &str,
    requester_name: &str,
) -> Result<(), ApiError> {
    let base = state.auth_url().trim_end_matches('/').to_string();
    let requests_url = format!("{base}/friends?view=requests");
    let text = format!(
        "{requester_name} sent you a friend request on Betabook.\n\nAccept or decline the request:\n{requests_url}"
    );
    let links = [EmailLink {
        href: &requests_url,
        label: "View friend requests",
    }];
    deliver_email(
        state,
        to,
        "New friend request on Betabook",
        "New friend request",
        &text,
        &links,
        true,
    )
    .await
}

pub async fn welcome_new_account_once(state: &AppState, user_id: &str, email: &str, name: &str) {
    let now = state.now_ms();
    match claim_welcome_email_once(state.db(), user_id, now).await {
        Ok(true) => {}
        Ok(false) => return,
        Err(err) => {
            worker::console_error!("welcome claim failed: {err}");
            return;
        }
    }

    if let Ok(Some(referrer)) = get_referrer_for_user(state.db(), user_id).await
        && matches!(
            insert_friend_request(state.db(), user_id, &referrer.id).await,
            Ok(true)
        )
        && let Err(err) = send_friend_request_email(state, &referrer.email, name).await
    {
        worker::console_error!("referral friend email failed: {err}");
    }

    if let Err(err) = send_welcome_email(state, email, name).await {
        worker::console_error!("welcome email failed: {err}");
    }
}
