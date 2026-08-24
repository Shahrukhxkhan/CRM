import {
  bigint,
  boolean,
  decimal,
  foreignKey,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core identity table supplied by the OAuth scaffold. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  googleSubject: varchar("googleSubject", { length: 255 }).unique(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
 updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
 lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const appSessions = mysqlTable(
  "appSessions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
    expiresAt: timestamp("expiresAt").notNull(),
    revokedAt: timestamp("revokedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("app_session_user_active_idx").on(table.userId, table.revokedAt, table.expiresAt)]
);

export const workspaceMembers = mysqlTable(
  "workspaceMembers",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    workspaceRole: mysqlEnum("workspaceRole", ["manager", "contributor"]).default("contributor").notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    invitedAt: timestamp("invitedAt").defaultNow().notNull(),
    acceptedAt: timestamp("acceptedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("workspace_member_owner_user_unique").on(table.ownerId, table.userId),
    index("workspace_member_owner_active_idx").on(table.ownerId, table.isActive),
    index("workspace_member_user_active_idx").on(table.userId, table.isActive),
  ]
);

export const companies = mysqlTable(
  "companies",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    website: varchar("website", { length: 512 }),
    phone: varchar("phone", { length: 64 }),
    address: text("address"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("companies_owner_idx").on(table.ownerId),
    uniqueIndex("companies_owner_name_unique").on(table.ownerId, table.name),
  ]
);

export const contacts = mysqlTable(
  "contacts",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    companyId: int("companyId").references(() => companies.id, { onDelete: "set null" }),
    firstName: varchar("firstName", { length: 120 }).notNull(),
    lastName: varchar("lastName", { length: 120 }).notNull(),
    email: varchar("email", { length: 320 }),
    normalizedEmail: varchar("normalizedEmail", { length: 320 }),
    phone: varchar("phone", { length: 64 }),
    jobTitle: varchar("jobTitle", { length: 160 }),
    leadSource: varchar("leadSource", { length: 120 }),
    relationshipStage: varchar("relationshipStage", { length: 64 }).default("Lead").notNull(),
    archivedAt: timestamp("archivedAt"),
    mergedIntoContactId: int("mergedIntoContactId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("contacts_owner_normalized_email_idx").on(table.ownerId, table.normalizedEmail),
    index("contacts_owner_archived_idx").on(table.ownerId, table.archivedAt),
    index("contacts_owner_company_idx").on(table.ownerId, table.companyId),
    index("contacts_owner_lead_source_idx").on(table.ownerId, table.leadSource),
    index("contacts_merged_into_idx").on(table.mergedIntoContactId),
  ]
);

export const customFieldDefinitions = mysqlTable(
  "customFieldDefinitions",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 120 }).notNull(),
    fieldKey: varchar("fieldKey", { length: 120 }).notNull(),
    fieldType: mysqlEnum("fieldType", ["text", "number", "date", "select", "multiselect", "boolean", "url"]).notNull(),
    optionsJson: text("optionsJson"),
    isRequired: boolean("isRequired").default(false).notNull(),
    position: int("position").default(0).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("custom_field_owner_key_unique").on(table.ownerId, table.fieldKey),
    index("custom_field_owner_position_idx").on(table.ownerId, table.position),
  ]
);

export const contactCustomFieldValues = mysqlTable(
  "contactCustomFieldValues",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    contactId: int("contactId").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    definitionId: int("definitionId").notNull().references(() => customFieldDefinitions.id, { onDelete: "cascade" }),
    valueJson: text("valueJson").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    foreignKey({
      columns: [table.definitionId],
      foreignColumns: [customFieldDefinitions.id],
      name: "contact_field_value_definition_fk",
    }).onDelete("cascade"),
    uniqueIndex("contact_custom_value_unique").on(table.contactId, table.definitionId),
    index("contact_custom_value_owner_idx").on(table.ownerId),
  ]
);

export const contactLists = mysqlTable(
  "contactLists",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("contact_list_owner_name_unique").on(table.ownerId, table.name)]
);

