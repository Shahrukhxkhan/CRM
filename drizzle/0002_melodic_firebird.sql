CREATE TABLE `ownerAutomationSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`taskMonitorCronExpression` varchar(128) NOT NULL DEFAULT '0 */15 * * * *',
	`taskMonitorCronTaskUid` varchar(65),
	`taskMonitorIsActive` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ownerAutomationSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `owner_automation_settings_owner_unique` UNIQUE(`ownerId`)
);
--> statement-breakpoint
CREATE TABLE `scheduledJobRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`scheduledExportId` int,
	`jobKind` enum('task_monitor','scheduled_export') NOT NULL,
	`scheduleCronTaskUid` varchar(65) NOT NULL,
	`runKey` varchar(191) NOT NULL,
	`status` enum('running','succeeded','failed','skipped') NOT NULL DEFAULT 'running',
	`resultJson` text,
	`errorMessage` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scheduledJobRuns_id` PRIMARY KEY(`id`),
	CONSTRAINT `scheduled_job_run_owner_key_unique` UNIQUE(`ownerId`,`runKey`)
);
--> statement-breakpoint
ALTER TABLE `followUps` ADD `reminderNotifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `followUps` ADD `escalationNotifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `ownerAutomationSettings` ADD CONSTRAINT `ownerAutomationSettings_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scheduledJobRuns` ADD CONSTRAINT `scheduledJobRuns_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scheduledJobRuns` ADD CONSTRAINT `scheduledJobRuns_scheduledExportId_scheduledExports_id_fk` FOREIGN KEY (`scheduledExportId`) REFERENCES `scheduledExports`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `owner_automation_settings_task_uid_idx` ON `ownerAutomationSettings` (`taskMonitorCronTaskUid`);--> statement-breakpoint
CREATE INDEX `scheduled_job_run_task_uid_idx` ON `scheduledJobRuns` (`scheduleCronTaskUid`);--> statement-breakpoint
CREATE INDEX `scheduled_job_run_export_created_idx` ON `scheduledJobRuns` (`scheduledExportId`,`createdAt`);--> statement-breakpoint
