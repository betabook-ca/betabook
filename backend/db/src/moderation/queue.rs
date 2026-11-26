use super::{Change, Description, FACTS, Result};
use crate::{DbError, DbExecutor};
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};

pub async fn review_queue(
    db: &impl DbExecutor,
    user: &str,
    after: Option<(i64, i64)>,
) -> Result<Value> {
    let grants=db.query_all("SELECT a.id,a.name FROM areas a JOIN admin_area_scopes s ON s.area_id=a.id JOIN user u ON u.id=s.user_id AND u.role='admin' WHERE u.id=? ORDER BY a.name",&[user.into()]).await?;
    let areas: Vec<_> = grants
        .iter()
        .map(|r| Ok(json!({"id":r.get_i64("id")?,"name":r.get_string("name")?})))
        .collect::<std::result::Result<_, DbError>>()?;
    let sql=format!("WITH RECURSIVE managed(id) AS (
 SELECT s.area_id FROM admin_area_scopes s JOIN user u ON u.id=s.user_id AND u.role='admin' WHERE u.id=?1
 UNION SELECT a.id FROM areas a JOIN managed m ON m.id=a.parent_id),
 requests AS (SELECT * FROM change_requests WHERE status='pending' AND requested_by IS NOT ?1 AND (?2 IS NULL OR (requested_at,id)>(?2,?3))),
 described AS ({FACTS})
 SELECT * FROM described WHERE facts->>'sourceArea' IS NOT NULL
 AND (type NOT IN ('area_reparent','climb_merge','climb_move') OR facts->>'destinationArea' IS NOT NULL)
 AND (facts->>'sourceArea' IN managed OR facts->>'destinationArea' IN managed)
 ORDER BY requested_at,id LIMIT 26");
    let mut requests = db
        .query_all(
            &sql,
            &[
                user.into(),
                after.map(|(_, a)| a).into(),
                after.map(|(i, _)| i).into(),
            ],
        )
        .await?;
    let more = requests.len() > 25;
    requests.truncate(25);
    let mut rows = Vec::new();
    let mut scopes = Vec::new();
    for row in &requests {
        let c = Change::from_row(row)?;
        let scope = c.scope()?;
        let desc = Description::for_change(&c);
        let id = row.get_i64("id")?;
        scopes.push(json!({"id":id,"areas":scope}));
        let image = row.get_opt_string("requesterImage")?;
        rows.push(json!({"id":id,"requestedAt":row.get_i64("requested_at")?,"description":desc,
       "requester":row.get_opt_string("requesterName")?.map(|name|json!({"name":name,"image":image})),
       "approvers":[],"missingAreaNames":[],"alreadyApproved":false}));
    }
    if !rows.is_empty() {
        let votes=db.query_all("WITH RECURSIVE required(request,area) AS (
 SELECT r.value->>'id',a.value FROM json_each(?1) r,json_each(r.value,'$.areas') a),
 chain(area,id) AS (SELECT DISTINCT area,area FROM required UNION SELECT chain.area,a.parent_id FROM chain JOIN areas a ON a.id=chain.id WHERE a.parent_id IS NOT NULL)
 SELECT r.request,a.id AS area,a.name AS areaName,u.id,u.name,u.image,(u.role='admin' AND EXISTS (
 SELECT 1 FROM admin_area_scopes s JOIN chain ON chain.id=s.area_id WHERE chain.area=r.area AND s.user_id=u.id)) AS covered
 FROM required r JOIN areas a ON a.id=r.area LEFT JOIN change_request_approvals v ON v.request_id=r.request LEFT JOIN user u ON u.id=v.user_id ORDER BY v.created_at,u.id",
 &[json!(scopes).to_string().into()]).await?;
        for row in &mut rows {
            let id = row["id"].as_i64();
            let mut areas = HashMap::new();
            let mut covered = HashSet::new();
            let mut approvers = Vec::new();
            let mut seen = HashSet::new();
            for v in &votes {
                if Some(v.get_i64("request")?) != id {
                    continue;
                }
                let area = v.get_i64("area")?;
                areas.insert(area, v.get_string("areaName")?);
                if let Some(who) = v.get_opt_string("id")? {
                    if seen.insert(who.clone()) {
                        approvers.push(json!({"id":who,"name":v.get_string("name")?,"image":v.get_opt_string("image")?}));
                    }
                    if v.get_bool("covered")? {
                        covered.insert(area);
                    }
                }
            }
            let mut missing: Vec<_> = areas
                .into_iter()
                .filter(|(i, _)| !covered.contains(i))
                .map(|(_, n)| n)
                .collect();
            missing.sort();
            row["alreadyApproved"] = json!(seen.contains(user));
            row["approvers"] = json!(approvers);
            row["missingAreaNames"] = json!(missing);
        }
    }
    let next = rows.last().filter(|_| more).map(|row| {
        format!(
            "/admin/requests?after={}&at={}",
            row["id"], row["requestedAt"]
        )
    });
    Ok(json!({"managedAreas":areas,"rows":rows,"nextHref":next,"hasPrevious":after.is_some()}))
}
