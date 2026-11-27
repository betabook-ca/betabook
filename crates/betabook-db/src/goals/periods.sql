WITH RECURSIVE
owned AS (
  SELECT g.*, json_extract(?3, '$."' || g.timezone || '"') AS today,
    CASE WHEN ?7 THEN json_extract(?3, '$."' || g.timezone || '"')
         ELSE coalesce(?5, g.start_date) END AS lower_date
  FROM goals g WHERE g.user_id=?1 AND (?4 IS NULL OR g.id=?4) AND {visible}
),
origin AS (
  SELECT g.*, max(0, (CAST(strftime('%Y',lower_date) AS INTEGER)-CAST(strftime('%Y',start_date) AS INTEGER))*12
      + CAST(strftime('%m',lower_date) AS INTEGER)-CAST(strftime('%m',start_date) AS INTEGER)) AS months
  FROM owned g
),
starts AS (
  SELECT g.*, CASE repeat
    WHEN 'week' THEN date(start_date,'+'||(max(0,CAST((julianday(lower_date)-julianday(start_date))/7 AS INTEGER))*7)||' days')
    WHEN 'month' THEN date(start_date,'+'||months||' months')
    WHEN 'year' THEN date(start_date,'+'||(months/12)||' years')
    ELSE start_date END AS ps
  FROM origin g
),
periods(id,user_id,kind,target,discipline,grade,timeframe,repeat,start_date,end_date,timezone,grade_match,tags,recurring_end_date,today,ps,pe) AS (
  SELECT id,user_id,kind,target,discipline,grade,timeframe,repeat,start_date,end_date,timezone,grade_match,tags,recurring_end_date,today,ps,
    min(coalesce(recurring_end_date,'9999-12-31'), CASE repeat WHEN 'week' THEN date(ps,'+6 days')
      WHEN 'month' THEN date(ps,'+1 month','-1 day') WHEN 'year' THEN date(ps,'+1 year','-1 day') ELSE end_date END)
  FROM starts WHERE ps<=coalesce(recurring_end_date,'9999-12-31')
  UNION ALL
  SELECT id,user_id,kind,target,discipline,grade,timeframe,repeat,start_date,end_date,timezone,grade_match,tags,recurring_end_date,today,
    date(pe,'+1 day'), min(coalesce(recurring_end_date,'9999-12-31'), CASE repeat WHEN 'week' THEN date(pe,'+7 days')
      WHEN 'year' THEN date(pe,'+1 day','+1 year','-1 day') ELSE date(pe,'+1 day','+1 month','-1 day') END)
  FROM periods WHERE repeat <> 'none' AND pe<today AND pe<coalesce(recurring_end_date,'9999-12-31') AND (?6 IS NULL OR pe<?6)
),
all_periods AS (
  SELECT g.* FROM periods g WHERE NOT EXISTS (SELECT 1 FROM goal_periods h WHERE h.goal_id=g.id AND h.start_date=g.ps AND h.repeat=g.repeat)
  UNION ALL
  SELECT g.id,g.user_id,h.kind,h.target,h.discipline,h.grade,h.repeat,h.repeat,h.start_date,h.end_date,h.timezone,h.grade_match,h.tags,
      g.recurring_end_date,json_extract(?3, '$."' || h.timezone || '"'),h.start_date,h.end_date
  FROM goal_periods h JOIN goals g ON g.id=h.goal_id
  WHERE g.user_id=?1 AND (?4 IS NULL OR g.id=?4) AND {visible}
),
scoped AS (
  SELECT * FROM all_periods WHERE
    ((?7 AND (repeat='none' OR (ps<=today AND pe>=today))) OR
     (NOT ?7 AND (?5 IS NULL OR ps>=?5) AND (?6 IS NULL OR ps<?6)))
),
contributions AS (
  SELECT g.id, g.ps, g.repeat, {item} AS item, min(j.entry_date) AS entryDate
  FROM scoped g JOIN journal_entries j LEFT JOIN climbs c ON c.id=j.climb_id
  WHERE {matches} GROUP BY g.id,g.ps,g.repeat,item
),
ranked AS (
  SELECT *, row_number() OVER(PARTITION BY id,ps,repeat ORDER BY entryDate,item) AS ordinal FROM contributions
)
SELECT g.id,g.user_id AS userId,g.kind,g.target,g.discipline,g.grade,g.timeframe,g.repeat,g.start_date AS startDate,g.end_date AS endDate,
  g.timezone,g.grade_match AS gradeMatch,g.tags,(live.archive_token IS NOT NULL) AS archived,live.recurring_end_date AS recurringEndDate,
  json_extract(?3, '$."' || live.timezone || '"') AS today,g.ps AS periodStart,g.pe AS periodEnd,count(r.item) AS progress,
  max(CASE WHEN r.ordinal=g.target THEN r.entryDate END) AS completedDate
FROM scoped g JOIN goals live ON live.id=g.id LEFT JOIN ranked r ON r.id=g.id AND r.ps=g.ps AND r.repeat=g.repeat
GROUP BY g.id,g.ps,g.repeat ORDER BY g.pe DESC,g.id DESC
