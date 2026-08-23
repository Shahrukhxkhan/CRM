CREATE TABLE `dealLineItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`dealId` int NOT NULL,
	`productId` int,
	`priceBookEntryId` int,
	`productName` varchar(255) NOT NULL,
	`productSku` varchar(120),
	`billingType` enum('one_time','recurring') NOT NULL DEFAULT 'one_time',
	`quantity` decimal(12,2) NOT NULL DEFAULT '1',
	`unitAmount` decimal(14,2) NOT NULL DEFAULT '0',
	`discountPercent` decimal(5,2) NOT NULL DEFAULT '0',
	`taxPercent` decimal(5,2) NOT NULL DEFAULT '0',
	`lineSubtotal` decimal(14,2) NOT NULL DEFAULT '0',
	`discountAmount` decimal(14,2) NOT NULL DEFAULT '0',
	`taxAmount` decimal(14,2) NOT NULL DEFAULT '0',
	`lineTotal` decimal(14,2) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dealLineItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `priceBookEntries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`productId` int NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`unitAmount` decimal(14,2) NOT NULL,
	`effectiveFrom` timestamp,
	`effectiveTo` timestamp,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `priceBookEntries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`sku` varchar(120),
	`description` text,
	`billingType` enum('one_time','recurring') NOT NULL DEFAULT 'one_time',
	`defaultUnitAmount` decimal(14,2) NOT NULL DEFAULT '0',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_owner_name_unique` UNIQUE(`ownerId`,`name`),
	CONSTRAINT `product_owner_sku_unique` UNIQUE(`ownerId`,`sku`)
);
--> statement-breakpoint
ALTER TABLE `quoteItems` ADD `productId` int;--> statement-breakpoint
ALTER TABLE `quoteItems` ADD `priceBookEntryId` int;--> statement-breakpoint
ALTER TABLE `quoteItems` ADD `productName` varchar(255);--> statement-breakpoint
ALTER TABLE `quoteItems` ADD `productSku` varchar(120);--> statement-breakpoint
ALTER TABLE `quoteItems` ADD `billingType` enum('one_time','recurring') DEFAULT 'one_time' NOT NULL;--> statement-breakpoint
ALTER TABLE `quoteItems` ADD `discountPercent` decimal(5,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `quoteItems` ADD `taxPercent` decimal(5,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `quoteItems` ADD `lineSubtotal` decimal(14,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `quoteItems` ADD `discountAmount` decimal(14,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `quoteItems` ADD `taxAmount` decimal(14,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `quoteItems` ADD `lineTotal` decimal(14,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `quotes` ADD `subtotalAmount` decimal(14,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `quotes` ADD `discountAmount` decimal(14,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `quotes` ADD `taxAmount` decimal(14,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `dealLineItems` ADD CONSTRAINT `dealLineItems_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dealLineItems` ADD CONSTRAINT `dealLineItems_dealId_deals_id_fk` FOREIGN KEY (`dealId`) REFERENCES `deals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dealLineItems` ADD CONSTRAINT `dealLineItems_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dealLineItems` ADD CONSTRAINT `dealLineItems_priceBookEntryId_priceBookEntries_id_fk` FOREIGN KEY (`priceBookEntryId`) REFERENCES `priceBookEntries`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `priceBookEntries` ADD CONSTRAINT `priceBookEntries_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `priceBookEntries` ADD CONSTRAINT `priceBookEntries_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `deal_line_item_owner_deal_idx` ON `dealLineItems` (`ownerId`,`dealId`);--> statement-breakpoint
CREATE INDEX `deal_line_item_product_idx` ON `dealLineItems` (`productId`);--> statement-breakpoint
CREATE INDEX `price_book_owner_product_active_idx` ON `priceBookEntries` (`ownerId`,`productId`,`isActive`);--> statement-breakpoint
CREATE INDEX `price_book_owner_currency_idx` ON `priceBookEntries` (`ownerId`,`currency`);--> statement-breakpoint
CREATE INDEX `product_owner_active_idx` ON `products` (`ownerId`,`isActive`);--> statement-breakpoint
ALTER TABLE `quoteItems` ADD CONSTRAINT `quoteItems_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quoteItems` ADD CONSTRAINT `quoteItems_priceBookEntryId_priceBookEntries_id_fk` FOREIGN KEY (`priceBookEntryId`) REFERENCES `priceBookEntries`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `quote_item_product_idx` ON `quoteItems` (`productId`);