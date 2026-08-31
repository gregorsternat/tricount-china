CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`issuer` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_issuer_account_id_unique` ON `accounts` (`issuer`,`account_id`);--> statement-breakpoint
CREATE INDEX `accounts_user_id_idx` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `accounts_provider_id_idx` ON `accounts` (`provider_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`actor_user_id` text,
	`group_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`metadata_json` text,
	`ip_hash` text,
	`user_agent` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `audit_logs_owner_created_idx` ON `audit_logs` (`owner_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_group_created_idx` ON `audit_logs` (`group_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`group_id` text,
	`name` text NOT NULL,
	`category` text,
	`period_type` text DEFAULT 'month' NOT NULL,
	`amount_fen` integer NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`rollover` integer DEFAULT false NOT NULL,
	`alert_threshold_basis_points` integer DEFAULT 8000 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "budgets_amount_positive" CHECK("budgets"."amount_fen" > 0),
	CONSTRAINT "budgets_date_range_check" CHECK("budgets"."ends_at" >= "budgets"."starts_at"),
	CONSTRAINT "budgets_alert_threshold_range" CHECK("budgets"."alert_threshold_basis_points" > 0 and "budgets"."alert_threshold_basis_points" <= 10000)
);
--> statement-breakpoint
CREATE INDEX `budgets_owner_period_idx` ON `budgets` (`owner_user_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `budgets_group_period_idx` ON `budgets` (`group_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `categorization_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`provider` text,
	`match_field` text NOT NULL,
	`match_type` text DEFAULT 'contains' NOT NULL,
	`pattern` text NOT NULL,
	`category` text NOT NULL,
	`subcategory` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categorization_rules_owner_name_unique` ON `categorization_rules` (`owner_user_id`,`name`);--> statement-breakpoint
CREATE INDEX `categorization_rules_owner_priority_idx` ON `categorization_rules` (`owner_user_id`,`priority`);--> statement-breakpoint
CREATE TABLE `expense_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`expense_id` text NOT NULL,
	`member_id` text NOT NULL,
	`amount_fen` integer NOT NULL,
	`percentage_basis_points` integer,
	`shares_weight` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `group_members`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "expense_shares_amount_nonnegative" CHECK("expense_shares"."amount_fen" >= 0),
	CONSTRAINT "expense_shares_percentage_range" CHECK("expense_shares"."percentage_basis_points" is null or ("expense_shares"."percentage_basis_points" >= 0 and "expense_shares"."percentage_basis_points" <= 10000)),
	CONSTRAINT "expense_shares_weight_positive" CHECK("expense_shares"."shares_weight" is null or "expense_shares"."shares_weight" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_shares_expense_member_unique` ON `expense_shares` (`expense_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `expense_shares_member_id_idx` ON `expense_shares` (`member_id`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`created_by_user_id` text,
	`paid_by_member_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`category` text DEFAULT 'other' NOT NULL,
	`amount_fen` integer NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`amount_base_fen` integer,
	`fx_rate_micros` integer,
	`occurred_at` integer NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`receipt_url` text,
	`status` text DEFAULT 'active' NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`paid_by_member_id`) REFERENCES `group_members`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "expenses_amount_positive" CHECK("expenses"."amount_fen" > 0),
	CONSTRAINT "expenses_base_amount_positive" CHECK("expenses"."amount_base_fen" is null or "expenses"."amount_base_fen" > 0),
	CONSTRAINT "expenses_fx_rate_positive" CHECK("expenses"."fx_rate_micros" is null or "expenses"."fx_rate_micros" > 0)
);
--> statement-breakpoint
CREATE INDEX `expenses_group_occurred_idx` ON `expenses` (`group_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `expenses_group_category_idx` ON `expenses` (`group_id`,`category`);--> statement-breakpoint
CREATE INDEX `expenses_paid_by_member_idx` ON `expenses` (`paid_by_member_id`);--> statement-breakpoint
CREATE INDEX `expenses_created_by_user_idx` ON `expenses` (`created_by_user_id`);--> statement-breakpoint
CREATE TABLE `fx_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text,
	`base_currency` text NOT NULL,
	`quote_currency` text NOT NULL,
	`rate_micros` integer NOT NULL,
	`effective_date` text NOT NULL,
	`source` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "fx_rates_positive" CHECK("fx_rates"."rate_micros" > 0),
	CONSTRAINT "fx_rates_distinct_currencies" CHECK("fx_rates"."base_currency" <> "fx_rates"."quote_currency")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fx_rates_pair_date_source_owner_unique` ON `fx_rates` (`base_currency`,`quote_currency`,`effective_date`,`source`,`owner_user_id`);--> statement-breakpoint
CREATE INDEX `fx_rates_pair_date_idx` ON `fx_rates` (`base_currency`,`quote_currency`,`effective_date`);--> statement-breakpoint
CREATE TABLE `group_members` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`nickname` text,
	`joined_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`left_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_members_group_user_unique` ON `group_members` (`group_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `group_members_user_status_idx` ON `group_members` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `group_members_group_status_idx` ON `group_members` (`group_id`,`status`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`emoji` text DEFAULT '🧾' NOT NULL,
	`color` text DEFAULT '#F97316' NOT NULL,
	`base_currency` text DEFAULT 'CNY' NOT NULL,
	`timezone` text DEFAULT 'Asia/Shanghai' NOT NULL,
	`academic_year_label` text,
	`starts_at` integer,
	`ends_at` integer,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "groups_date_range_check" CHECK("groups"."ends_at" is null or "groups"."starts_at" is null or "groups"."ends_at" >= "groups"."starts_at")
);
--> statement-breakpoint
CREATE INDEX `groups_owner_user_id_idx` ON `groups` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `groups_owner_archived_idx` ON `groups` (`owner_user_id`,`is_archived`);--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`scope` text NOT NULL,
	`key_hash` text NOT NULL,
	`request_hash` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`response_status` integer,
	`response_body_json` text,
	`resource_type` text,
	`resource_id` text,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idempotency_owner_scope_key_unique` ON `idempotency_keys` (`owner_user_id`,`scope`,`key_hash`);--> statement-breakpoint
CREATE INDEX `idempotency_expires_at_idx` ON `idempotency_keys` (`expires_at`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`provider` text NOT NULL,
	`source_filename` text NOT NULL,
	`source_file_hash` text NOT NULL,
	`file_size_bytes` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`period_start` integer,
	`period_end` integer,
	`total_rows` integer DEFAULT 0 NOT NULL,
	`imported_rows` integer DEFAULT 0 NOT NULL,
	`duplicate_rows` integer DEFAULT 0 NOT NULL,
	`skipped_rows` integer DEFAULT 0 NOT NULL,
	`error_rows` integer DEFAULT 0 NOT NULL,
	`errors_json` text,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "import_batches_rows_nonnegative" CHECK("import_batches"."total_rows" >= 0 and "import_batches"."imported_rows" >= 0 and "import_batches"."duplicate_rows" >= 0 and "import_batches"."skipped_rows" >= 0 and "import_batches"."error_rows" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_batches_owner_provider_hash_unique` ON `import_batches` (`owner_user_id`,`provider`,`source_file_hash`);--> statement-breakpoint
CREATE INDEX `import_batches_owner_created_idx` ON `import_batches` (`owner_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`inviter_user_id` text NOT NULL,
	`invited_email` text NOT NULL,
	`token_hash` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_by_user_id` text,
	`accepted_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`accepted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_hash_unique` ON `invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invitations_email_status_expires_idx` ON `invitations` (`invited_email`,`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `invitations_group_status_idx` ON `invitations` (`group_id`,`status`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limits_key_unique` ON `rate_limits` (`key`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`created_by_user_id` text,
	`from_member_id` text NOT NULL,
	`to_member_id` text NOT NULL,
	`amount_fen` integer NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`amount_base_fen` integer,
	`occurred_at` integer NOT NULL,
	`note` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`from_member_id`) REFERENCES `group_members`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`to_member_id`) REFERENCES `group_members`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "settlements_amount_positive" CHECK("settlements"."amount_fen" > 0),
	CONSTRAINT "settlements_members_differ" CHECK("settlements"."from_member_id" <> "settlements"."to_member_id")
);
--> statement-breakpoint
CREATE INDEX `settlements_group_occurred_idx` ON `settlements` (`group_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `settlements_from_member_idx` ON `settlements` (`from_member_id`);--> statement-breakpoint
CREATE INDEX `settlements_to_member_idx` ON `settlements` (`to_member_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`preferred_currency` text DEFAULT 'CNY' NOT NULL,
	`timezone` text DEFAULT 'Asia/Shanghai' NOT NULL,
	`locale` text DEFAULT 'fr' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_created_at_idx` ON `users` (`created_at`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verifications_identifier_idx` ON `verifications` (`identifier`);--> statement-breakpoint
CREATE INDEX `verifications_expires_at_idx` ON `verifications` (`expires_at`);--> statement-breakpoint
CREATE TABLE `wallet_expense_links` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`wallet_transaction_id` text NOT NULL,
	`expense_id` text NOT NULL,
	`match_type` text DEFAULT 'manual' NOT NULL,
	`confidence_basis_points` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`wallet_transaction_id`) REFERENCES `wallet_transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "wallet_expense_links_confidence_range" CHECK("wallet_expense_links"."confidence_basis_points" is null or ("wallet_expense_links"."confidence_basis_points" >= 0 and "wallet_expense_links"."confidence_basis_points" <= 10000))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_expense_links_transaction_unique` ON `wallet_expense_links` (`wallet_transaction_id`);--> statement-breakpoint
CREATE INDEX `wallet_expense_links_owner_idx` ON `wallet_expense_links` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `wallet_expense_links_expense_idx` ON `wallet_expense_links` (`expense_id`);--> statement-breakpoint
CREATE TABLE `wallet_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`import_batch_id` text,
	`provider` text NOT NULL,
	`source_id` text NOT NULL,
	`external_transaction_id` text,
	`merchant_order_id` text,
	`fingerprint` text NOT NULL,
	`parser_version` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`completed_at` integer,
	`direction` text NOT NULL,
	`kind` text,
	`status` text DEFAULT 'unknown' NOT NULL,
	`amount_fen` integer NOT NULL,
	`is_refund` integer DEFAULT false NOT NULL,
	`refund_amount_fen` integer,
	`related_transaction_id` text,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`merchant` text,
	`counterparty` text,
	`payment_method` text,
	`raw_description` text,
	`note` text,
	`category` text DEFAULT 'uncategorized' NOT NULL,
	`category_raw` text,
	`subcategory` text,
	`location` text,
	`raw_payload_json` text,
	`is_excluded` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "wallet_tx_amount_nonnegative" CHECK("wallet_transactions"."amount_fen" >= 0),
	CONSTRAINT "wallet_tx_refund_amount_nonnegative" CHECK("wallet_transactions"."refund_amount_fen" is null or "wallet_transactions"."refund_amount_fen" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_tx_owner_provider_source_unique` ON `wallet_transactions` (`owner_user_id`,`provider`,`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_tx_owner_provider_external_unique` ON `wallet_transactions` (`owner_user_id`,`provider`,`external_transaction_id`);--> statement-breakpoint
CREATE INDEX `wallet_tx_owner_fingerprint_idx` ON `wallet_transactions` (`owner_user_id`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `wallet_tx_owner_occurred_idx` ON `wallet_transactions` (`owner_user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `wallet_tx_owner_category_idx` ON `wallet_transactions` (`owner_user_id`,`category`);--> statement-breakpoint
CREATE INDEX `wallet_tx_import_batch_idx` ON `wallet_transactions` (`import_batch_id`);