export const contactListMembers = mysqlTable(
  "contactListMembers",
  {
    id: int("id").autoincrement().primaryKey(),
    listId: int("listId").notNull().references(() => contactLists.id, { onDelete: "cascade" }),
    contactId: int("contactId").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("contact_list_member_unique").on(table.listId, table.contactId),
    index("contact_list_member_contact_idx").on(table.contactId),
  ]
);

export const savedContactSearches = mysqlTable(
  "savedContactSearches",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    criteriaJson: text("criteriaJson").notNull(),
    isPinned: boolean("isPinned").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("saved_contact_search_owner_pinned_idx").on(table.ownerId, table.isPinned)]
);

export const savedTableViews = mysqlTable(
  "savedTableViews",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    entityType: mysqlEnum("entityType", ["contacts", "tasks", "deals"]).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    configJson: text("configJson").notNull(),
    isPinned: boolean("isPinned").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("saved_table_view_owner_entity_name_unique").on(table.ownerId, table.entityType, table.name),
    index("saved_table_view_owner_entity_pinned_idx").on(table.ownerId, table.entityType, table.isPinned),
  ]
);

export const contactAttachments = mysqlTable(
  "contactAttachments",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    contactId: int("contactId").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    filename: varchar("filename", { length: 255 }).notNull(),
    mimeType: varchar("mimeType", { length: 160 }).notNull(),
    sizeBytes: bigint("sizeBytes", { mode: "number" }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("contact_attachment_owner_contact_idx").on(table.ownerId, table.contactId)]
);

export const importMappingProfiles = mysqlTable(
  "importMappingProfiles",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    sourceHeadersJson: text("sourceHeadersJson").notNull(),
    mappingJson: text("mappingJson").notNull(),
    transformsJson: text("transformsJson").notNull(),
    duplicateStrategy: mysqlEnum("duplicateStrategy", ["create", "update", "skip"]).default("skip").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("import_mapping_profile_owner_name_unique").on(table.ownerId, table.name),
    index("import_mapping_profile_owner_idx").on(table.ownerId),
  ]
);

export const contactImports = mysqlTable(
  "contactImports",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    filename: varchar("filename", { length: 255 }).notNull(),
    columnMappingJson: text("columnMappingJson").notNull(),
    duplicateStrategy: mysqlEnum("duplicateStrategy", ["create", "update", "skip"]).notNull(),
    status: mysqlEnum("status", ["preview", "completed", "reverted", "failed"]).default("preview").notNull(),
    isValidationOnly: boolean("isValidationOnly").default(false).notNull(),
    validationSummaryJson: text("validationSummaryJson"),
    createdCount: int("createdCount").default(0).notNull(),
    updatedCount: int("updatedCount").default(0).notNull(),
    skippedCount: int("skippedCount").default(0).notNull(),
    failedCount: int("failedCount").default(0).notNull(),
    revertedAt: timestamp("revertedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("contact_import_owner_status_idx").on(table.ownerId, table.status)]
);

export const contactImportRows = mysqlTable(
  "contactImportRows",
  {
    id: int("id").autoincrement().primaryKey(),
    importId: int("importId").notNull().references(() => contactImports.id, { onDelete: "cascade" }),
    rowNumber: int("rowNumber").notNull(),
    action: mysqlEnum("action", ["create", "update", "skip", "error"]).notNull(),
    sourceJson: text("sourceJson").notNull(),
    contactId: int("contactId").references(() => contacts.id, { onDelete: "set null" }),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("contact_import_row_number_unique").on(table.importId, table.rowNumber),
    index("contact_import_row_contact_idx").on(table.contactId),
  ]
);

export const contactImportChanges = mysqlTable(
  "contactImportChanges",
  {
    id: int("id").autoincrement().primaryKey(),
    importId: int("importId").notNull().references(() => contactImports.id, { onDelete: "cascade" }),
    contactId: int("contactId").notNull().references(() => contacts.id, { onDelete: "restrict" }),
    action: mysqlEnum("action", ["create", "update"]).notNull(),
    beforeJson: text("beforeJson"),
    afterJson: text("afterJson"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("contact_import_change_import_idx").on(table.importId)]
);

export const scheduledExports = mysqlTable(
  "scheduledExports",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    criteriaJson: text("criteriaJson").notNull(),
    cronExpression: varchar("cronExpression", { length: 128 }).notNull(),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
    lastRunAt: timestamp("lastRunAt"),
    isActive: boolean("isActive").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("scheduled_export_owner_active_idx").on(table.ownerId, table.isActive),
    index("scheduled_export_task_uid_idx").on(table.scheduleCronTaskUid),
  ]
);

export const ownerAutomationSettings = mysqlTable(
  "ownerAutomationSettings",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    taskMonitorCronExpression: varchar("taskMonitorCronExpression", { length: 128 }).default("0 */15 * * * *").notNull(),
    taskMonitorCronTaskUid: varchar("taskMonitorCronTaskUid", { length: 65 }),
    taskMonitorIsActive: boolean("taskMonitorIsActive").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("owner_automation_settings_owner_unique").on(table.ownerId),
    index("owner_automation_settings_task_uid_idx").on(table.taskMonitorCronTaskUid),
  ]
);

