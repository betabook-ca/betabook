SELECT r.*, json_object(
 'name',coalesce(a.name,c.name),'sourceArea',coalesce(a.id,c.area_id),
 'parent',a.parent_id,'parentName',pa.name,'areaName',ca.name,'type',c.type,'grade',c.grade,
 'description',c.description,'sendCount',coalesce(c.send_count,0),'brokenOn',c.broken_on,
 'destinationArea',coalesce(d.id,t.area_id),'destinationName',coalesce(d.name,t.name),
 'destinationType',t.type,'destinationGrade',t.grade,'destinationDescription',t.description,
 'destinationBrokenOn',t.broken_on
) AS facts, u.name AS requesterName, u.image AS requesterImage, u.email AS requesterEmail
FROM requests r
LEFT JOIN user u ON u.id=r.requested_by
LEFT JOIN areas a ON r.type LIKE 'area_%' AND a.id=r.entity_id
LEFT JOIN areas pa ON pa.id=a.parent_id
LEFT JOIN climbs c ON r.type LIKE 'climb_%' AND c.id=r.entity_id
LEFT JOIN areas ca ON ca.id=c.area_id
LEFT JOIN areas d ON d.id=CASE r.type WHEN 'area_reparent' THEN r.payload->>'newParentId'
 WHEN 'climb_move' THEN r.payload->>'newAreaId' END
LEFT JOIN climbs t ON r.type='climb_merge' AND t.id=r.payload->>'targetClimbId'
