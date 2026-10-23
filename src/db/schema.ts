import { pgTable, uuid, text, timestamp, boolean, integer, date, primaryKey, index, uniqueIndex, jsonb, doublePrecision,  } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export const ROLES = ["admin", "manager", "rep", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const STAGES = ["new", "contacted", "engaged", "meeting", "proposal", "won", "lost"] as const;
export type Stage = (typeof STAGES)[number];

export const ACTIVITY_TYPES = ["email", "reply", "call", "meeting", "request", "note", "file"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  name: text("name"),
  image: text("image"),
  role: text("role").$type<Role>().notNull().default("rep"),
  status: text("status").$type<"active" | "disabled">().notNull().default("active"),
  invitedById: uuid("invited_by_id"),
  digestOptIn: boolean("digest_opt_in").notNull().default(true),
  timezone: text("timezone").notNull().default("America/Los_Angeles"),
  lastDigestAt: timestamp("last_digest_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
}, (t) => [uniqueIndex("users_email_uq").on(t.email)]);

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  role: text("role").$type<Role>().notNull().default("rep"),
  token: text("token").notNull(),
  status: text("status").$type<"pending" | "accepted" | "revoked">().notNull().default("pending"),
  invitedById: uuid("invited_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  // teams the person joins when they accept
  teamIds: jsonb("team_ids").$type<string[]>().notNull().default([]),
}, (t) => [uniqueIndex("invites_email_uq").on(t.email), uniqueIndex("invites_token_uq").on(t.token)]);

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull(),
  website: text("website").notNull().default(""),
  notes: text("notes").notNull().default(""),
  description: text("description").notNull().default(""),
  industry: text("industry").notNull().default(""),
  location: text("location").notNull().default(""),
  employees: text("employees").notNull().default(""),
  enrichedAt: timestamp("enriched_at", { withTimezone: true }),
  crmId: text("crm_id"),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("companies_key_uq").on(t.nameKey)]);

export const products = pgTable("products", {
  notes: text("notes").notNull().default(""),
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("products_name_uq").on(t.name)]);

export const teams = pgTable("teams", {
  notes: text("notes").notNull().default(""),
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  color: text("color").notNull().default("#4C8DF0"),
  leadId: uuid("lead_id").references(() => users.id, { onDelete: "set null" }),
  target: integer("target").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("teams_name_uq").on(t.name)]);

export const teamMembers = pgTable("team_members", {
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.teamId, t.userId] })]);

export const teamProducts = pgTable("team_products", {
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.teamId, t.productId] })]);

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  location: text("location").notNull().default(""),
  cost: integer("cost").notNull().default(0),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  title: text("title").notNull().default(""),
  email: text("email").notNull().default(""),
  /** other addresses the same person uses (all are matched when syncing email and calendars) */
  otherEmails: jsonb("other_emails").$type<string[]>().notNull().default([]),
  otherPhones: jsonb("other_phones").$type<string[]>().notNull().default([]),
  /** the follow-up was dismissed on this day: off the Follow-ups list until a later follow-up date is set */
  followupDismissedOn: text("followup_dismissed_on"),
  /** their LinkedIn profile (confirmed by a person) and a short professional background (from LinkedIn or the web) */
  linkedinUrl: text("linkedin_url").notNull().default(""),
  background: text("background").notNull().default(""),
  phone: text("phone").notNull().default(""),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  status: text("status").$type<Stage>().notNull().default("new"),
  tags: text("tags").array().notNull().default([]),
  rating: integer("rating").notNull().default(0),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  nextFollowUp: date("next_follow_up"),
  source: text("source").notNull().default(""),
  referredBy: text("referred_by").notNull().default(""),
  eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
  clientRef: text("client_ref"),
  // asked not to receive email from us: sequences stop and sending is blocked
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  outcomeReason: text("outcome_reason"),
  outcomeNote: text("outcome_note").notNull().default(""),
  crmId: text("crm_id"),
  crmSyncedAt: timestamp("crm_synced_at", { withTimezone: true }),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  personal: boolean("personal").notNull().default(false),   // visible only to the person who added it (createdById)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastTouchAt: timestamp("last_touch_at", { withTimezone: true }),
}, (t) => [uniqueIndex("contacts_client_ref_uq").on(t.clientRef), index("contacts_company_idx").on(t.companyId), index("contacts_owner_idx").on(t.ownerId)]);