export const scheduledJobRuns = mysqlTable(
  "scheduledJobRuns",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    scheduledExportId: int("scheduledExportId").references(() => scheduledExports.id, { onDelete: "set null" }),
    jobKind: mysqlEnum("jobKind", ["task_monitor", "scheduled_export"]).notNull(),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }).notNull(),
    runKey: varchar("runKey", { length: 191 }).notNull(),
    status: mysqlEnum("status", ["running", "succeeded", "failed", "skipped"]).default("running").notNull(),
    resultJson: text("resultJson"),
    errorMessage: text("errorMessage"),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    finishedAt: timestamp("finishedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("scheduled_job_run_owner_key_unique").on(table.ownerId, table.runKey),
    index("scheduled_job_run_task_uid_idx").on(table.scheduleCronTaskUid),
    index("scheduled_job_run_export_created_idx").on(table.scheduledExportId, table.createdAt),
  ]
);

export const generatedExports = mysqlTable(
  "generatedExports",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    scheduledExportId: int("scheduledExportId").references(() => scheduledExports.id, { onDelete: "set null" }),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    filename: varchar("filename", { length: 255 }).notNull(),
    expiresAt: timestamp("expiresAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("generated_export_owner_created_idx").on(table.ownerId, table.createdAt)]
);

export const taskTemplates = mysqlTable(
  "taskTemplates",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    defaultDueOffsetDays: int("defaultDueOffsetDays"),
    defaultPriority: mysqlEnum("defaultPriority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("task_template_owner_name_unique").on(table.ownerId, table.name)]
);

export const followUps = mysqlTable(
  "followUps",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    contactId: int("contactId").references(() => contacts.id, { onDelete: "set null" }),
    assigneeUserId: int("assigneeUserId").references(() => users.id, { onDelete: "set null" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    dueAt: timestamp("dueAt"),
    completedAt: timestamp("completedAt"),
    priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
    recurrenceRule: varchar("recurrenceRule", { length: 512 }),
    nextOccurrenceAt: timestamp("nextOccurrenceAt"),
    reminderAt: timestamp("reminderAt"),
    reminderCronTaskUid: varchar("reminderCronTaskUid", { length: 65 }),
    reminderNotifiedAt: timestamp("reminderNotifiedAt"),
    escalationAt: timestamp("escalationAt"),
    escalationCronTaskUid: varchar("escalationCronTaskUid", { length: 65 }),
    escalationNotifiedAt: timestamp("escalationNotifiedAt"),
    templateId: int("templateId").references(() => taskTemplates.id, { onDelete: "set null" }),
    archivedAt: timestamp("archivedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("follow_up_owner_due_idx").on(table.ownerId, table.dueAt),
    index("follow_up_owner_completion_idx").on(table.ownerId, table.completedAt),
    index("follow_up_owner_assignee_idx").on(table.ownerId, table.assigneeUserId),
    index("follow_up_reminder_task_uid_idx").on(table.reminderCronTaskUid),
    index("follow_up_escalation_task_uid_idx").on(table.escalationCronTaskUid),
  ]
);

export const taskComments = mysqlTable(
  "taskComments",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    followUpId: int("followUpId").notNull().references(() => followUps.id, { onDelete: "cascade" }),
    authorUserId: int("authorUserId").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("task_comment_owner_follow_up_idx").on(table.ownerId, table.followUpId)]
);

export const pipelines = mysqlTable(
  "pipelines",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    isDefault: boolean("isDefault").default(false).notNull(),
    isArchived: boolean("isArchived").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("pipeline_owner_name_unique").on(table.ownerId, table.name),
    index("pipeline_owner_default_idx").on(table.ownerId, table.isDefault),
  ]
);

export const pipelineStages = mysqlTable(
  "pipelineStages",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    pipelineId: int("pipelineId").notNull().references(() => pipelines.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    position: int("position").notNull(),
    color: varchar("color", { length: 16 }).default("#64748b").notNull(),
    probability: decimal("probability", { precision: 5, scale: 2 }).default("0").notNull(),
    stageKind: mysqlEnum("stageKind", ["open", "won", "lost"]).default("open").notNull(),
    requiresActivityBeforeExit: boolean("requiresActivityBeforeExit").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("pipeline_stage_position_unique").on(table.pipelineId, table.position),
    index("pipeline_stage_owner_pipeline_idx").on(table.ownerId, table.pipelineId),
  ]
);

export const lostReasons = mysqlTable(
  "lostReasons",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    position: int("position").default(0).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("lost_reason_owner_name_unique").on(table.ownerId, table.name),
    index("lost_reason_owner_active_idx").on(table.ownerId, table.isActive),
  ]
);

export const deals = mysqlTable(
  "deals",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    contactId: int("contactId").notNull().references(() => contacts.id, { onDelete: "restrict" }),
    assigneeUserId: int("assigneeUserId").references(() => users.id, { onDelete: "set null" }),
    companyId: int("companyId").references(() => companies.id, { onDelete: "set null" }),
    pipelineId: int("pipelineId").notNull().references(() => pipelines.id, { onDelete: "restrict" }),
    stageId: int("stageId").notNull().references(() => pipelineStages.id, { onDelete: "restrict" }),
    lostReasonId: int("lostReasonId").references(() => lostReasons.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 255 }).notNull(),
    amount: decimal("amount", { precision: 14, scale: 2 }).default("0").notNull(),
    expectedCloseAt: timestamp("expectedCloseAt"),
    lostNote: text("lostNote"),
    closedAt: timestamp("closedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("deal_owner_pipeline_stage_idx").on(table.ownerId, table.pipelineId, table.stageId),
    index("deal_owner_contact_idx").on(table.ownerId, table.contactId),
    index("deal_owner_assignee_idx").on(table.ownerId, table.assigneeUserId),
    index("deal_lost_reason_idx").on(table.lostReasonId),
  ]
);

