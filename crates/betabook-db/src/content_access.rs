use serde::{Deserialize, Serialize};

use crate::executor::{DbError, DbExecutor, DbParam};

pub fn opt_text(value: Option<&str>) -> DbParam {
    match value {
        Some(text) => DbParam::Text(text.to_string()),
        None => DbParam::Null,
    }
}

pub fn content_visible_sql(
    viewer_id: Option<&str>,
    author_expr: &str,
    audience_expr: &str,
    params: &mut Vec<DbParam>,
) -> String {
    let v = opt_text(viewer_id);
    params.push(v.clone());
    params.push(v.clone());
    params.push(v.clone());
    params.push(v);
    format!(
        "EXISTS (
      SELECT 1 FROM user content_owner
      WHERE content_owner.id = {author_expr} AND (
        content_owner.id = ? OR (content_owner.is_private = 0 AND (
          {audience_expr} = 'everyone' OR (? IS NOT NULL AND (
            {audience_expr} = 'public' OR (
              {audience_expr} = 'friends' AND EXISTS (
                SELECT 1 FROM friendships WHERE user_id = min(content_owner.id, ?)
                  AND friend_id = max(content_owner.id, ?) AND status = 'accepted'
              )
            )
          ))
        ))
      )
    )"
    )
}

pub fn journal_visible_sql(
    viewer_id: Option<&str>,
    author_expr: &str,
    params: &mut Vec<DbParam>,
) -> String {
    content_visible_sql(
        viewer_id,
        author_expr,
        "content_owner.journal_visibility",
        params,
    )
}

pub fn trips_visible_sql(
    viewer_id: Option<&str>,
    owner_expr: &str,
    params: &mut Vec<DbParam>,
) -> String {
    content_visible_sql(
        viewer_id,
        owner_expr,
        "content_owner.trip_visibility",
        params,
    )
}

pub fn climb_lists_visible_sql(
    viewer_id: Option<&str>,
    owner_expr: &str,
    params: &mut Vec<DbParam>,
) -> String {
    content_visible_sql(
        viewer_id,
        owner_expr,
        "content_owner.climb_list_visibility",
        params,
    )
}

pub fn send_comment_visible_sql(
    viewer_id: Option<&str>,
    author_expr: &str,
    params: &mut Vec<DbParam>,
) -> String {
    content_visible_sql(
        viewer_id,
        author_expr,
        "content_owner.send_comment_visibility",
        params,
    )
}

pub fn accepted_friend_ids_sql(user_id: &str, params: &mut Vec<DbParam>) -> String {
    params.push(DbParam::Text(user_id.to_string()));
    params.push(DbParam::Text(user_id.to_string()));
    "SELECT friend_id AS id FROM friendships WHERE user_id = ? AND status = 'accepted'
     UNION ALL SELECT user_id FROM friendships WHERE friend_id = ? AND status = 'accepted'"
        .to_string()
}

pub fn companions_json_sql(
    viewer_id: Option<&str>,
    entry_id_expr: &str,
    params: &mut Vec<DbParam>,
) -> String {
    params.push(opt_text(viewer_id));
    let visible = journal_visible_sql(viewer_id, "tagged_entry.user_id", params);
    format!(
        "(SELECT json_group_array(json_object('id', companion.id, 'name', companion.name,
      'image', companion.image,
      'isSelf', json(CASE WHEN companion.id = ? THEN 'true' ELSE 'false' END)))
      FROM journal_companions jc INDEXED BY journal_companions_active_idx
      JOIN journal_entries tagged_entry ON tagged_entry.id = jc.entry_id
      JOIN user companion ON companion.id = jc.user_id
      JOIN friendships tagged_friendship ON tagged_friendship.user_id = jc.friendship_user_id
        AND tagged_friendship.friend_id = jc.friendship_friend_id
      WHERE jc.entry_id = {entry_id_expr} AND jc.suppressed = 0
        AND tagged_friendship.status = 'accepted'
        AND {visible}
    )"
    )
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileAccess {
    pub journal: bool,
    pub trips: bool,
    pub lists: bool,
}

pub async fn get_profile_access<D: DbExecutor>(
    db: &D,
    owner_id: &str,
    viewer_id: &str,
) -> Result<ProfileAccess, DbError> {
    let mut sql_params = Vec::new();
    let j_sql = journal_visible_for_bound_owner(viewer_id, owner_id, &mut sql_params);
    let t_sql = trips_visible_for_bound_owner(viewer_id, owner_id, &mut sql_params);
    let l_sql = climb_lists_visible_for_bound_owner(viewer_id, owner_id, &mut sql_params);
    let sql = format!("SELECT {j_sql} AS journal, {t_sql} AS trips, {l_sql} AS lists");
    let row = db
        .query_one(&sql, &sql_params)
        .await?
        .ok_or(DbError::Column("journal"))?;
    Ok(ProfileAccess {
        journal: row.get_i64("journal")? == 1,
        trips: row.get_i64("trips")? == 1,
        lists: row.get_i64("lists")? == 1,
    })
}

fn content_visible_for_bound_owner(
    viewer_id: Option<&str>,
    owner_id: &str,
    audience_expr: &str,
    params: &mut Vec<DbParam>,
) -> String {
    params.push(DbParam::Text(owner_id.to_string()));
    let v = opt_text(viewer_id);
    params.push(v.clone());
    params.push(v.clone());
    params.push(v.clone());
    params.push(v);
    format!(
        "EXISTS (
      SELECT 1 FROM user content_owner
      WHERE content_owner.id = ? AND (
        content_owner.id = ? OR (content_owner.is_private = 0 AND (
          {audience_expr} = 'everyone' OR (? IS NOT NULL AND (
            {audience_expr} = 'public' OR (
              {audience_expr} = 'friends' AND EXISTS (
                SELECT 1 FROM friendships WHERE user_id = min(content_owner.id, ?)
                  AND friend_id = max(content_owner.id, ?) AND status = 'accepted'
              )
            )
          ))
        ))
      )
    )"
    )
}

fn journal_visible_for_bound_owner(
    viewer_id: &str,
    owner_id: &str,
    params: &mut Vec<DbParam>,
) -> String {
    content_visible_for_bound_owner(
        Some(viewer_id),
        owner_id,
        "content_owner.journal_visibility",
        params,
    )
}

fn trips_visible_for_bound_owner(
    viewer_id: &str,
    owner_id: &str,
    params: &mut Vec<DbParam>,
) -> String {
    content_visible_for_bound_owner(
        Some(viewer_id),
        owner_id,
        "content_owner.trip_visibility",
        params,
    )
}

fn climb_lists_visible_for_bound_owner(
    viewer_id: &str,
    owner_id: &str,
    params: &mut Vec<DbParam>,
) -> String {
    content_visible_for_bound_owner(
        Some(viewer_id),
        owner_id,
        "content_owner.climb_list_visibility",
        params,
    )
}

pub async fn can_read_journal<D: DbExecutor>(
    db: &D,
    owner_id: &str,
    viewer_id: Option<&str>,
) -> Result<bool, DbError> {
    let mut params = Vec::new();
    let pred = content_visible_for_bound_owner(
        viewer_id,
        owner_id,
        "content_owner.journal_visibility",
        &mut params,
    );
    let sql = format!("SELECT {pred} AS visible");
    let row = db.query_one(&sql, &params).await?;
    Ok(row.and_then(|r| r.get_opt_i64("visible").ok().flatten()) == Some(1))
}
