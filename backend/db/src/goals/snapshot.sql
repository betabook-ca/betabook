INSERT INTO goal_periods(goal_id,start_date,end_date,target,repeat,timezone,kind,discipline,grade,grade_match,tags)
WITH RECURSIVE past AS (
  SELECT id,start_date AS ps,end_date AS pe,target,repeat,timezone,kind,discipline,grade,grade_match,tags,recurring_end_date
  FROM goals WHERE user_id=?1 AND id=?2 AND repeat<>'none'
  UNION ALL
  SELECT id,date(pe,'+1 day'),
    CASE repeat WHEN 'week' THEN date(pe,'+7 days') WHEN 'year' THEN date(pe,'+1 day','+1 year','-1 day')
      ELSE date(pe,'+1 day','+1 month','-1 day') END,
    target,repeat,timezone,kind,discipline,grade,grade_match,tags,recurring_end_date
  FROM past WHERE pe<?5 AND pe<coalesce(recurring_end_date,'9999-12-31')
)
SELECT id,ps,min(pe,coalesce(recurring_end_date,pe)),target,repeat,timezone,kind,discipline,grade,grade_match,tags
FROM past WHERE pe<?5 AND {guard}
ON CONFLICT DO NOTHING
