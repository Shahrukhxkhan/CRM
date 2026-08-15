CREATE TABLE `activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`contactId` int NOT NULL,
	`type` enum('call','email','meeting','message','note') NOT NULL DEFAULT 'note',
	`body` text NOT NULL,
	`occurredAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`website` varchar(2048),
	`phone` varchar(64),
	`address` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contactTags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`name` varchar(80) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contactTags_id` PRIMARY KEY(`id`),
	CONSTRAINT `contact_tags_contact_name_uq` UNIQUE(`contactId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`companyId` int,
	`name` varchar(255) NOT NULL,
	`email` varchar(320),
	`phone` varchar(64),
	`source` varchar(120),
	`estimatedValue` decimal(12,2),
	`stage` enum('new','contacted','qualified','proposal','won','lost') NOT NULL DEFAULT 'new',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `followUps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`contactId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`dueAt` timestamp NOT NULL,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `followUps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quoteItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quoteId` int NOT NULL,
	`description` text NOT NULL,
	`quantity` decimal(12,2) NOT NULL,
	`unitPrice` decimal(12,2) NOT NULL,
	`lineTotal` decimal(12,2) NOT NULL,
	`position` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quoteItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`contactId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`status` enum('draft','sent','accepted','declined') NOT NULL DEFAULT 'draft',
	`expiresAt` timestamp,
	`notes` text,
	`subtotal` decimal(12,2) NOT NULL,
	`total` decimal(12,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `activities` ADD CONSTRAINT `activities_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activities` ADD CONSTRAINT `activities_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `companies` ADD CONSTRAINT `companies_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contactTags` ADD CONSTRAINT `contactTags_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_companyId_companies_id_fk` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `followUps` ADD CONSTRAINT `followUps_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `followUps` ADD CONSTRAINT `followUps_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quoteItems` ADD CONSTRAINT `quoteItems_quoteId_quotes_id_fk` FOREIGN KEY (`quoteId`) REFERENCES `quotes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `activities_owner_contact_occurred_idx` ON `activities` (`ownerId`,`contactId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `companies_owner_name_idx` ON `companies` (`ownerId`,`name`);--> statement-breakpoint
CREATE INDEX `contacts_owner_stage_updated_idx` ON `contacts` (`ownerId`,`stage`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `contacts_owner_company_idx` ON `contacts` (`ownerId`,`companyId`);--> statement-breakpoint
CREATE INDEX `contacts_owner_name_idx` ON `contacts` (`ownerId`,`name`);--> statement-breakpoint
CREATE INDEX `followups_owner_completed_due_idx` ON `followUps` (`ownerId`,`completedAt`,`dueAt`);--> statement-breakpoint
CREATE INDEX `followups_owner_contact_due_idx` ON `followUps` (`ownerId`,`contactId`,`dueAt`);--> statement-breakpoint
CREATE INDEX `quote_items_quote_position_idx` ON `quoteItems` (`quoteId`,`position`);--> statement-breakpoint
CREATE INDEX `quotes_owner_status_updated_idx` ON `quotes` (`ownerId`,`status`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `quotes_owner_contact_created_idx` ON `quotes` (`ownerId`,`contactId`,`createdAt`);