export const contactProducts = pgTable("contact_products", {
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.contactId, t.productId] })]);

export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  type: text("type").$type<ActivityType>().notNull(),
  subject: text("subject").notNull().default(""),
  body: text("body").notNull().default(""),
  outcome: text("outcome"),
  kind: text("kind"),
  done: boolean("done").notNull().default(false),
  bounced: boolean("bounced").notNull().default(false),
  meetingAt: timestamp("meeting_at", { withTimezone: true }),
  /** a calendar meeting that was cancelled */
  cancelled: boolean("cancelled").notNull().default(false),
  byId: uuid("by_id").references(() => users.id, { onDelete: "set null" }),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  delivery: text("delivery").$type<"logged" | "sent" | "failed">(),
  deliveryError: text("delivery_error"),
  trackToken: text("track_token"),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  openCount: integer("open_count").notNull().default(0),
  origin: text("origin").$type<"app" | "sync" | "sequence" | "calendar" | "intake">().notNull().default("app"),
  externalId: text("external_id"),
  // full email details: who it was between, the HTML version, and which mailbox it came from (for attachments)
  emailFrom: text("email_from"),
  emailTo: jsonb("email_to").$type<string[]>().notNull().default([]),
  emailCc: jsonb("email_cc").$type<string[]>().notNull().default([]),
  bodyHtml: text("body_html"),
  mailboxUserId: uuid("mailbox_user_id"),
  /** emails are private to their owner (sender, or the mailbox they came into) unless the owner shares them */
  shared: boolean("shared").notNull().default(false),
  /** shared with these people only (user ids), as well as or instead of the whole team */
  sharedWith: jsonb("shared_with").$type<string[]>().notNull().default([]),
  providerMessageId: text("provider_message_id"),
  // last change to the text, by a person (for notes, calls, meetings and other logged entries)
  editedAt: timestamp("edited_at", { withTimezone: true }),
  editedById: uuid("edited_by_id").references(() => users.id, { onDelete: "set null" }),
}, (t) => [uniqueIndex("activities_external_uq").on(t.externalId), index("activities_contact_idx").on(t.contactId), index("activities_at_idx").on(t.at), uniqueIndex("activities_track_uq").on(t.trackToken)]);

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  activityId: uuid("activity_id").references(() => activities.id, { onDelete: "cascade" }),
  taskCommentId: uuid("task_comment_id").references((): AnyPgColumn => taskComments.id, { onDelete: "cascade" }),
  commentId: uuid("comment_id").references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  storageKey: text("storage_key").notNull(),
  uploadedById: uuid("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("files_activity_idx").on(t.activityId), index("files_task_comment_idx").on(t.taskCommentId)]);

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  detail: jsonb("detail").$type<Record<string, unknown>>(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("audit_at_idx").on(t.at)]);

export const DEAL_STAGES = ["qualify", "proposal", "negotiation", "won", "lost"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export const deals = pgTable("deals", {
  notes: text("notes").notNull().default(""),
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
  value: integer("value").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  stage: text("stage").$type<DealStage>().notNull().default("qualify"),
  probability: integer("probability").notNull().default(20),
  closeDate: date("close_date"),
  outcomeReason: text("outcome_reason"),
  outcomeNote: text("outcome_note").notNull().default(""),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("deals_company_idx").on(t.companyId)]);

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  notes: text("notes").notNull().default(""),
  dueDate: date("due_date"),
  assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
  dealId: uuid("deal_id").references(() => deals.id, { onDelete: "cascade" }),
  /** every lead and company the task is linked to (the main ones above are the first of each) */
  contactIds: jsonb("contact_ids").$type<string[]>().notNull().default([]),
  companyIds: jsonb("company_ids").$type<string[]>().notNull().default([]),
  done: boolean("done").notNull().default(false),
  doneAt: timestamp("done_at", { withTimezone: true }),
  status: text("status").$type<TaskStatus>().notNull().default("todo"),
  priority: text("priority").$type<TaskPriority>().notNull().default("normal"),
  repeat: text("repeat").$type<TaskRepeat>().notNull().default("none"),
  repeatSpawnedId: uuid("repeat_spawned_id"),
  reminderSentFor: date("reminder_sent_for"),
  overdueSentFor: date("overdue_sent_for"),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  /** set on tasks the app makes by itself (e.g. "prep:<meeting id>"), so each is made once */
  sourceKey: text("source_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("tasks_assignee_idx").on(t.assigneeId), uniqueIndex("tasks_source_key_uq").on(t.sourceKey)]);

export const TASK_STATUSES = ["todo", "in_progress", "waiting", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const TASK_REPEATS = ["none", "daily", "weekly", "biweekly", "monthly", "quarterly"] as const;
export type TaskRepeat = (typeof TASK_REPEATS)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** People tagged on a task. They see it under "Tagged", get notified and can reply. */
export const taskWatchers = pgTable("task_watchers", {
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.taskId, t.userId] })]);

