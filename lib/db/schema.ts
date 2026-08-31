import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs);

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(nowMs)
    .$onUpdate(() => new Date());

export const users = sqliteTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: integer("email_verified", { mode: "boolean" })
      .notNull()
      .default(false),
    image: text("image"),
    preferredCurrency: text("preferred_currency").notNull().default("CNY"),
    timezone: text("timezone").notNull().default("Asia/Shanghai"),
    locale: text("locale").notNull().default("fr"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    index("users_created_at_idx").on(table.createdAt),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: id(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("sessions_token_unique").on(table.token),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: id(),
    issuer: text("issuer").notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("accounts_issuer_account_id_unique").on(
      table.issuer,
      table.accountId,
    ),
    index("accounts_user_id_idx").on(table.userId),
    index("accounts_provider_id_idx").on(table.providerId),
  ],
);

export const verifications = sqliteTable(
  "verifications",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("verifications_identifier_idx").on(table.identifier),
    index("verifications_expires_at_idx").on(table.expiresAt),
  ],
);

export const rateLimits = sqliteTable(
  "rate_limits",
  {
    id: id(),
    key: text("key").notNull(),
    count: integer("count").notNull(),
    lastRequest: integer("last_request").notNull(),
  },
  (table) => [uniqueIndex("rate_limits_key_unique").on(table.key)],
);

export const groups = sqliteTable(
  "groups",
  {
    id: id(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    emoji: text("emoji").notNull().default("🧾"),
    color: text("color").notNull().default("#F97316"),
    baseCurrency: text("base_currency").notNull().default("CNY"),
    timezone: text("timezone").notNull().default("Asia/Shanghai"),
    academicYearLabel: text("academic_year_label"),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }),
    endsAt: integer("ends_at", { mode: "timestamp_ms" }),
    isArchived: integer("is_archived", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("groups_owner_user_id_idx").on(table.ownerUserId),
    index("groups_owner_archived_idx").on(
      table.ownerUserId,
      table.isArchived,
    ),
    check("groups_date_range_check", sql`${table.endsAt} is null or ${table.startsAt} is null or ${table.endsAt} >= ${table.startsAt}`),
  ],
);

export const groupMembers = sqliteTable(
  "group_members",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: text("role", { enum: ["owner", "admin", "member"] })
      .notNull()
      .default("member"),
    status: text("status", { enum: ["active", "left"] })
      .notNull()
      .default("active"),
    nickname: text("nickname"),
    joinedAt: integer("joined_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowMs),
    leftAt: integer("left_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("group_members_group_user_unique").on(
      table.groupId,
      table.userId,
    ),
    index("group_members_user_status_idx").on(table.userId, table.status),
    index("group_members_group_status_idx").on(table.groupId, table.status),
  ],
);