export const products = mysqlTable(
  "products",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    sku: varchar("sku", { length: 120 }),
    description: text("description"),
    billingType: mysqlEnum("billingType", ["one_time", "recurring"]).default("one_time").notNull(),
    defaultUnitAmount: decimal("defaultUnitAmount", { precision: 14, scale: 2 }).default("0").notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("product_owner_name_unique").on(table.ownerId, table.name), uniqueIndex("product_owner_sku_unique").on(table.ownerId, table.sku), index("product_owner_active_idx").on(table.ownerId, table.isActive)]
);

export const priceBookEntries = mysqlTable(
  "priceBookEntries",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    productId: int("productId").notNull().references(() => products.id, { onDelete: "cascade" }),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    unitAmount: decimal("unitAmount", { precision: 14, scale: 2 }).notNull(),
    effectiveFrom: timestamp("effectiveFrom"),
    effectiveTo: timestamp("effectiveTo"),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("price_book_owner_product_active_idx").on(table.ownerId, table.productId, table.isActive), index("price_book_owner_currency_idx").on(table.ownerId, table.currency)]
);

export const dealLineItems = mysqlTable(
  "dealLineItems",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    dealId: int("dealId").notNull().references(() => deals.id, { onDelete: "cascade" }),
    productId: int("productId").references(() => products.id, { onDelete: "set null" }),
    priceBookEntryId: int("priceBookEntryId").references(() => priceBookEntries.id, { onDelete: "set null" }),
    productName: varchar("productName", { length: 255 }).notNull(),
    productSku: varchar("productSku", { length: 120 }),
    billingType: mysqlEnum("billingType", ["one_time", "recurring"]).default("one_time").notNull(),
    quantity: decimal("quantity", { precision: 12, scale: 2 }).default("1").notNull(),
    unitAmount: decimal("unitAmount", { precision: 14, scale: 2 }).default("0").notNull(),
    discountPercent: decimal("discountPercent", { precision: 5, scale: 2 }).default("0").notNull(),
    taxPercent: decimal("taxPercent", { precision: 5, scale: 2 }).default("0").notNull(),
    lineSubtotal: decimal("lineSubtotal", { precision: 14, scale: 2 }).default("0").notNull(),
    discountAmount: decimal("discountAmount", { precision: 14, scale: 2 }).default("0").notNull(),
    taxAmount: decimal("taxAmount", { precision: 14, scale: 2 }).default("0").notNull(),
    lineTotal: decimal("lineTotal", { precision: 14, scale: 2 }).default("0").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("deal_line_item_owner_deal_idx").on(table.ownerId, table.dealId), index("deal_line_item_product_idx").on(table.productId)]
);

