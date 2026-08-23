CREATE TABLE `capturedCommunications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`connectionId` int NOT NULL,
	`contactId` int,
	`dealId` int,
	`activityId` int,
	`externalEventId` varchar(512) NOT NULL,
	`externalCalendarId` varchar(512),
	`title` varchar(512) NOT NULL,
	`descriptionSnippet` varchar(1000),
	`startsAt` timestamp,
	`endsAt` timestamp,
	`providerUpdatedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `capturedCommunications_id` PRIMARY KEY(`id`),
	CONSTRAINT `captured_communication_connection_event_unique` UNIQUE(`connectionId`,`externalEventId`)
);
--> statement-breakpoint
CREATE TABLE `communicationAutomationRules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`connectionId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`triggerType` enum('calendar_event_captured') NOT NULL DEFAULT 'calendar_event_captured',
	`conditionsJson` text NOT NULL,
	`actionType` enum('create_follow_up') NOT NULL DEFAULT 'create_follow_up',
	`taskTemplateJson` text NOT NULL,
	`isActive` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `communicationAutomationRules_id` PRIMARY KEY(`id`),
	CONSTRAINT `communication_rule_connection_name_unique` UNIQUE(`connectionId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `communicationConnections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`provider` enum('google_calendar') NOT NULL DEFAULT 'google_calendar',
	`externalAccountEmail` varchar(320),
	`connectionStatus` enum('disconnected','connected','error') NOT NULL DEFAULT 'disconnected',
	`lastSyncedAt` timestamp,
	`lastSyncError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `communicationConnections_id` PRIMARY KEY(`id`),
	CONSTRAINT `communication_connection_owner_provider_unique` UNIQUE(`ownerId`,`provider`)
);
--> statement-breakpoint
CREATE TABLE `workspaceMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`userId` int NOT NULL,
	`workspaceRole` enum('manager','contributor') NOT NULL DEFAULT 'contributor',
	`isActive` boolean NOT NULL DEFAULT true,
	`invitedAt` timestamp NOT NULL DEFAULT (now()),
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspaceMembers_id` PRIMARY KEY(`id`),
	CONSTRAINT `workspace_member_owner_user_unique` UNIQUE(`ownerId`,`userId`)
);
--> statement-breakpoint
ALTER TABLE `activities` ADD `actorUserId` int;--> statement-breakpoint
ALTER TABLE `deals` ADD `assigneeUserId` int;--> statement-breakpoint
ALTER TABLE `followUps` ADD `assigneeUserId` int;--> statement-breakpoint
ALTER TABLE `taskComments` ADD `authorUserId` int;--> statement-breakpoint
ALTER TABLE `capturedCommunications` ADD CONSTRAINT `capturedCommunications_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `capturedCommunications` ADD CONSTRAINT `captured_comm_connection_fk` FOREIGN KEY (`connectionId`) REFERENCES `communicationConnections`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `capturedCommunications` ADD CONSTRAINT `capturedCommunications_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `capturedCommunications` ADD CONSTRAINT `capturedCommunications_dealId_deals_id_fk` FOREIGN KEY (`dealId`) REFERENCES `deals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `capturedCommunications` ADD CONSTRAINT `capturedCommunications_activityId_activities_id_fk` FOREIGN KEY (`activityId`) REFERENCES `activities`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `communicationAutomationRules` ADD CONSTRAINT `communicationAutomationRules_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `communicationAutomationRules` ADD CONSTRAINT `communication_rule_connection_fk` FOREIGN KEY (`connectionId`) REFERENCES `communicationConnections`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `communicationConnections` ADD CONSTRAINT `communicationConnections_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspaceMembers` ADD CONSTRAINT `workspaceMembers_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspaceMembers` ADD CONSTRAINT `workspaceMembers_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `captured_communication_owner_contact_start_idx` ON `capturedCommunications` (`ownerId`,`contactId`,`startsAt`);--> statement-breakpoint
CREATE INDEX `captured_communication_owner_deal_start_idx` ON `capturedCommunications` (`ownerId`,`dealId`,`startsAt`);--> statement-breakpoint
CREATE INDEX `communication_rule_owner_connection_active_idx` ON `communicationAutomationRules` (`ownerId`,`connectionId`,`isActive`);--> statement-breakpoint
CREATE INDEX `workspace_member_owner_active_idx` ON `workspaceMembers` (`ownerId`,`isActive`);--> statement-breakpoint
CREATE INDEX `workspace_member_user_active_idx` ON `workspaceMembers` (`userId`,`isActive`);--> statement-breakpoint
ALTER TABLE `activities` ADD CONSTRAINT `activities_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deals` ADD CONSTRAINT `deals_assigneeUserId_users_id_fk` FOREIGN KEY (`assigneeUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `followUps` ADD CONSTRAINT `followUps_assigneeUserId_users_id_fk` FOREIGN KEY (`assigneeUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `taskComments` ADD CONSTRAINT `taskComments_authorUserId_users_id_fk` FOREIGN KEY (`authorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `activity_owner_actor_idx` ON `activities` (`ownerId`,`actorUserId`);--> statement-breakpoint
CREATE INDEX `deal_owner_assignee_idx` ON `deals` (`ownerId`,`assigneeUserId`);--> statement-breakpoint
CREATE INDEX `follow_up_owner_assignee_idx` ON `followUps` (`ownerId`,`assigneeUserId`);
