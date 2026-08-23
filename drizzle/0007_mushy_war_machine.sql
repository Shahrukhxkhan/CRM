CREATE TABLE `savedTableViews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`entityType` enum('contacts','tasks','deals') NOT NULL,
	`name` varchar(160) NOT NULL,
	`configJson` text NOT NULL,
	`isPinned` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `savedTableViews_id` PRIMARY KEY(`id`),
	CONSTRAINT `saved_table_view_owner_entity_name_unique` UNIQUE(`ownerId`,`entityType`,`name`)
);
--> statement-breakpoint
ALTER TABLE `savedTableViews` ADD CONSTRAINT `savedTableViews_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `saved_table_view_owner_entity_pinned_idx` ON `savedTableViews` (`ownerId`,`entityType`,`isPinned`);