/** The conversation on a task: replies (kind "comment") and an automatic log of changes (kind "event"). */
export const taskComments = pgTable("task_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  kind: text("kind").$type<"comment" | "event">().notNull().default("comment"),
  body: text("body").notNull().default(""),
  mentionIds: jsonb("mention_ids").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
}, (t) => [index("task_comments_task_idx").on(t.taskId, t.createdAt)]);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"assigned" | "tagged" | "mentioned" | "comment" | "status" | "due" | "overdue" | "task" | "booking" | "reply" | "unsubscribed" | "content">().notNull(),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  text: text("text").notNull(),
  link: text("link"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)]);

export type SequenceStep = { dayOffset: number; subject: string; body: string };
export const sequences = pgTable("sequences", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  steps: jsonb("steps").$type<SequenceStep[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const enrollments = pgTable("sequence_enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  sequenceId: uuid("sequence_id").notNull().references(() => sequences.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  step: integer("step").notNull().default(0),
  nextAt: timestamp("next_at", { withTimezone: true }),
  status: text("status").$type<"active" | "completed" | "stopped">().notNull().default("active"),
  stoppedReason: text("stopped_reason"),
  lastError: text("last_error"),
  enrolledById: uuid("enrolled_by_id").references(() => users.id, { onDelete: "set null" }),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("enroll_next_idx").on(t.status, t.nextAt)]);

/** Mailbox and calendar access a person granted with "Connect mailbox". Tokens are encrypted at rest. */
export const connections = pgTable("mailbox_connections", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").$type<"microsoft" | "google">().notNull(),
  email: text("email").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  scope: text("scope").notNull().default(""),
  status: text("status").$type<"ok" | "error">().notNull().default("ok"),
  lastError: text("last_error"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobState = pgTable("job_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Cached AI summaries so the same view is not re-generated on every page load. */
export const aiSummaries = pgTable("ai_summaries", {
  key: text("key").primaryKey(),
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  dataHash: text("data_hash").notNull(),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Team discussion on a lead, deal or company: internal notes and @mentions, separate from the customer timeline. */
export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: text("entity_type").$type<"contact" | "deal" | "company">().notNull(),
  entityId: uuid("entity_id").notNull(),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  body: text("body").notNull().default(""),
  mentionIds: jsonb("mention_ids").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
}, (t) => [index("comments_entity_idx").on(t.entityType, t.entityId, t.createdAt)]);

/** Email templates the whole team shares and edits. */
export const emailTemplates = pgTable("email_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  subject: text("subject").notNull().default(""),
  body: text("body").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(100),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Attachments on synced emails. Fetched from the mailbox the first time someone opens one, then kept. */
export const emailAttachments = pgTable("email_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  activityId: uuid("activity_id").notNull().references(() => activities.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull().default(0),
  partRef: text("part_ref").notNull(),
  storageKey: text("storage_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("email_attachments_activity_idx").on(t.activityId), uniqueIndex("email_attachments_part_uq").on(t.activityId, t.partRef)]);

/** Each person's public booking page (/book/<slug>): leads pick a free time from their calendar. */
export const bookingPages = pgTable("booking_pages", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  title: text("title").notNull().default("Meet with me"),
  intro: text("intro").notNull().default(""),
  durations: jsonb("durations").$type<number[]>().notNull().default([30]),
  workdays: jsonb("workdays").$type<number[]>().notNull().default([1, 2, 3, 4, 5]),
  startHour: integer("start_hour").notNull().default(9),
  endHour: integer("end_hour").notNull().default(17),
  minNoticeHours: integer("min_notice_hours").notNull().default(4),
  daysAhead: integer("days_ahead").notNull().default(21),
  bufferMin: integer("buffer_min").notNull().default(0),
  online: boolean("online").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("booking_pages_slug_uq").on(t.slug)]);

/** Saved filter combinations on Contacts and Deals, personal or shared with the team. */
export const savedViews = pgTable("saved_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  page: text("page").notNull(),
  name: text("name").notNull(),
  filters: jsonb("filters").$type<Record<string, string>>().notNull().default({}),
  shared: boolean("shared").notNull().default(false),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Phones and browsers that have turned on push notifications (Web Push). */
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  device: text("device").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
}, (t) => [uniqueIndex("push_endpoint_uq").on(t.endpoint), index("push_user_idx").on(t.userId)]);

/** Money for a deal: payments already received, and ones expected on a future date. */
export const dealPayments = pgTable("deal_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id").notNull().references(() => deals.id, { onDelete: "cascade" }),
  amount: doublePrecision("amount").notNull(),
  // received: the date the money came in; expected: the date it should come in
  status: text("status").$type<"received" | "expected">().notNull().default("received"),
  date: date("date").notNull(),
  note: text("note").notNull().default(""),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("deal_payments_deal_idx").on(t.dealId)]);

/** A signed SOW (or amendment) attached to a deal, with what AI read from it. */
export const sows = pgTable("sows", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id").notNull().references(() => deals.id, { onDelete: "cascade" }),
  fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
  title: text("title").notNull().default(""),
  value: doublePrecision("value"),
  currency: text("currency").notNull().default("USD"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  poNumber: text("po_number").notNull().default(""),
  billingContact: text("billing_contact").notNull().default(""),
  netDays: integer("net_days"),
  termsSummary: text("terms_summary").notNull().default(""),
  /** SOW details: its number, kind of contract, draft or signed, still in use, and an optional project */
  sowNumber: text("sow_number").notNull().default(""),
  sowType: text("sow_type").$type<"fixed" | "milestone" | "tm" | "retainer" | "other" | "">().notNull().default(""),
  signStatus: text("sign_status").$type<"draft" | "signed">().notNull().default("signed"),
  active: boolean("active").notNull().default(true),
  projectId: uuid("project_id"),
  extracted: jsonb("extracted").$type<Record<string, unknown>>(),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("sows_deal_idx").on(t.dealId)]);

/**
 * One invoice to raise for a deal: from a SOW's payment terms or added by hand.
 * Scheduled -> requested (accounts asked to invoice) -> invoiced -> paid. Each has a reminder task.
 */
export const billingItems = pgTable("billing_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id").notNull().references(() => deals.id, { onDelete: "cascade" }),
  sowId: uuid("sow_id").references(() => sows.id, { onDelete: "set null" }),
  label: text("label").notNull(),
  amount: doublePrecision("amount").notNull().default(0),
  percent: doublePrecision("percent"),
  dueDate: date("due_date"),
  trigger: text("trigger").notNull().default(""),
  kind: text("kind").$type<"invoice" | "renewal">().notNull().default("invoice"),
  status: text("status").$type<"scheduled" | "requested" | "invoiced" | "paid" | "cancelled">().notNull().default("scheduled"),
  invoiceNumber: text("invoice_number").notNull().default(""),
  invoicedOn: date("invoiced_on"),
  paymentDue: date("payment_due"),
  requestedAt: timestamp("requested_at", { withTimezone: true }),
  requestedById: uuid("requested_by_id").references(() => users.id, { onDelete: "set null" }),
  requestedTo: jsonb("requested_to").$type<string[]>().notNull().default([]),
  paidOn: date("paid_on"),
  paymentId: uuid("payment_id"),
  assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
  watcherIds: jsonb("watcher_ids").$type<string[]>().notNull().default([]),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  autoSend: boolean("auto_send").notNull().default(false),
  note: text("note").notNull().default(""),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("billing_deal_idx").on(t.dealId), index("billing_due_idx").on(t.dueDate)]);

/** A next-best-action suggestion someone snoozed (per person). The signature changes when the situation does, so it comes back. */
export const actionSnoozes = pgTable("action_snoozes", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  signature: text("signature").notNull(),
  until: date("until").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.contactId, t.signature] })]);

