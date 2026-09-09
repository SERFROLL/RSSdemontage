CREATE TABLE `accounting_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`namespace` text NOT NULL,
	`document_id` text NOT NULL,
	`source_version` integer NOT NULL,
	`source_seq` integer NOT NULL,
	`kind` text NOT NULL,
	`operation_date` text NOT NULL,
	`created_at` text NOT NULL,
	`reverses_version` integer,
	FOREIGN KEY (`source_seq`) REFERENCES `documents`(`seq`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounting_documents_source` ON `accounting_documents` (`namespace`,`document_id`,`source_version`);--> statement-breakpoint
CREATE TABLE `accounting_write_checks` (
	`token` text PRIMARY KEY NOT NULL,
	`valid` integer NOT NULL,
	CONSTRAINT "accounting_write_valid" CHECK("accounting_write_checks"."valid"=1)
);
--> statement-breakpoint
CREATE TABLE `coil_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`line_id` text NOT NULL,
	`delta_count` integer NOT NULL,
	`reverses_entry_id` text,
	FOREIGN KEY (`line_id`) REFERENCES `document_lines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reverses_entry_id`) REFERENCES `coil_entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `document_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`accounting_document_id` text NOT NULL,
	`origin_pid` text NOT NULL,
	`cable_id` text NOT NULL,
	`operation_date` text NOT NULL,
	`line_role` text NOT NULL,
	`source_line_id` text,
	FOREIGN KEY (`accounting_document_id`) REFERENCES `accounting_documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_line_id`) REFERENCES `document_lines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `document_lines_origin` ON `document_lines` (`origin_pid`,`cable_id`,`operation_date`);--> statement-breakpoint
CREATE INDEX `document_lines_document` ON `document_lines` (`accounting_document_id`);--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`line_id` text NOT NULL,
	`account_id` text NOT NULL,
	`value_id` text NOT NULL,
	`unit` text NOT NULL,
	`sign` integer NOT NULL,
	`reverses_entry_id` text,
	FOREIGN KEY (`line_id`) REFERENCES `document_lines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reverses_entry_id`) REFERENCES `ledger_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`unit`) REFERENCES `stock_accounts`(`id`,`unit`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`value_id`,`unit`) REFERENCES `quantity_values`(`id`,`unit`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`value_id`,`line_id`) REFERENCES `quantity_values`(`id`,`line_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ledger_entries_sign" CHECK("ledger_entries"."sign" in (-1,1))
);
--> statement-breakpoint
CREATE INDEX `ledger_entries_line` ON `ledger_entries` (`line_id`);--> statement-breakpoint
CREATE INDEX `ledger_entries_account` ON `ledger_entries` (`account_id`);--> statement-breakpoint
CREATE TABLE `opening_batches` (
	`namespace` text NOT NULL,
	`pid` text NOT NULL,
	`accounting_document_id` text NOT NULL,
	`pid_stock_checked` integer NOT NULL,
	`main_stock_checked` integer NOT NULL,
	`confirmed_at` text NOT NULL,
	`confirmed_by` text NOT NULL,
	PRIMARY KEY(`namespace`, `pid`),
	FOREIGN KEY (`accounting_document_id`) REFERENCES `accounting_documents`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "opening_batches_pid_checked" CHECK("opening_batches"."pid_stock_checked"=1),
	CONSTRAINT "opening_batches_main_checked" CHECK("opening_batches"."main_stock_checked"=1)
);
--> statement-breakpoint
CREATE TABLE `quantity_inputs` (
	`result_value_id` text NOT NULL,
	`input_value_id` text NOT NULL,
	`input_role` text NOT NULL,
	PRIMARY KEY(`result_value_id`, `input_role`),
	FOREIGN KEY (`result_value_id`) REFERENCES `quantity_values`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`input_value_id`) REFERENCES `quantity_values`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `quantity_values` (
	`id` text PRIMARY KEY NOT NULL,
	`line_id` text NOT NULL,
	`role` text NOT NULL,
	`value_kind` text NOT NULL,
	`unit` text NOT NULL,
	`value_base` integer NOT NULL,
	`formula_code` text,
	`formula_version` integer,
	`source_reference` text,
	FOREIGN KEY (`line_id`) REFERENCES `document_lines`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "quantity_values_unit" CHECK("quantity_values"."unit" in ('mm','g')),
	CONSTRAINT "quantity_values_exact" CHECK("quantity_values"."value_base" between 0 and 9007199254740991)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quantity_values_role` ON `quantity_values` (`line_id`,`role`);--> statement-breakpoint
CREATE UNIQUE INDEX `quantity_values_id_unit` ON `quantity_values` (`id`,`unit`);--> statement-breakpoint
CREATE UNIQUE INDEX `quantity_values_id_line` ON `quantity_values` (`id`,`line_id`);--> statement-breakpoint
CREATE TABLE `stock_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`namespace` text NOT NULL,
	`kind` text NOT NULL,
	`unit` text NOT NULL,
	`owner_pid` text,
	CONSTRAINT "stock_accounts_unit" CHECK("stock_accounts"."unit" in ('mm','g')),
	CONSTRAINT "stock_accounts_owner" CHECK(("stock_accounts"."kind"='pid' and "stock_accounts"."owner_pid" is not null and "stock_accounts"."unit"='mm') or ("stock_accounts"."kind"<>'pid' and "stock_accounts"."owner_pid" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_accounts_id_unit` ON `stock_accounts` (`id`,`unit`);