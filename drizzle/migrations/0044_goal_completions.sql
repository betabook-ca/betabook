ALTER TABLE `goals` ADD `tags` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `goal_periods` ADD `tags` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
CREATE TABLE `goal_completions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`goal_id` integer NOT NULL,
	`period_start` text NOT NULL,
	`repeat` text NOT NULL,
	`completed_date` text,
	`title` text NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `goal_completions_period_idx` ON `goal_completions` (`goal_id`,`period_start`,`repeat`);
--> statement-breakpoint
CREATE TRIGGER goal_completions_journal_entries_insert AFTER INSERT ON journal_entries
BEGIN
  UPDATE goal_completions SET completed_date=NULL WHERE goal_id IN (SELECT id FROM goals WHERE user_id=NEW.user_id);
END;

--> statement-breakpoint
CREATE TRIGGER goal_completions_journal_entries_delete AFTER DELETE ON journal_entries
BEGIN
  UPDATE goal_completions SET completed_date=NULL WHERE goal_id IN (SELECT id FROM goals WHERE user_id=OLD.user_id);
END;

--> statement-breakpoint
CREATE TRIGGER goal_completions_journal_entries_update AFTER UPDATE OF user_id,climb_id,kind,is_ascent,entry_date,tags ON journal_entries WHEN NEW.user_id IS NOT OLD.user_id OR NEW.climb_id IS NOT OLD.climb_id OR NEW.kind IS NOT OLD.kind OR NEW.is_ascent IS NOT OLD.is_ascent OR NEW.entry_date IS NOT OLD.entry_date OR NEW.tags IS NOT OLD.tags
BEGIN
  UPDATE goal_completions SET completed_date=NULL WHERE (goal_id IN (SELECT id FROM goals WHERE user_id=NEW.user_id) OR goal_id IN (SELECT id FROM goals WHERE user_id=OLD.user_id));
END;

--> statement-breakpoint
CREATE TRIGGER goal_completions_goals_update AFTER UPDATE OF kind,target,discipline,grade,grade_match,timeframe,repeat,start_date,end_date,timezone,tags ON goals WHEN NEW.kind IS NOT OLD.kind OR NEW.target IS NOT OLD.target OR NEW.discipline IS NOT OLD.discipline OR NEW.grade IS NOT OLD.grade OR NEW.grade_match IS NOT OLD.grade_match OR NEW.timeframe IS NOT OLD.timeframe OR NEW.repeat IS NOT OLD.repeat OR NEW.start_date IS NOT OLD.start_date OR NEW.end_date IS NOT OLD.end_date OR NEW.timezone IS NOT OLD.timezone OR NEW.tags IS NOT OLD.tags
BEGIN
  UPDATE goal_completions SET completed_date=NULL WHERE (goal_id=NEW.id OR goal_id=OLD.id);
END;

--> statement-breakpoint
CREATE TRIGGER goal_completions_goal_periods_insert AFTER INSERT ON goal_periods
BEGIN
  UPDATE goal_completions SET completed_date=NULL WHERE goal_id=NEW.goal_id;
END;

--> statement-breakpoint
CREATE TRIGGER goal_completions_goal_periods_delete AFTER DELETE ON goal_periods
BEGIN
  UPDATE goal_completions SET completed_date=NULL WHERE goal_id=OLD.goal_id;
END;

--> statement-breakpoint
CREATE TRIGGER goal_completions_goal_periods_update AFTER UPDATE OF goal_id,start_date,end_date,kind,target,discipline,grade,grade_match,repeat,timezone,tags ON goal_periods WHEN NEW.goal_id IS NOT OLD.goal_id OR NEW.start_date IS NOT OLD.start_date OR NEW.end_date IS NOT OLD.end_date OR NEW.kind IS NOT OLD.kind OR NEW.target IS NOT OLD.target OR NEW.discipline IS NOT OLD.discipline OR NEW.grade IS NOT OLD.grade OR NEW.grade_match IS NOT OLD.grade_match OR NEW.repeat IS NOT OLD.repeat OR NEW.timezone IS NOT OLD.timezone OR NEW.tags IS NOT OLD.tags
BEGIN
  UPDATE goal_completions SET completed_date=NULL WHERE (goal_id=NEW.goal_id OR goal_id=OLD.goal_id);
END;

--> statement-breakpoint
CREATE TRIGGER goal_completions_climb_update AFTER UPDATE OF grade,type,area_id ON climbs
WHEN NEW.grade IS NOT OLD.grade OR NEW.type IS NOT OLD.type OR NEW.area_id IS NOT OLD.area_id
BEGIN
  UPDATE goal_completions SET completed_date=NULL WHERE goal_id IN (
    SELECT g.id FROM goals g JOIN journal_entries j ON j.user_id=g.user_id WHERE j.climb_id=NEW.id
  );
END;