/** Recycle bin: a complete snapshot of something deleted (and everything deleted with it), restorable for 30 days. */
export const trash = pgTable("trash", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  entityId: text("entity_id").notNull(),
  label: text("label").notNull(),
  detail: text("detail").notNull().default(""),
  snapshot: jsonb("snapshot").$type<{ rows: { table: string; data: Record<string, unknown>[] }[]; links: { table: string; column: string; ids: string[]; value: string }[] }>().notNull(),
  fileKeys: jsonb("file_keys").$type<string[]>().notNull().default([]),
  deletedById: uuid("deleted_by_id").references(() => users.id, { onDelete: "set null" }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("trash_deleted_idx").on(t.deletedAt)]);

/** Saved reports: what to count, how to group it, filters and chart; optionally emailed on a schedule. */
export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  def: jsonb("def").$type<Record<string, unknown>>().notNull(),
  shared: boolean("shared").notNull().default(false),
  schedule: jsonb("schedule").$type<{ freq: "weekly" | "monthly"; weekday?: number; recipients: string[]; toDrive?: boolean } | null>(),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
/** Dashboards: a set of saved reports, viewable by anyone with the private link while it's switched on. */
export const dashboards = pgTable("dashboards", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  reportIds: jsonb("report_ids").$type<string[]>().notNull().default([]),
  token: text("token").notNull(),
  linkOn: boolean("link_on").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("dashboards_token_idx").on(t.token)]);

