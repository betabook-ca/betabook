use std::collections::HashSet;

use betabook_domain::display_name::MAX_DISPLAY_NAME_LENGTH;
use betabook_domain::password::random_hex;
use betabook_domain::profile_share::friendship_pair;
use betabook_domain::terms::TERMS_VERSION;
use serde::Serialize;

use crate::executor::{DbError, DbExecutor, DbParam};
use crate::fts::literal_prefix_condition;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionUser {
    pub id: String,
    pub name: String,
    pub email: String,
    pub email_verified: bool,
    pub image: Option<String>,
    pub role: Option<String>,
    pub terms_version: Option<String>,
    pub terms_accepted_at: Option<i64>,
    pub boulder_grade_scale: String,
    pub rope_grade_scale: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
    pub id: String,
    pub expires_at: i64,
    pub token: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub user_id: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct AuthSession {
    pub session: SessionRecord,
    pub user: SessionUser,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TermsAcceptance {
    pub terms_version: Option<String>,
    pub terms_accepted_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UserRow {
    pub id: String,
    pub name: String,
    pub email: String,
    pub email_verified: bool,
    pub image: Option<String>,
    pub role: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShareLinkOwner {
    pub id: String,
    pub name: String,
    pub image: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReferrerInfo {
    pub id: String,
    pub email: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerificationRow {
    pub id: String,
    pub identifier: String,
    pub value: String,
    pub expires_at: i64,
}

pub async fn get_session_by_token<D: DbExecutor>(
    db: &D,
    token: &str,
) -> Result<Option<AuthSession>, DbError> {
    let Some(row) = db
        .query_one(
            "SELECT
              s.id AS s_id, s.expires_at AS s_expires_at, s.token AS s_token,
              s.created_at AS s_created_at, s.updated_at AS s_updated_at,
              s.ip_address AS s_ip_address, s.user_agent AS s_user_agent, s.user_id AS s_user_id,
              u.id AS u_id, u.name AS u_name, u.email AS u_email, u.email_verified AS u_email_verified,
              u.image AS u_image, u.role AS u_role, u.terms_version AS u_terms_version,
              u.terms_accepted_at AS u_terms_accepted_at,
              u.boulder_grade_scale AS u_boulder_grade_scale,
              u.rope_grade_scale AS u_rope_grade_scale,
              u.created_at AS u_created_at, u.updated_at AS u_updated_at
            FROM session s
            INNER JOIN user u ON u.id = s.user_id
            WHERE s.token = ?",
            &[DbParam::Text(token.to_string())],
        )
        .await?
    else {
        return Ok(None);
    };

    Ok(Some(AuthSession {
        session: SessionRecord {
            id: row.get_string("s_id")?,
            expires_at: row.get_i64("s_expires_at")?,
            token: row.get_string("s_token")?,
            created_at: row.get_i64("s_created_at")?,
            updated_at: row.get_i64("s_updated_at")?,
            ip_address: row.get_opt_string("s_ip_address")?,
            user_agent: row.get_opt_string("s_user_agent")?,
            user_id: row.get_string("s_user_id")?,
        },
        user: SessionUser {
            id: row.get_string("u_id")?,
            name: row.get_string("u_name")?,
            email: row.get_string("u_email")?,
            email_verified: row.get_bool("u_email_verified")?,
            image: row.get_opt_string("u_image")?,
            role: row.get_opt_string("u_role")?,
            terms_version: row.get_opt_string("u_terms_version")?,
            terms_accepted_at: row.get_opt_i64("u_terms_accepted_at")?,
            boulder_grade_scale: row.get_string("u_boulder_grade_scale")?,
            rope_grade_scale: row.get_string("u_rope_grade_scale")?,
            created_at: row.get_i64("u_created_at")?,
            updated_at: row.get_i64("u_updated_at")?,
        },
    }))
}

pub async fn create_session<D: DbExecutor>(db: &D, session: &SessionRecord) -> Result<(), DbError> {
    db.execute(
        "INSERT INTO session (id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        &[
            DbParam::Text(session.id.clone()),
            DbParam::Int(session.expires_at),
            DbParam::Text(session.token.clone()),
            DbParam::Int(session.created_at),
            DbParam::Int(session.updated_at),
            DbParam::from(session.ip_address.clone()),
            DbParam::from(session.user_agent.clone()),
            DbParam::Text(session.user_id.clone()),
        ],
    )
    .await?;
    Ok(())
}

pub async fn touch_session_expiry<D: DbExecutor>(
    db: &D,
    session_id: &str,
    expires_at_ms: i64,
    updated_at_ms: i64,
) -> Result<(), DbError> {
    db.execute(
        "UPDATE session SET expires_at = ?, updated_at = ? WHERE id = ?",
        &[
            DbParam::Int(expires_at_ms),
            DbParam::Int(updated_at_ms),
            DbParam::Text(session_id.to_string()),
        ],
    )
    .await?;
    Ok(())
}

pub async fn delete_session_by_token<D: DbExecutor>(db: &D, token: &str) -> Result<(), DbError> {
    db.execute(
        "DELETE FROM session WHERE token = ?",
        &[DbParam::Text(token.to_string())],
    )
    .await?;
    Ok(())
}

pub async fn delete_user_sessions<D: DbExecutor>(db: &D, user_id: &str) -> Result<(), DbError> {
    db.execute(
        "DELETE FROM session WHERE user_id = ?",
        &[DbParam::Text(user_id.to_string())],
    )
    .await?;
    Ok(())
}

pub async fn get_terms_acceptance<D: DbExecutor>(
    db: &D,
    user_id: &str,
) -> Result<Option<TermsAcceptance>, DbError> {
    let Some(row) = db
        .query_one(
            "SELECT terms_version, terms_accepted_at FROM user WHERE id = ?",
            &[DbParam::Text(user_id.to_string())],
        )
        .await?
    else {
        return Ok(None);
    };
    Ok(Some(TermsAcceptance {
        terms_version: row.get_opt_string("terms_version")?,
        terms_accepted_at: row.get_opt_i64("terms_accepted_at")?,
    }))
}

pub async fn record_terms_acceptance<D: DbExecutor>(
    db: &D,
    user_id: &str,
    now_ms: i64,
) -> Result<Option<TermsAcceptance>, DbError> {
    db.execute(
        "UPDATE user
         SET terms_version = ?, terms_accepted_at = ?, updated_at = ?
         WHERE id = ?
           AND (terms_version IS NULL OR terms_version != ? OR terms_accepted_at IS NULL)",
        &[
            DbParam::Text(TERMS_VERSION.to_string()),
            DbParam::Int(now_ms),
            DbParam::Int(now_ms),
            DbParam::Text(user_id.to_string()),
            DbParam::Text(TERMS_VERSION.to_string()),
        ],
    )
    .await?;
    get_terms_acceptance(db, user_id).await
}

pub async fn find_user_by_email<D: DbExecutor>(
    db: &D,
    email: &str,
) -> Result<Option<UserRow>, DbError> {
    let Some(row) = db
        .query_one(
            "SELECT id, name, email, email_verified, image, role FROM user WHERE lower(email) = lower(?)",
            &[DbParam::Text(email.trim().to_string())],
        )
        .await?
    else {
        return Ok(None);
    };
    Ok(Some(UserRow {
        id: row.get_string("id")?,
        name: row.get_string("name")?,
        email: row.get_string("email")?,
        email_verified: row.get_bool("email_verified")?,
        image: row.get_opt_string("image")?,
        role: row.get_opt_string("role")?,
    }))
}

pub async fn get_user_by_id<D: DbExecutor>(
    db: &D,
    user_id: &str,
) -> Result<Option<UserRow>, DbError> {
    let Some(row) = db
        .query_one(
            "SELECT id, name, email, email_verified, image, role FROM user WHERE id = ?",
            &[DbParam::Text(user_id.to_string())],
        )
        .await?
    else {
        return Ok(None);
    };
    Ok(Some(UserRow {
        id: row.get_string("id")?,
        name: row.get_string("name")?,
        email: row.get_string("email")?,
        email_verified: row.get_bool("email_verified")?,
        image: row.get_opt_string("image")?,
        role: row.get_opt_string("role")?,
    }))
}

pub async fn get_user_id_by_name_nocase<D: DbExecutor>(
    db: &D,
    name: &str,
) -> Result<Option<String>, DbError> {
    let Some(row) = db
        .query_one(
            "SELECT id FROM user WHERE name = ? COLLATE NOCASE",
            &[DbParam::Text(name.to_string())],
        )
        .await?
    else {
        return Ok(None);
    };
    Ok(Some(row.get_string("id")?))
}

pub async fn get_taken_names_around<D: DbExecutor>(
    db: &D,
    base: &str,
    stem: &str,
) -> Result<HashSet<String>, DbError> {
    let mut params = vec![DbParam::Text(base.to_string())];
    let prefix = literal_prefix_condition("name", &format!("{stem} "), &mut params);
    let sql = format!("SELECT name FROM user WHERE name = ? COLLATE NOCASE OR {prefix}");
    let rows = db.query_all(&sql, &params).await?;
    let mut taken = HashSet::with_capacity(rows.len());
    for row in rows {
        taken.insert(row.get_string("name")?.to_lowercase());
    }
    Ok(taken)
}

fn truncate_chars(s: &str, max: usize) -> &str {
    match s.char_indices().nth(max) {
        Some((idx, _)) => &s[..idx],
        None => s,
    }
}

pub async fn unique_display_name<D: DbExecutor>(db: &D, base: &str) -> Result<String, DbError> {
    let trimmed_base = truncate_chars(base.trim(), MAX_DISPLAY_NAME_LENGTH).trim();
    let base_name = if trimmed_base.is_empty() {
        "Climber"
    } else {
        trimmed_base
    };
    let stem = truncate_chars(base_name, MAX_DISPLAY_NAME_LENGTH - 3);
    let taken = get_taken_names_around(db, base_name, stem).await?;
    if !taken.contains(&base_name.to_lowercase()) {
        return Ok(base_name.to_string());
    }
    for n in 2..=99 {
        let candidate = format!("{stem} {n}");
        if !taken.contains(&candidate.to_lowercase()) {
            return Ok(candidate);
        }
    }
    let suffix = random_hex(4).map_err(|e| DbError::Query(e.to_string()))?;
    let short_stem = truncate_chars(base_name, MAX_DISPLAY_NAME_LENGTH - 9);
    Ok(format!("{short_stem} {suffix}"))
}

pub async fn find_credential_password_by_user_id<D: DbExecutor>(
    db: &D,
    user_id: &str,
) -> Result<Option<String>, DbError> {
    let Some(row) = db
        .query_one(
            "SELECT password FROM account WHERE user_id = ? AND provider_id = 'credential'",
            &[DbParam::Text(user_id.to_string())],
        )
        .await?
    else {
        return Ok(None);
    };
    row.get_opt_string("password")
}

pub async fn find_oauth_account_user_id<D: DbExecutor>(
    db: &D,
    provider_id: &str,
    account_id: &str,
) -> Result<Option<String>, DbError> {
    let Some(row) = db
        .query_one(
            "SELECT user_id FROM account WHERE provider_id = ? AND account_id = ?",
            &[
                DbParam::Text(provider_id.to_string()),
                DbParam::Text(account_id.to_string()),
            ],
        )
        .await?
    else {
        return Ok(None);
    };
    Ok(Some(row.get_string("user_id")?))
}

#[derive(Debug, Clone)]
pub struct CreateCredentialUser<'a> {
    pub user_id: &'a str,
    pub account_id: &'a str,
    pub name: &'a str,
    pub email: &'a str,
    pub password_hash: &'a str,
    pub terms_version: &'a str,
    pub referred_by: Option<&'a str>,
    pub now_ms: i64,
}

pub async fn create_user_with_credential<D: DbExecutor>(
    db: &D,
    input: &CreateCredentialUser<'_>,
) -> Result<(), DbError> {
    db.batch(vec![
        (
            "INSERT INTO user (id, name, email, email_verified, terms_version, terms_accepted_at, referred_by, created_at, updated_at)
             VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)".to_string(),
            vec![
                DbParam::Text(input.user_id.to_string()),
                DbParam::Text(input.name.to_string()),
                DbParam::Text(input.email.to_string()),
                DbParam::Text(input.terms_version.to_string()),
                DbParam::Int(input.now_ms),
                DbParam::from(input.referred_by),
                DbParam::Int(input.now_ms),
                DbParam::Int(input.now_ms),
            ],
        ),
        (
            "INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
             VALUES (?, ?, 'credential', ?, ?, ?, ?)".to_string(),
            vec![
                DbParam::Text(input.account_id.to_string()),
                DbParam::Text(input.user_id.to_string()),
                DbParam::Text(input.user_id.to_string()),
                DbParam::Text(input.password_hash.to_string()),
                DbParam::Int(input.now_ms),
                DbParam::Int(input.now_ms),
            ],
        ),
    ])
    .await
}

#[derive(Debug, Clone)]
pub struct CreateOAuthUser<'a> {
    pub user_id: &'a str,
    pub oauth_record_id: &'a str,
    pub provider_id: &'a str,
    pub provider_account_id: &'a str,
    pub name: &'a str,
    pub email: &'a str,
    pub image: Option<&'a str>,
    pub access_token: Option<&'a str>,
    pub id_token: Option<&'a str>,
    pub terms_version: &'a str,
    pub referred_by: Option<&'a str>,
    pub now_ms: i64,
}

pub async fn create_oauth_user_and_account<D: DbExecutor>(
    db: &D,
    input: &CreateOAuthUser<'_>,
) -> Result<(), DbError> {
    db.batch(vec![
        (
            "INSERT INTO user (id, name, email, email_verified, image, terms_version, terms_accepted_at, referred_by, created_at, updated_at)
             VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)".to_string(),
            vec![
                DbParam::Text(input.user_id.to_string()),
                DbParam::Text(input.name.to_string()),
                DbParam::Text(input.email.to_string()),
                DbParam::from(input.image),
                DbParam::Text(input.terms_version.to_string()),
                DbParam::Int(input.now_ms),
                DbParam::from(input.referred_by),
                DbParam::Int(input.now_ms),
                DbParam::Int(input.now_ms),
            ],
        ),
        (
            "INSERT INTO account (id, account_id, provider_id, user_id, access_token, id_token, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)".to_string(),
            vec![
                DbParam::Text(input.oauth_record_id.to_string()),
                DbParam::Text(input.provider_account_id.to_string()),
                DbParam::Text(input.provider_id.to_string()),
                DbParam::Text(input.user_id.to_string()),
                DbParam::from(input.access_token),
                DbParam::from(input.id_token),
                DbParam::Int(input.now_ms),
                DbParam::Int(input.now_ms),
            ],
        ),
    ])
    .await
}

#[derive(Debug, Clone)]
pub struct LinkOAuthAccount<'a> {
    pub oauth_record_id: &'a str,
    pub provider_id: &'a str,
    pub provider_account_id: &'a str,
    pub user_id: &'a str,
    pub access_token: Option<&'a str>,
    pub id_token: Option<&'a str>,
    pub now_ms: i64,
}