export const invitations = sqliteTable(
  "invitations",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    inviterUserId: text("inviter_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    invitedEmail: text("invited_email").notNull(),
    tokenHash: text("token_hash").notNull(),
    role: text("role", { enum: ["admin", "member"] })
      .notNull()
      .default("member"),
    status: text("status", {
      enum: ["pending", "accepted", "revoked", "expired"],
    })
      .notNull()
      .default("pending"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    acceptedByUserId: text("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("invitations_token_hash_unique").on(table.tokenHash),
    index("invitations_email_status_expires_idx").on(
      table.invitedEmail,
      table.status,
      table.expiresAt,
    ),
    index("invitations_group_status_idx").on(table.groupId, table.status),
    uniqueIndex("invitations_one_pending_group_email_unique")
      .on(table.groupId, table.invitedEmail)
      .where(sql`${table.status} = 'pending'`),
  ],
);

export const expenses = sqliteTable(
  "expenses",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    paidByMemberId: text("paid_by_member_id")
      .notNull()
      .references(() => groupMembers.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    notes: text("notes"),
    category: text("category").notNull().default("other"),
    amountFen: integer("amount_fen").notNull(),
    currency: text("currency").notNull().default("CNY"),
    amountBaseFen: integer("amount_base_fen"),
    fxRateMicros: integer("fx_rate_micros"),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    source: text("source", { enum: ["manual", "wechat", "alipay"] })
      .notNull()
      .default("manual"),
    receiptUrl: text("receipt_url"),
    status: text("status", { enum: ["active", "void"] })
      .notNull()
      .default("active"),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("expenses_group_occurred_idx").on(table.groupId, table.occurredAt),
    index("expenses_group_category_idx").on(table.groupId, table.category),
    index("expenses_paid_by_member_idx").on(table.paidByMemberId),
    index("expenses_created_by_user_idx").on(table.createdByUserId),
    check("expenses_amount_positive", sql`${table.amountFen} > 0`),
    check("expenses_base_amount_positive", sql`${table.amountBaseFen} is null or ${table.amountBaseFen} > 0`),
    check("expenses_fx_rate_positive", sql`${table.fxRateMicros} is null or ${table.fxRateMicros} > 0`),
  ],
);

export const expenseShares = sqliteTable(
  "expense_shares",
  {
    id: id(),
    expenseId: text("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => groupMembers.id, { onDelete: "restrict" }),
    amountFen: integer("amount_fen").notNull(),
    percentageBasisPoints: integer("percentage_basis_points"),
    sharesWeight: integer("shares_weight"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("expense_shares_expense_member_unique").on(
      table.expenseId,
      table.memberId,
    ),
    index("expense_shares_member_id_idx").on(table.memberId),
    check("expense_shares_amount_nonnegative", sql`${table.amountFen} >= 0`),
    check("expense_shares_percentage_range", sql`${table.percentageBasisPoints} is null or (${table.percentageBasisPoints} >= 0 and ${table.percentageBasisPoints} <= 10000)`),
    check("expense_shares_weight_positive", sql`${table.sharesWeight} is null or ${table.sharesWeight} > 0`),
  ],
);

export const settlements = sqliteTable(
  "settlements",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    fromMemberId: text("from_member_id")
      .notNull()
      .references(() => groupMembers.id, { onDelete: "restrict" }),
    toMemberId: text("to_member_id")
      .notNull()
      .references(() => groupMembers.id, { onDelete: "restrict" }),
    amountFen: integer("amount_fen").notNull(),
    currency: text("currency").notNull().default("CNY"),
    amountBaseFen: integer("amount_base_fen"),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    note: text("note"),
    source: text("source", { enum: ["manual", "wechat", "alipay"] })
      .notNull()
      .default("manual"),
    status: text("status", { enum: ["active", "void"] })
      .notNull()
      .default("active"),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("settlements_group_occurred_idx").on(
      table.groupId,
      table.occurredAt,
    ),
    index("settlements_from_member_idx").on(table.fromMemberId),
    index("settlements_to_member_idx").on(table.toMemberId),
    check("settlements_amount_positive", sql`${table.amountFen} > 0`),
    check("settlements_members_differ", sql`${table.fromMemberId} <> ${table.toMemberId}`),
  ],
);

export const importBatches = sqliteTable(
  "import_batches",
  {
    id: id(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["wechat", "alipay"] }).notNull(),
    sourceFilename: text("source_filename").notNull(),
    sourceFileHash: text("source_file_hash").notNull(),
    fileSizeBytes: integer("file_size_bytes"),
    status: text("status", {
      enum: ["pending", "processing", "completed", "failed", "rolled_back"],
    })
      .notNull()
      .default("pending"),
    periodStart: integer("period_start", { mode: "timestamp_ms" }),
    periodEnd: integer("period_end", { mode: "timestamp_ms" }),
    totalRows: integer("total_rows").notNull().default(0),
    importedRows: integer("imported_rows").notNull().default(0),
    duplicateRows: integer("duplicate_rows").notNull().default(0),
    skippedRows: integer("skipped_rows").notNull().default(0),
    errorRows: integer("error_rows").notNull().default(0),
    errorsJson: text("errors_json"),
    previewPayloadJson: text("preview_payload_json"),
    previewExpiresAt: integer("preview_expires_at", { mode: "timestamp_ms" }),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("import_batches_owner_provider_hash_unique").on(
      table.ownerUserId,
      table.provider,
      table.sourceFileHash,
    ),
    index("import_batches_owner_created_idx").on(
      table.ownerUserId,
      table.createdAt,
    ),
    index("import_batches_owner_status_preview_idx").on(
      table.ownerUserId,
      table.status,
      table.previewExpiresAt,
    ),
    check("import_batches_rows_nonnegative", sql`${table.totalRows} >= 0 and ${table.importedRows} >= 0 and ${table.duplicateRows} >= 0 and ${table.skippedRows} >= 0 and ${table.errorRows} >= 0`),
  ],
);

export const walletTransactions = sqliteTable(
  "wallet_transactions",
  {
    id: id(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    importBatchId: text("import_batch_id").references(() => importBatches.id, {
      onDelete: "cascade",
    }),
    provider: text("provider", {
      enum: ["manual", "wechat", "alipay"],
    }).notNull(),
    sourceId: text("source_id").notNull(),
    externalTransactionId: text("external_transaction_id"),
    merchantOrderId: text("merchant_order_id"),
    fingerprint: text("fingerprint").notNull(),
    parserVersion: text("parser_version").notNull(),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    direction: text("direction", {
      enum: ["outflow", "inflow", "neutral", "unknown"],
    }).notNull(),
    kind: text("kind"),
    status: text("status", {
      enum: [
        "completed",
        "pending",
        "failed",
        "cancelled",
        "partially_refunded",
        "refunded",
        "unknown",
      ],
    })
      .notNull()
      .default("unknown"),
    amountFen: integer("amount_fen").notNull(),
    isRefund: integer("is_refund", { mode: "boolean" })
      .notNull()
      .default(false),
    refundAmountFen: integer("refund_amount_fen"),
    relatedTransactionId: text("related_transaction_id"),
    currency: text("currency").notNull().default("CNY"),
    merchant: text("merchant"),
    counterparty: text("counterparty"),
    paymentMethod: text("payment_method"),
    rawDescription: text("raw_description"),
    note: text("note"),
    category: text("category").notNull().default("uncategorized"),
    categoryRaw: text("category_raw"),
    subcategory: text("subcategory"),
    location: text("location"),
    rawPayloadJson: text("raw_payload_json"),
    isExcluded: integer("is_excluded", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("wallet_tx_owner_provider_source_unique").on(
      table.ownerUserId,
      table.provider,
      table.sourceId,
    ),
    uniqueIndex("wallet_tx_owner_provider_external_unique").on(
      table.ownerUserId,
      table.provider,
      table.externalTransactionId,
    ),
    index("wallet_tx_owner_fingerprint_idx").on(
      table.ownerUserId,
      table.fingerprint,
    ),
    index("wallet_tx_owner_occurred_idx").on(
      table.ownerUserId,
      table.occurredAt,
    ),
    index("wallet_tx_owner_category_idx").on(
      table.ownerUserId,
      table.category,
    ),
    index("wallet_tx_import_batch_idx").on(table.importBatchId),
    check("wallet_tx_amount_nonnegative", sql`${table.amountFen} >= 0`),
    check("wallet_tx_refund_amount_nonnegative", sql`${table.refundAmountFen} is null or ${table.refundAmountFen} >= 0`),
  ],
);

export const walletExpenseLinks = sqliteTable(
  "wallet_expense_links",
  {
    id: id(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    walletTransactionId: text("wallet_transaction_id")
      .notNull()
      .references(() => walletTransactions.id, { onDelete: "cascade" }),
    expenseId: text("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    matchType: text("match_type", { enum: ["manual", "automatic", "import"] })
      .notNull()
      .default("manual"),
    confidenceBasisPoints: integer("confidence_basis_points"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("wallet_expense_links_transaction_unique").on(
      table.walletTransactionId,
    ),
    index("wallet_expense_links_owner_idx").on(table.ownerUserId),
    index("wallet_expense_links_expense_idx").on(table.expenseId),
    check("wallet_expense_links_confidence_range", sql`${table.confidenceBasisPoints} is null or (${table.confidenceBasisPoints} >= 0 and ${table.confidenceBasisPoints} <= 10000)`),
  ],
);

export const categorizationRules = sqliteTable(
  "categorization_rules",
  {
    id: id(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priority: integer("priority").notNull().default(100),
    provider: text("provider", { enum: ["wechat", "alipay"] }),
    matchField: text("match_field", {
      enum: ["merchant", "counterparty", "description", "payment_method"],
    }).notNull(),
    matchType: text("match_type", {
      enum: ["contains", "exact", "prefix", "regex"],
    })
      .notNull()
      .default("contains"),
    pattern: text("pattern").notNull(),
    category: text("category").notNull(),
    subcategory: text("subcategory"),
    isActive: integer("is_active", { mode: "boolean" })
      .notNull()
      .default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("categorization_rules_owner_name_unique").on(
      table.ownerUserId,
      table.name,
    ),
    index("categorization_rules_owner_priority_idx").on(
      table.ownerUserId,
      table.priority,
    ),
  ],
);

export const budgets = sqliteTable(
  "budgets",
  {
    id: id(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: text("group_id").references(() => groups.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    category: text("category"),
    periodType: text("period_type", {
      enum: ["week", "month", "term", "year", "custom"],
    })
      .notNull()
      .default("month"),
    amountFen: integer("amount_fen").notNull(),
    currency: text("currency").notNull().default("CNY"),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
    endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
    rollover: integer("rollover", { mode: "boolean" })
      .notNull()
      .default(false),
    alertThresholdBasisPoints: integer("alert_threshold_basis_points")
      .notNull()
      .default(8000),
    isActive: integer("is_active", { mode: "boolean" })
      .notNull()
      .default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("budgets_owner_period_idx").on(table.ownerUserId, table.startsAt),
    index("budgets_group_period_idx").on(table.groupId, table.startsAt),
    uniqueIndex("budgets_one_active_group_unique")
      .on(table.groupId)
      .where(sql`${table.groupId} is not null and ${table.isActive} = 1`),
    check("budgets_amount_positive", sql`${table.amountFen} > 0`),
    check("budgets_date_range_check", sql`${table.endsAt} >= ${table.startsAt}`),
    check("budgets_alert_threshold_range", sql`${table.alertThresholdBasisPoints} > 0 and ${table.alertThresholdBasisPoints} <= 10000`),
  ],
);

export const fxRates = sqliteTable(
  "fx_rates",
  {
    id: id(),
    ownerUserId: text("owner_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    baseCurrency: text("base_currency").notNull(),
    quoteCurrency: text("quote_currency").notNull(),
    rateMicros: integer("rate_micros").notNull(),
    effectiveDate: text("effective_date").notNull(),
    source: text("source").notNull(),
    fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("fx_rates_pair_date_source_owner_unique").on(
      table.baseCurrency,
      table.quoteCurrency,
      table.effectiveDate,
      table.source,
      table.ownerUserId,
    ),
    index("fx_rates_pair_date_idx").on(
      table.baseCurrency,
      table.quoteCurrency,
      table.effectiveDate,
    ),
    check("fx_rates_positive", sql`${table.rateMicros} > 0`),
    check("fx_rates_distinct_currencies", sql`${table.baseCurrency} <> ${table.quoteCurrency}`),
  ],
);

export const idempotencyKeys = sqliteTable(
  "idempotency_keys",
  {
    id: id(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    keyHash: text("key_hash").notNull(),
    requestHash: text("request_hash").notNull(),
    status: text("status", { enum: ["processing", "completed", "failed"] })
      .notNull()
      .default("processing"),
    responseStatus: integer("response_status"),
    responseBodyJson: text("response_body_json"),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("idempotency_owner_scope_key_unique").on(
      table.ownerUserId,
      table.scope,
      table.keyHash,
    ),
    index("idempotency_expires_at_idx").on(table.expiresAt),
  ],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: id(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    groupId: text("group_id").references(() => groups.id, {
      onDelete: "cascade",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadataJson: text("metadata_json"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_logs_owner_created_idx").on(
      table.ownerUserId,
      table.createdAt,
    ),
    index("audit_logs_group_created_idx").on(table.groupId, table.createdAt),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  owner: one(users, {
    fields: [groups.ownerUserId],
    references: [users.id],
  }),
  members: many(groupMembers),
  invitations: many(invitations),
  expenses: many(expenses),
  settlements: many(settlements),
  budgets: many(budgets),
}));

export const groupMembersRelations = relations(
  groupMembers,
  ({ one, many }) => ({
    group: one(groups, {
      fields: [groupMembers.groupId],
      references: [groups.id],
    }),
    user: one(users, {
      fields: [groupMembers.userId],
      references: [users.id],
    }),
    paidExpenses: many(expenses),
    expenseShares: many(expenseShares),
  }),
);

export const expensesRelations = relations(expenses, ({ one, many }) => ({
  group: one(groups, {
    fields: [expenses.groupId],
    references: [groups.id],
  }),
  paidBy: one(groupMembers, {
    fields: [expenses.paidByMemberId],
    references: [groupMembers.id],
  }),
  shares: many(expenseShares),
  walletLinks: many(walletExpenseLinks),
}));

export const expenseSharesRelations = relations(expenseShares, ({ one }) => ({
  expense: one(expenses, {
    fields: [expenseShares.expenseId],
    references: [expenses.id],
  }),
  member: one(groupMembers, {
    fields: [expenseShares.memberId],
    references: [groupMembers.id],
  }),
}));

export const importBatchesRelations = relations(importBatches, ({ one, many }) => ({
  owner: one(users, {
    fields: [importBatches.ownerUserId],
    references: [users.id],
  }),
  transactions: many(walletTransactions),
}));

export const walletTransactionsRelations = relations(
  walletTransactions,
  ({ one }) => ({
    owner: one(users, {
      fields: [walletTransactions.ownerUserId],
      references: [users.id],
    }),
    importBatch: one(importBatches, {
      fields: [walletTransactions.importBatchId],
      references: [importBatches.id],
    }),
    expenseLink: one(walletExpenseLinks),
  }),
);

export const walletExpenseLinksRelations = relations(
  walletExpenseLinks,
  ({ one }) => ({
    transaction: one(walletTransactions, {
      fields: [walletExpenseLinks.walletTransactionId],
      references: [walletTransactions.id],
    }),
    expense: one(expenses, {
      fields: [walletExpenseLinks.expenseId],
      references: [expenses.id],
    }),
  }),
);

export type User = typeof users.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type GroupMember = typeof groupMembers.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type ExpenseShare = typeof expenseShares.$inferSelect;
export type Settlement = typeof settlements.$inferSelect;
export type ImportBatch = typeof importBatches.$inferSelect;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