export const activities = mysqlTable(
  "activities",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    contactId: int("contactId").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    dealId: int("dealId").references(() => deals.id, { onDelete: "set null" }),
    actorUserId: int("actorUserId").references(() => users.id, { onDelete: "set null" }),
    activityType: varchar("activityType", { length: 64 }).default("note").notNull(),
    body: text("body").notNull(),
    occurredAt: timestamp("occurredAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("activity_owner_contact_occurred_idx").on(table.ownerId, table.contactId, table.occurredAt),
    index("activity_owner_deal_occurred_idx").on(table.ownerId, table.dealId, table.occurredAt),
    index("activity_owner_actor_idx").on(table.ownerId, table.actorUserId),
  ]
);

export const communicationConnections = mysqlTable(
  "communicationConnections",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: mysqlEnum("provider", ["google_calendar"]).default("google_calendar").notNull(),
    externalAccountEmail: varchar("externalAccountEmail", { length: 320 }),
    connectionStatus: mysqlEnum("connectionStatus", ["disconnected", "connected", "error"]).default("disconnected").notNull(),
    lastSyncedAt: timestamp("lastSyncedAt"),
    lastSyncError: text("lastSyncError"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("communication_connection_owner_provider_unique").on(table.ownerId, table.provider)]
);

export const capturedCommunications = mysqlTable(
  "capturedCommunications",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    connectionId: int("connectionId").notNull(),
    contactId: int("contactId").references(() => contacts.id, { onDelete: "set null" }),
    dealId: int("dealId").references(() => deals.id, { onDelete: "set null" }),
    activityId: int("activityId").references(() => activities.id, { onDelete: "set null" }),
    externalEventId: varchar("externalEventId", { length: 512 }).notNull(),
    externalCalendarId: varchar("externalCalendarId", { length: 512 }),
    title: varchar("title", { length: 512 }).notNull(),
    descriptionSnippet: varchar("descriptionSnippet", { length: 1000 }),
    startsAt: timestamp("startsAt"),
    endsAt: timestamp("endsAt"),
    providerUpdatedAt: timestamp("providerUpdatedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    foreignKey({ columns: [table.connectionId], foreignColumns: [communicationConnections.id], name: "captured_comm_connection_fk" }).onDelete("cascade"),
    uniqueIndex("captured_communication_connection_event_unique").on(table.connectionId, table.externalEventId),
    index("captured_communication_owner_contact_start_idx").on(table.ownerId, table.contactId, table.startsAt),
    index("captured_communication_owner_deal_start_idx").on(table.ownerId, table.dealId, table.startsAt),
  ]
);

