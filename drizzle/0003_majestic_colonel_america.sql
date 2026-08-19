CREATE TABLE `importMappingProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`sourceHeadersJson` text NOT NULL,
	`mappingJson` text NOT NULL,
	`transformsJson` text NOT NULL,
	`duplicateStrategy` enum('create','update','skip') NOT NULL DEFAULT 'skip',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `importMappingProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `import_mapping_profile_owner_name_unique` UNIQUE(`ownerId`,`name`)
);
--> statement-breakpoint
ALTER TABLE `contactImports` ADD `isValidationOnly` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `contactImports` ADD `validationSummaryJson` text;--> statement-breakpoint
ALTER TABLE `importMappingProfiles` ADD CONSTRAINT `importMappingProfiles_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `import_mapping_profile_owner_idx` ON `importMappingProfiles` (`ownerId`);