pub async fn link_oauth_account<D: DbExecutor>(
    db: &D,
    input: &LinkOAuthAccount<'_>,
) -> Result<(), DbError> {
    db.execute(
        "INSERT INTO account (id, account_id, provider_id, user_id, access_token, id_token, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        &[
            DbParam::Text(input.oauth_record_id.to_string()),
            DbParam::Text(input.provider_account_id.to_string()),
            DbParam::Text(input.provider_id.to_string()),
            DbParam::Text(input.user_id.to_string()),
            DbParam::from(input.access_token),
            DbParam::from(input.id_token),
            DbParam::Int(input.now_ms),
            DbParam::Int(input.now_ms),
        ],
    )
    .await?;
    Ok(())
}

pub async fn reset_credential_password_and_revoke_sessions<D: DbExecutor>(
    db: &D,
    user_id: &str,
    new_account_id: &str,
    password_hash: &str,
    verification_id: &str,
    now_ms: i64,
) -> Result<bool, DbError> {
    // Every mutation in this transaction is conditional on the same unconsumed
    // reset. A concurrent reset may have finished after the handler's first read.
    let valid = "EXISTS(SELECT 1 FROM verification WHERE id=?1 AND value=?2 AND expires_at>?3)";
    let params = vec![verification_id.into(), user_id.into(), now_ms.into()];
    let mut password_params = params.clone();
    password_params.push(password_hash.into());
    let mut insert_params = password_params.clone();
    insert_params.push(new_account_id.into());
    let mut rows = db.batch_rows(vec![
        (format!("UPDATE account SET password=?4,updated_at=?3 WHERE user_id=?2 AND provider_id='credential' AND {valid}"),password_params),
        (format!("INSERT INTO account (id,account_id,provider_id,user_id,password,created_at,updated_at)
          SELECT ?5,?2,'credential',?2,?4,?3,?3 WHERE {valid} AND NOT EXISTS
          (SELECT 1 FROM account WHERE user_id=?2 AND provider_id='credential')"),insert_params),
        (format!("DELETE FROM session WHERE user_id=?2 AND {valid}"),params.clone()),
        ("DELETE FROM verification WHERE id=?1 AND value=?2 AND expires_at>?3 RETURNING id".into(),params),
    ]).await?;
    Ok(rows.pop().is_some_and(|consumed| !consumed.is_empty()))
}

pub async fn create_verification<D: DbExecutor>(
    db: &D,
    row: &VerificationRow,
    now_ms: i64,
) -> Result<(), DbError> {
    db.execute(
        "INSERT INTO verification (id, identifier, value, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)",
        &[
            DbParam::Text(row.id.clone()),
            DbParam::Text(row.identifier.clone()),
            DbParam::Text(row.value.clone()),
            DbParam::Int(row.expires_at),
            DbParam::Int(now_ms),
            DbParam::Int(now_ms),
        ],
    )
    .await?;
    Ok(())
}

pub async fn find_valid_verification<D: DbExecutor>(
    db: &D,
    identifier: &str,
    now_ms: i64,
) -> Result<Option<VerificationRow>, DbError> {
    let Some(row) = db
        .query_one(
            "SELECT id, identifier, value, expires_at FROM verification
             WHERE identifier = ? AND expires_at > ?
             ORDER BY created_at DESC LIMIT 1",
            &[DbParam::Text(identifier.to_string()), DbParam::Int(now_ms)],
        )
        .await?
    else {
        return Ok(None);
    };
    Ok(Some(VerificationRow {
        id: row.get_string("id")?,
        identifier: row.get_string("identifier")?,
        value: row.get_string("value")?,
        expires_at: row.get_i64("expires_at")?,
    }))
}

pub async fn delete_verification<D: DbExecutor>(db: &D, id: &str) -> Result<(), DbError> {
    db.execute(
        "DELETE FROM verification WHERE id = ?",
        &[DbParam::Text(id.to_string())],
    )
    .await?;
    Ok(())
}

pub async fn mark_email_verified<D: DbExecutor>(
    db: &D,
    user_id: &str,
    now_ms: i64,
) -> Result<(), DbError> {
    db.execute(
        "UPDATE user SET email_verified = 1, updated_at = ? WHERE id = ?",
        &[DbParam::Int(now_ms), DbParam::Text(user_id.to_string())],
    )
    .await?;
    Ok(())
}

pub async fn claim_welcome_email_once<D: DbExecutor>(
    db: &D,
    user_id: &str,
    now_ms: i64,
) -> Result<bool, DbError> {
    let row = db
        .query_one(
            "UPDATE user SET welcome_email_sent_at = ? WHERE id = ? AND welcome_email_sent_at IS NULL RETURNING id",
            &[DbParam::Int(now_ms), DbParam::Text(user_id.to_string())],
        )
        .await?;
    Ok(row.is_some())
}

pub async fn get_share_link_owner<D: DbExecutor>(
    db: &D,
    token: &str,
) -> Result<Option<ShareLinkOwner>, DbError> {
    let Some(row) = db
        .query_one(
            "SELECT u.id, u.name, u.image
             FROM profile_share_links p
             INNER JOIN user u ON u.id = p.user_id
             WHERE p.token = ? AND u.is_private = 0",
            &[DbParam::Text(token.to_string())],
        )
        .await?
    else {
        return Ok(None);
    };
    Ok(Some(ShareLinkOwner {
        id: row.get_string("id")?,
        name: row.get_string("name")?,
        image: row.get_opt_string("image")?,
    }))
}

pub async fn get_referrer_for_user<D: DbExecutor>(
    db: &D,
    user_id: &str,
) -> Result<Option<ReferrerInfo>, DbError> {
    let Some(row) = db
        .query_one(
            "SELECT r.id, r.email
             FROM user invited
             INNER JOIN user r ON r.id = invited.referred_by
             WHERE invited.id = ?",
            &[DbParam::Text(user_id.to_string())],
        )
        .await?
    else {
        return Ok(None);
    };
    Ok(Some(ReferrerInfo {
        id: row.get_string("id")?,
        email: row.get_string("email")?,
    }))
}

pub async fn insert_friend_request<D: DbExecutor>(
    db: &D,
    requester_id: &str,
    target_id: &str,
) -> Result<bool, DbError> {
    let (u1, u2) = friendship_pair(requester_id, target_id);
    let row = db
        .query_one(
            "INSERT INTO friendships (user_id, friend_id, requested_by)
             SELECT ?, ?, ? FROM user WHERE id = ? AND is_private = 0
             ON CONFLICT (user_id, friend_id) DO NOTHING
             RETURNING user_id",
            &[
                DbParam::Text(u1.to_string()),
                DbParam::Text(u2.to_string()),
                DbParam::Text(requester_id.to_string()),
                DbParam::Text(target_id.to_string()),
            ],
        )
        .await?;
    Ok(row.is_some())
}

pub async fn delete_account_and_cleanup<D: DbExecutor>(
    db: &D,
    user_id: &str,
) -> Result<(), DbError> {
    db.batch(vec![
        (
            "DELETE FROM sends WHERE user_id = ?".to_string(),
            vec![DbParam::Text(user_id.to_string())],
        ),
        (
            "DELETE FROM change_requests WHERE requested_by = ? AND status = 'pending'".to_string(),
            vec![DbParam::Text(user_id.to_string())],
        ),
        (
            "DELETE FROM user WHERE id = ?".to_string(),
            vec![DbParam::Text(user_id.to_string())],
        ),
    ])
    .await
}
