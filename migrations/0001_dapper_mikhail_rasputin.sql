ALTER TABLE `import_batches` ADD `preview_payload_json` text;--> statement-breakpoint
ALTER TABLE `import_batches` ADD `preview_expires_at` integer;--> statement-breakpoint
CREATE INDEX `import_batches_owner_status_preview_idx` ON `import_batches` (`owner_user_id`,`status`,`preview_expires_at`);