CREATE TABLE `appSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appSessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `appSessions_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `googleSubject` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_googleSubject_unique` UNIQUE(`googleSubject`);--> statement-breakpoint
ALTER TABLE `appSessions` ADD CONSTRAINT `appSessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `app_session_user_active_idx` ON `appSessions` (`userId`,`revokedAt`,`expiresAt`);