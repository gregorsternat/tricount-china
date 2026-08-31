UPDATE `invitations`
SET
  `status` = 'revoked',
  `revoked_at` = coalesce(`revoked_at`, cast(unixepoch('subsecond') * 1000 as integer)),
  `updated_at` = cast(unixepoch('subsecond') * 1000 as integer)
WHERE `status` = 'pending'
  AND EXISTS (
    SELECT 1
    FROM `invitations` AS `newer`
    WHERE `newer`.`group_id` = `invitations`.`group_id`
      AND `newer`.`invited_email` = `invitations`.`invited_email`
      AND `newer`.`status` = 'pending'
      AND (
        `newer`.`created_at` > `invitations`.`created_at`
        OR (
          `newer`.`created_at` = `invitations`.`created_at`
          AND `newer`.`id` > `invitations`.`id`
        )
      )
  );
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_one_pending_group_email_unique` ON `invitations` (`group_id`,`invited_email`) WHERE "invitations"."status" = 'pending';