export const communicationAutomationRules = mysqlTable(
  "communicationAutomationRules",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    connectionId: int("connectionId").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    triggerType: mysqlEnum("triggerType", ["calendar_event_captured"]).default("calendar_event_captured").notNull(),
    conditionsJson: text("conditionsJson").notNull(),
    actionType: mysqlEnum("actionType", ["create_follow_up"]).default("create_follow_up").notNull(),
    taskTemplateJson: text("taskTemplateJson").notNull(),
    isActive: boolean("isActive").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    foreignKey({ columns: [table.connectionId], foreignColumns: [communicationConnections.id], name: "communication_rule_connection_fk" }).onDelete("cascade"),
    uniqueIndex("communication_rule_connection_name_unique").on(table.connectionId, table.name),
    index("communication_rule_owner_connection_active_idx").on(table.ownerId, table.connectionId, table.isActive),
  ]
);

export const dealStageHistory = mysqlTable(
  "dealStageHistory",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    dealId: int("dealId").notNull().references(() => deals.id, { onDelete: "cascade" }),
    fromStageId: int("fromStageId").references(() => pipelineStages.id, { onDelete: "set null" }),
    toStageId: int("toStageId").notNull().references(() => pipelineStages.id, { onDelete: "restrict" }),
    changedAt: timestamp("changedAt").defaultNow().notNull(),
  },
  table => [index("deal_stage_history_owner_deal_changed_idx").on(table.ownerId, table.dealId, table.changedAt)]
);

export const quotes = mysqlTable(
  "quotes",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    contactId: int("contactId").references(() => contacts.id, { onDelete: "set null" }),
    companyId: int("companyId").references(() => companies.id, { onDelete: "set null" }),
    dealId: int("dealId").references(() => deals.id, { onDelete: "set null" }),
    title: varchar("title", { length: 255 }).notNull(),
    status: varchar("status", { length: 64 }).default("draft").notNull(),
    subtotalAmount: decimal("subtotalAmount", { precision: 14, scale: 2 }).default("0").notNull(),
    discountAmount: decimal("discountAmount", { precision: 14, scale: 2 }).default("0").notNull(),
    taxAmount: decimal("taxAmount", { precision: 14, scale: 2 }).default("0").notNull(),
    totalAmount: decimal("totalAmount", { precision: 14, scale: 2 }).default("0").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("quote_owner_contact_idx").on(table.ownerId, table.contactId)]
);

export const quoteItems = mysqlTable(
  "quoteItems",
  {
    id: int("id").autoincrement().primaryKey(),
    quoteId: int("quoteId").notNull().references(() => quotes.id, { onDelete: "cascade" }),
    productId: int("productId").references(() => products.id, { onDelete: "set null" }),
    priceBookEntryId: int("priceBookEntryId").references(() => priceBookEntries.id, { onDelete: "set null" }),
    productName: varchar("productName", { length: 255 }),
    productSku: varchar("productSku", { length: 120 }),
    billingType: mysqlEnum("billingType", ["one_time", "recurring"]).default("one_time").notNull(),
    description: varchar("description", { length: 512 }).notNull(),
    quantity: decimal("quantity", { precision: 12, scale: 2 }).default("1").notNull(),
    unitAmount: decimal("unitAmount", { precision: 14, scale: 2 }).default("0").notNull(),
    discountPercent: decimal("discountPercent", { precision: 5, scale: 2 }).default("0").notNull(),
    taxPercent: decimal("taxPercent", { precision: 5, scale: 2 }).default("0").notNull(),
    lineSubtotal: decimal("lineSubtotal", { precision: 14, scale: 2 }).default("0").notNull(),
    discountAmount: decimal("discountAmount", { precision: 14, scale: 2 }).default("0").notNull(),
    taxAmount: decimal("taxAmount", { precision: 14, scale: 2 }).default("0").notNull(),
    lineTotal: decimal("lineTotal", { precision: 14, scale: 2 }).default("0").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("quote_item_quote_idx").on(table.quoteId), index("quote_item_product_idx").on(table.productId)]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type FollowUp = typeof followUps.$inferSelect;
export type Pipeline = typeof pipelines.$inferSelect;
export type PipelineStage = typeof pipelineStages.$inferSelect;
export type Deal = typeof deals.$inferSelect;
