WITH RECURSIVE required(id) AS (SELECT DISTINCT value FROM json_each(?1,'$.scope')),
ancestors(area,ancestor) AS (
 SELECT id,id FROM required
 UNION SELECT ancestors.area,a.parent_id FROM ancestors JOIN areas a ON a.id=ancestors.ancestor WHERE a.parent_id IS NOT NULL
), covered(area,admin) AS (
 SELECT chain.area,u.id FROM ancestors chain JOIN admin_area_scopes grant_row ON grant_row.area_id=chain.ancestor
 JOIN user u ON u.id=grant_row.user_id AND u.role='admin'
 WHERE u.id=?1->>'reviewer' OR EXISTS(SELECT 1 FROM change_request_approvals v WHERE v.user_id=u.id AND v.request_id=?1->>'request')
)
SELECT EXISTS(SELECT 1 FROM covered WHERE admin=?1->>'reviewer') AS any_scope,
 NOT EXISTS(SELECT 1 FROM required WHERE NOT EXISTS(SELECT 1 FROM covered WHERE area=required.id)) AS all_scopes
