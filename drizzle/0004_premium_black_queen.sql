ALTER TABLE `contacts` ADD `leadSource` varchar(120);--> statement-breakpoint
ALTER TABLE `contacts` ADD `leadSource` varchar(120);--> statement-breakpoint
CREATE INDEX `contacts_owner_lead_source_idx` ON `contacts` (`ownerId`,`leadSource`);