/** Content library: brochures, case studies, decks (PDF) shared through tracked links. */
export const content = pgTable("content", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  storageKey: text("storage_key").notNull(),
  size: integer("size").notNull(),
  pages: integer("pages").notNull().default(1),
  /** "file" (any type: PDF, PowerPoint, Word, Excel, image, video, audio, …) or "link" (a web page or video) */
  kind: text("kind").$type<"file" | "link">().notNull().default("file"),
  fileType: text("file_type").notNull().default("application/pdf"),
  fileName: text("file_name").notNull().default(""),
  url: text("url").notNull().default(""),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
/** A tracked link to a document: for one lead, or general (no lead). */
export const contentLinks = pgTable("content_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  contentId: uuid("content_id").notNull().references(() => content.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("content_links_token_idx").on(t.token)]);
/** One viewing session: which pages, for how long. */
export const contentViews = pgTable("content_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  linkId: uuid("link_id").notNull().references(() => contentLinks.id, { onDelete: "cascade" }),
  pages: jsonb("pages").$type<Record<string, number>>().notNull().default({}),
  seconds: integer("seconds").notNull().default(0),
  activityId: uuid("activity_id"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastAt: timestamp("last_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("content_views_link_idx").on(t.linkId)]);

/** Projects: an optional grouping of a client's SOWs. */
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
/** Costs of delivering a SOW (planned and actual), for profitability. */
export const sowExpenses = pgTable("sow_expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  sowId: uuid("sow_id").notNull().references(() => sows.id, { onDelete: "cascade" }),
  type: text("type").$type<"employee" | "contractor" | "tools" | "travel" | "other">().notNull().default("employee"),
  name: text("name").notNull(),
  calc: text("calc").$type<"one_time" | "monthly">().notNull().default("one_time"),
  planned: doublePrecision("planned").notNull().default(0),
  actual: doublePrecision("actual"),
  currency: text("currency").notNull().default("USD"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  active: boolean("active").notNull().default(true),
  notes: text("notes").notNull().default(""),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("sow_expenses_sow_idx").on(t.sowId)]);
/** Collections: a follow-up on an unpaid invoice, with an optional promise to pay. */
export const collectionFollowups = pgTable("collection_followups", {
  id: uuid("id").primaryKey().defaultRandom(),
  billingItemId: uuid("billing_item_id").notNull().references(() => billingItems.id, { onDelete: "cascade" }),
  assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
  type: text("type").$type<"call" | "email" | "meeting" | "other">().notNull().default("email"),
  priority: text("priority").$type<"high" | "normal" | "low">().notNull().default("normal"),
  dueDate: date("due_date").notNull(),
  status: text("status").$type<"open" | "done">().notNull().default("open"),
  outcome: text("outcome").$type<"no_answer" | "left_message" | "promised" | "disputed" | "paid" | "other" | "">().notNull().default(""),
  notes: text("notes").notNull().default(""),
  promiseDate: date("promise_date"),
  promiseAmount: doublePrecision("promise_amount"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("collection_followups_item_idx").on(t.billingItemId)]);

/** Agencies supplying C2C resources: who to pay, and on what terms. */

/* ───────────── Accounting integration (QuickBooks today; others later or by file import) ───────────── */
export const accountingConnections = pgTable("accounting_connections", {
  provider: text("provider").$type<"quickbooks">().primaryKey(),
  realmId: text("realm_id").notNull(),
  companyName: text("company_name").notNull().default(""),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: text("status").$type<"ok" | "error">().notNull().default("ok"),
  lastError: text("last_error"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  connectedById: uuid("connected_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
/** Invoices as the accounting system sees them, and which the app invoice each one is. */
export const accountingInvoices = pgTable("accounting_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").$type<"quickbooks" | "import">().notNull(),
  externalId: text("external_id").notNull(),
  docNumber: text("doc_number").notNull().default(""),
  customerName: text("customer_name").notNull().default(""),
  amount: doublePrecision("amount").notNull().default(0),
  balance: doublePrecision("balance").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  txnDate: date("txn_date"),
  dueDate: date("due_date"),
  paidOn: date("paid_on"),
  localType: text("local_type").$type<"billing">(),
  localId: uuid("local_id"),
  ignored: boolean("ignored").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("accounting_invoices_ext_uq").on(t.source, t.externalId)]);

/** Sales targets per person or team, per month or quarter. */
export const targets = pgTable("targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  scope: text("scope").$type<"user" | "team">().notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
  measure: text("measure").$type<"won_value" | "won_deals" | "meetings" | "new_leads" | "collected">().notNull(),
  period: text("period").$type<"month" | "quarter">().notNull().default("month"),
  amount: doublePrecision("amount").notNull(),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A quote or proposal for a deal: lines, totals, terms, and a private link the client opens and accepts. */
export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id").notNull().references(() => deals.id, { onDelete: "cascade" }),
  number: text("number").notNull(),
  title: text("title").notNull().default(""),
  intro: text("intro").notNull().default(""),
  terms: text("terms").notNull().default(""),
  lines: jsonb("lines").$type<{ description: string; qty: number; unitPrice: number }[]>().notNull().default([]),
  currency: text("currency").notNull().default("USD"),
  discountPct: doublePrecision("discount_pct").notNull().default(0),
  taxRate: doublePrecision("tax_rate").notNull().default(0),
  subtotal: doublePrecision("subtotal").notNull().default(0),
  total: doublePrecision("total").notNull().default(0),
  validUntil: date("valid_until"),
  status: text("status").$type<"draft" | "sent" | "viewed" | "accepted" | "declined">().notNull().default("draft"),
  token: text("token").notNull(),
  sentTo: jsonb("sent_to").$type<string[]>().notNull().default([]),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }),
  views: integer("views").notNull().default(0),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  respondedBy: text("responded_by").notNull().default(""),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("quotes_number_uq").on(t.number), uniqueIndex("quotes_token_uq").on(t.token), index("quotes_deal_idx").on(t.dealId)]);

/** People found in synced email at a saved company's domain who aren't contacts yet: suggested on the company page. */
export const contactSuggestions = pgTable("contact_suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  name: text("name").notNull().default(""),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
  mailboxUserId: uuid("mailbox_user_id").references(() => users.id, { onDelete: "set null" }),
  emails: integer("emails").notNull().default(1),
  lastSubject: text("last_subject").notNull().default(""),
  lastAt: timestamp("last_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").$type<"new" | "added" | "dismissed">().notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("contact_suggestions_email_uq").on(t.email)]);

/** Stories: an event capture journal (people photos, business cards, voice notes, notes). Not contacts until you say so. */
export const stories = pgTable("stories", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
  shared: boolean("shared").notNull().default(false),
  /** shared with these people only (user ids), as well as or instead of the whole team */
  sharedWith: jsonb("shared_with").$type<string[]>().notNull().default([]),
  summary: jsonb("summary").$type<{ summary: string; keyPoints: string[]; nextSteps: string[]; dues?: string[]; dismissed?: string[]; tasks?: Record<string, string>; at: number } | null>(),
  /** leads and companies this note is linked to (added any time) */
  contactIds: jsonb("contact_ids").$type<string[]>().notNull().default([]),
  companyIds: jsonb("company_ids").$type<string[]>().notNull().default([]),
  /** a draft: saved as you go, seen only by the person who made it, until they save or discard it */
  draft: boolean("draft").notNull().default(false),
  /** people from your Google or phone contacts this note is about, who aren't the app contacts (yet) */
  people: jsonb("people").$type<{ name: string; email?: string; phone?: string; company?: string; title?: string; source: "google" | "phone" }[]>().notNull().default([]),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type FoundPerson = { name: string; title: string; company: string; email: string; phone: string; website: string; from: "card" | "photo" | "voice"; status: "new" | "added" | "company" | "dismissed"; contactId?: string; companyId?: string };
export const storyItems = pgTable("story_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  storyId: uuid("story_id").notNull().references(() => stories.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"photo" | "card" | "voice" | "note">().notNull(),
  storageKey: text("storage_key"),
  contentType: text("content_type").notNull().default(""),
  fileName: text("file_name").notNull().default(""),
  text: text("text").notNull().default(""),
  found: jsonb("found").$type<FoundPerson[]>().notNull().default([]),
  aiStatus: text("ai_status").$type<"none" | "pending" | "done" | "failed">().notNull().default("none"),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
}, (t) => [index("story_items_story_idx").on(t.storyId)]);

/** Tasks suggested from calendar meetings: nothing is added until someone chooses to. */
export const taskSuggestions = pgTable("task_suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sourceKey: text("source_key").notNull(),
  kind: text("kind").$type<"prep" | "follow">().notNull(),
  title: text("title").notNull(),
  notes: text("notes").notNull().default(""),
  dueDate: text("due_date"),
  meetingTitle: text("meeting_title").notNull().default(""),
  meetingAt: timestamp("meeting_at", { withTimezone: true }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
  status: text("status").$type<"new" | "added" | "dismissed">().notNull().default("new"),
  taskId: uuid("task_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("task_suggestions_key_uq").on(t.sourceKey)]);

/** A follow-up someone removed for themselves only (others still see it). Comes back when a newer follow-up date is set. */
export const followupDismissals = pgTable("followup_dismissals", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  dismissedOn: date("dismissed_on", { mode: "string" }).notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.contactId] })]);

/** Money going out: what we owe a W-2 employee, a 1099 contractor or a C2C vendor (made when a client invoice is paid, or captured from a vendor's email). Needs approval. */
export type Approval = { step: number; userId: string; decision: "approved" | "rejected"; note: string; at: number };
export type HistoryItem = { at: number; by: string | null; action: string; note?: string };
/** A payment received (from a client) or made (to a payee), split across one or more invoices. */

/** Outside calendars a person links (personal Google, Outlook, iCloud… by their private calendar link); read-only, only they see them. */
export const userCalendars = pgTable("user_calendars", { id: uuid("id").primaryKey().defaultRandom(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(), url: text("url").notNull(), color: text("color").notNull().default("#7c5cff"), lastFetchAt: timestamp("last_fetch_at", { withTimezone: true }), lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() });

/* ── Email and password sign-in (AUTH_EMAIL_PASSWORD=true). Kept apart from users so a password hash is never exported, backed up or sent to a browser. ── */
export const userPasswords = pgTable("user_passwords", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  /** scrypt hash with its salt and settings: never the password itself */
  hash: text("hash").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One-time "set your password" links an admin hands out, or "forgot password" emails. Only a hash of the token is stored. */
export const passwordTokens = pgTable("password_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("password_tokens_hash_uq").on(t.tokenHash)]);
