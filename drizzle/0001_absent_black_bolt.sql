CREATE TABLE `activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`contactId` int NOT NULL,
	`dealId` int,
	`activityType` varchar(64) NOT NULL DEFAULT 'note',
	`body` text NOT NULL,
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`website` varchar(512),
	`phone` varchar(64),
	`address` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companies_id` PRIMARY KEY(`id`),
	CONSTRAINT `companies_owner_name_unique` UNIQUE(`ownerId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `contactAttachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`contactId` int NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`filename` varchar(255) NOT NULL,
	`mimeType` varchar(160) NOT NULL,
	`sizeBytes` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contactAttachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contactCustomFieldValues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`contactId` int NOT NULL,
	`definitionId` int NOT NULL,
	`valueJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contactCustomFieldValues_id` PRIMARY KEY(`id`),
	CONSTRAINT `contact_custom_value_unique` UNIQUE(`contactId`,`definitionId`)
);
--> statement-breakpoint
CREATE TABLE `contactImportChanges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`importId` int NOT NULL,
	`contactId` int NOT NULL,
	`action` enum('create','update') NOT NULL,
	`beforeJson` text,
	`afterJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contactImportChanges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contactImportRows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`importId` int NOT NULL,
	`rowNumber` int NOT NULL,
	`action` enum('create','update','skip','error') NOT NULL,
	`sourceJson` text NOT NULL,
	`contactId` int,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contactImportRows_id` PRIMARY KEY(`id`),
	CONSTRAINT `contact_import_row_number_unique` UNIQUE(`importId`,`rowNumber`)
);
--> statement-breakpoint
CREATE TABLE `contactImports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`filename` varchar(255) NOT NULL,
	`columnMappingJson` text NOT NULL,
	`duplicateStrategy` enum('create','update','skip') NOT NULL,
	`status` enum('preview','completed','reverted','failed') NOT NULL DEFAULT 'preview',
	`createdCount` int NOT NULL DEFAULT 0,
	`updatedCount` int NOT NULL DEFAULT 0,
	`skippedCount` int NOT NULL DEFAULT 0,
	`failedCount` int NOT NULL DEFAULT 0,
	`revertedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contactImports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contactListMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listId` int NOT NULL,
	`contactId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contactListMembers_id` PRIMARY KEY(`id`),
	CONSTRAINT `contact_list_member_unique` UNIQUE(`listId`,`contactId`)
);
--> statement-breakpoint
CREATE TABLE `contactLists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contactLists_id` PRIMARY KEY(`id`),
	CONSTRAINT `contact_list_owner_name_unique` UNIQUE(`ownerId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`companyId` int,
	`firstName` varchar(120) NOT NULL,
	`lastName` varchar(120) NOT NULL,
	`email` varchar(320),
	`normalizedEmail` varchar(320),
	`phone` varchar(64),
	`jobTitle` varchar(160),
	`relationshipStage` varchar(64) NOT NULL DEFAULT 'Lead',
	`archivedAt` timestamp,
	`mergedIntoContactId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customFieldDefinitions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`label` varchar(120) NOT NULL,
	`fieldKey` varchar(120) NOT NULL,
	`fieldType` enum('text','number','date','select','multiselect','boolean','url') NOT NULL,
	`optionsJson` text,
	`isRequired` boolean NOT NULL DEFAULT false,
	`position` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customFieldDefinitions_id` PRIMARY KEY(`id`),
	CONSTRAINT `custom_field_owner_key_unique` UNIQUE(`ownerId`,`fieldKey`)
);
--> statement-breakpoint
CREATE TABLE `dealStageHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`dealId` int NOT NULL,
	`fromStageId` int,
	`toStageId` int NOT NULL,
	`changedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dealStageHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`contactId` int NOT NULL,
	`companyId` int,
	`pipelineId` int NOT NULL,
	`stageId` int NOT NULL,
	`lostReasonId` int,
	`title` varchar(255) NOT NULL,
	`amount` decimal(14,2) NOT NULL DEFAULT '0',
	`expectedCloseAt` timestamp,
	`lostNote` text,
	`closedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `followUps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`contactId` int,
	`title` varchar(255) NOT NULL,
	`description` text,
	`dueAt` timestamp,
	`completedAt` timestamp,
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`recurrenceRule` varchar(512),
	`nextOccurrenceAt` timestamp,
	`reminderAt` timestamp,
	`reminderCronTaskUid` varchar(65),
	`escalationAt` timestamp,
	`escalationCronTaskUid` varchar(65),
	`templateId` int,
	`archivedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `followUps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `generatedExports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`scheduledExportId` int,
	`storageKey` varchar(512) NOT NULL,
	`filename` varchar(255) NOT NULL,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `generatedExports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lostReasons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lostReasons_id` PRIMARY KEY(`id`),
	CONSTRAINT `lost_reason_owner_name_unique` UNIQUE(`ownerId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `pipelineStages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`pipelineId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`position` int NOT NULL,
	`color` varchar(16) NOT NULL DEFAULT '#64748b',
	`probability` decimal(5,2) NOT NULL DEFAULT '0',
	`stageKind` enum('open','won','lost') NOT NULL DEFAULT 'open',
	`requiresActivityBeforeExit` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pipelineStages_id` PRIMARY KEY(`id`),
	CONSTRAINT `pipeline_stage_position_unique` UNIQUE(`pipelineId`,`position`)
);
--> statement-breakpoint
CREATE TABLE `pipelines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`isDefault` boolean NOT NULL DEFAULT false,
	`isArchived` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pipelines_id` PRIMARY KEY(`id`),
	CONSTRAINT `pipeline_owner_name_unique` UNIQUE(`ownerId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `quoteItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quoteId` int NOT NULL,
	`description` varchar(512) NOT NULL,
	`quantity` decimal(12,2) NOT NULL DEFAULT '1',
	`unitAmount` decimal(14,2) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quoteItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`contactId` int,
	`companyId` int,
	`dealId` int,
	`title` varchar(255) NOT NULL,
	`status` varchar(64) NOT NULL DEFAULT 'draft',
	`totalAmount` decimal(14,2) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `savedContactSearches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`criteriaJson` text NOT NULL,
	`isPinned` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `savedContactSearches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scheduledExports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`criteriaJson` text NOT NULL,
	`cronExpression` varchar(128) NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`lastRunAt` timestamp,
	`isActive` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scheduledExports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `taskComments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`followUpId` int NOT NULL,
	`body` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `taskComments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `taskTemplates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`defaultDueOffsetDays` int,
	`defaultPriority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `taskTemplates_id` PRIMARY KEY(`id`),
	CONSTRAINT `task_template_owner_name_unique` UNIQUE(`ownerId`,`name`)
);
--> statement-breakpoint
ALTER TABLE `activities` ADD CONSTRAINT `activities_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activities` ADD CONSTRAINT `activities_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activities` ADD CONSTRAINT `activities_dealId_deals_id_fk` FOREIGN KEY (`dealId`) REFERENCES `deals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `companies` ADD CONSTRAINT `companies_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contactAttachments` ADD CONSTRAINT `contactAttachments_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contactAttachments` ADD CONSTRAINT `contactAttachments_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contactCustomFieldValues` ADD CONSTRAINT `contactCustomFieldValues_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contactCustomFieldValues` ADD CONSTRAINT `contactCustomFieldValues_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contactCustomFieldValues` ADD CONSTRAINT `contact_field_value_definition_fk` FOREIGN KEY (`definitionId`) REFERENCES `customFieldDefinitions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contactImportChanges` ADD CONSTRAINT `contactImportChanges_importId_contactImports_id_fk` FOREIGN KEY (`importId`) REFERENCES `contactImports`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contactImportChanges` ADD CONSTRAINT `contactImportChanges_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contactImportRows` ADD CONSTRAINT `contactImportRows_importId_contactImports_id_fk` FOREIGN KEY (`importId`) REFERENCES `contactImports`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contactImportRows` ADD CONSTRAINT `contactImportRows_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contactImports` ADD CONSTRAINT `contactImports_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contactListMembers` ADD CONSTRAINT `contactListMembers_listId_contactLists_id_fk` FOREIGN KEY (`listId`) REFERENCES `contactLists`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contactListMembers` ADD CONSTRAINT `contactListMembers_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contactLists` ADD CONSTRAINT `contactLists_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_companyId_companies_id_fk` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customFieldDefinitions` ADD CONSTRAINT `customFieldDefinitions_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dealStageHistory` ADD CONSTRAINT `dealStageHistory_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dealStageHistory` ADD CONSTRAINT `dealStageHistory_dealId_deals_id_fk` FOREIGN KEY (`dealId`) REFERENCES `deals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dealStageHistory` ADD CONSTRAINT `dealStageHistory_fromStageId_pipelineStages_id_fk` FOREIGN KEY (`fromStageId`) REFERENCES `pipelineStages`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dealStageHistory` ADD CONSTRAINT `dealStageHistory_toStageId_pipelineStages_id_fk` FOREIGN KEY (`toStageId`) REFERENCES `pipelineStages`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deals` ADD CONSTRAINT `deals_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deals` ADD CONSTRAINT `deals_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deals` ADD CONSTRAINT `deals_companyId_companies_id_fk` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deals` ADD CONSTRAINT `deals_pipelineId_pipelines_id_fk` FOREIGN KEY (`pipelineId`) REFERENCES `pipelines`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deals` ADD CONSTRAINT `deals_stageId_pipelineStages_id_fk` FOREIGN KEY (`stageId`) REFERENCES `pipelineStages`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deals` ADD CONSTRAINT `deals_lostReasonId_lostReasons_id_fk` FOREIGN KEY (`lostReasonId`) REFERENCES `lostReasons`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `followUps` ADD CONSTRAINT `followUps_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `followUps` ADD CONSTRAINT `followUps_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `followUps` ADD CONSTRAINT `followUps_templateId_taskTemplates_id_fk` FOREIGN KEY (`templateId`) REFERENCES `taskTemplates`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `generatedExports` ADD CONSTRAINT `generatedExports_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `generatedExports` ADD CONSTRAINT `generatedExports_scheduledExportId_scheduledExports_id_fk` FOREIGN KEY (`scheduledExportId`) REFERENCES `scheduledExports`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lostReasons` ADD CONSTRAINT `lostReasons_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pipelineStages` ADD CONSTRAINT `pipelineStages_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pipelineStages` ADD CONSTRAINT `pipelineStages_pipelineId_pipelines_id_fk` FOREIGN KEY (`pipelineId`) REFERENCES `pipelines`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pipelines` ADD CONSTRAINT `pipelines_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quoteItems` ADD CONSTRAINT `quoteItems_quoteId_quotes_id_fk` FOREIGN KEY (`quoteId`) REFERENCES `quotes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_companyId_companies_id_fk` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_dealId_deals_id_fk` FOREIGN KEY (`dealId`) REFERENCES `deals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `savedContactSearches` ADD CONSTRAINT `savedContactSearches_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scheduledExports` ADD CONSTRAINT `scheduledExports_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `taskComments` ADD CONSTRAINT `taskComments_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `taskComments` ADD CONSTRAINT `taskComments_followUpId_followUps_id_fk` FOREIGN KEY (`followUpId`) REFERENCES `followUps`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `taskTemplates` ADD CONSTRAINT `taskTemplates_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `activity_owner_contact_occurred_idx` ON `activities` (`ownerId`,`contactId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `activity_owner_deal_occurred_idx` ON `activities` (`ownerId`,`dealId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `companies_owner_idx` ON `companies` (`ownerId`);--> statement-breakpoint
CREATE INDEX `contact_attachment_owner_contact_idx` ON `contactAttachments` (`ownerId`,`contactId`);--> statement-breakpoint
CREATE INDEX `contact_custom_value_owner_idx` ON `contactCustomFieldValues` (`ownerId`);--> statement-breakpoint
CREATE INDEX `contact_import_change_import_idx` ON `contactImportChanges` (`importId`);--> statement-breakpoint
CREATE INDEX `contact_import_row_contact_idx` ON `contactImportRows` (`contactId`);--> statement-breakpoint
CREATE INDEX `contact_import_owner_status_idx` ON `contactImports` (`ownerId`,`status`);--> statement-breakpoint
CREATE INDEX `contact_list_member_contact_idx` ON `contactListMembers` (`contactId`);--> statement-breakpoint
CREATE INDEX `contacts_owner_normalized_email_idx` ON `contacts` (`ownerId`,`normalizedEmail`);--> statement-breakpoint
CREATE INDEX `contacts_owner_archived_idx` ON `contacts` (`ownerId`,`archivedAt`);--> statement-breakpoint
CREATE INDEX `contacts_owner_company_idx` ON `contacts` (`ownerId`,`companyId`);--> statement-breakpoint
CREATE INDEX `contacts_merged_into_idx` ON `contacts` (`mergedIntoContactId`);--> statement-breakpoint
CREATE INDEX `custom_field_owner_position_idx` ON `customFieldDefinitions` (`ownerId`,`position`);--> statement-breakpoint
CREATE INDEX `deal_stage_history_owner_deal_changed_idx` ON `dealStageHistory` (`ownerId`,`dealId`,`changedAt`);--> statement-breakpoint
CREATE INDEX `deal_owner_pipeline_stage_idx` ON `deals` (`ownerId`,`pipelineId`,`stageId`);--> statement-breakpoint
CREATE INDEX `deal_owner_contact_idx` ON `deals` (`ownerId`,`contactId`);--> statement-breakpoint
CREATE INDEX `deal_lost_reason_idx` ON `deals` (`lostReasonId`);--> statement-breakpoint
CREATE INDEX `follow_up_owner_due_idx` ON `followUps` (`ownerId`,`dueAt`);--> statement-breakpoint
CREATE INDEX `follow_up_owner_completion_idx` ON `followUps` (`ownerId`,`completedAt`);--> statement-breakpoint
CREATE INDEX `follow_up_reminder_task_uid_idx` ON `followUps` (`reminderCronTaskUid`);--> statement-breakpoint
CREATE INDEX `follow_up_escalation_task_uid_idx` ON `followUps` (`escalationCronTaskUid`);--> statement-breakpoint
CREATE INDEX `generated_export_owner_created_idx` ON `generatedExports` (`ownerId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `lost_reason_owner_active_idx` ON `lostReasons` (`ownerId`,`isActive`);--> statement-breakpoint
CREATE INDEX `pipeline_stage_owner_pipeline_idx` ON `pipelineStages` (`ownerId`,`pipelineId`);--> statement-breakpoint
CREATE INDEX `pipeline_owner_default_idx` ON `pipelines` (`ownerId`,`isDefault`);--> statement-breakpoint
CREATE INDEX `quote_item_quote_idx` ON `quoteItems` (`quoteId`);--> statement-breakpoint
CREATE INDEX `quote_owner_contact_idx` ON `quotes` (`ownerId`,`contactId`);--> statement-breakpoint
CREATE INDEX `saved_contact_search_owner_pinned_idx` ON `savedContactSearches` (`ownerId`,`isPinned`);--> statement-breakpoint
CREATE INDEX `scheduled_export_owner_active_idx` ON `scheduledExports` (`ownerId`,`isActive`);--> statement-breakpoint
CREATE INDEX `scheduled_export_task_uid_idx` ON `scheduledExports` (`scheduleCronTaskUid`);--> statement-breakpoint
CREATE INDEX `task_comment_owner_follow_up_idx` ON `taskComments` (`ownerId`,`followUpId`);
