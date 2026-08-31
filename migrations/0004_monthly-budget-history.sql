DROP INDEX IF EXISTS `budgets_one_active_group_unique`;--> statement-breakpoint
UPDATE `budgets`
SET `is_active` = 0
WHERE `id` IN (
	SELECT `id`
	FROM (
		SELECT
			`id`,
			row_number() OVER (
				PARTITION BY `group_id`, `category`, `period_type`, `starts_at`, `ends_at`
				ORDER BY `updated_at` DESC, `created_at` DESC, `id` ASC
			) AS `duplicate_rank`
		FROM `budgets`
		WHERE `group_id` IS NOT NULL AND `is_active` = 1
	)
	WHERE `duplicate_rank` > 1
);--> statement-breakpoint
UPDATE `budgets`
SET `is_active` = 0
WHERE `id` IN (
	SELECT `id`
	FROM (
		SELECT
			`id`,
			row_number() OVER (
				PARTITION BY `owner_user_id`, `category`, `period_type`, `starts_at`, `ends_at`
				ORDER BY `updated_at` DESC, `created_at` DESC, `id` ASC
			) AS `duplicate_rank`
		FROM `budgets`
		WHERE `group_id` IS NULL AND `is_active` = 1
	)
	WHERE `duplicate_rank` > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_active_group_total_period_unique` ON `budgets` (`group_id`,`period_type`,`starts_at`,`ends_at`) WHERE "budgets"."group_id" is not null and "budgets"."category" is null and "budgets"."is_active" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_active_group_category_period_unique` ON `budgets` (`group_id`,`category`,`period_type`,`starts_at`,`ends_at`) WHERE "budgets"."group_id" is not null and "budgets"."category" is not null and "budgets"."is_active" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_active_personal_total_period_unique` ON `budgets` (`owner_user_id`,`period_type`,`starts_at`,`ends_at`) WHERE "budgets"."group_id" is null and "budgets"."category" is null and "budgets"."is_active" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_active_personal_category_period_unique` ON `budgets` (`owner_user_id`,`category`,`period_type`,`starts_at`,`ends_at`) WHERE "budgets"."group_id" is null and "budgets"."category" is not null and "budgets"."is_active" = 1;
