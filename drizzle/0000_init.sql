CREATE TABLE "accounting_connections" (
	"provider" text PRIMARY KEY NOT NULL,
	"realm_id" text NOT NULL,
	"company_name" text DEFAULT '' NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"last_error" text,
	"last_sync_at" timestamp with time zone,
	"connected_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounting_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"doc_number" text DEFAULT '' NOT NULL,
	"customer_name" text DEFAULT '' NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"balance" double precision DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"txn_date" date,
	"due_date" date,
	"paid_on" date,
	"local_type" text,
	"local_id" uuid,
	"ignored" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_snoozes" (
	"user_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"signature" text NOT NULL,
	"until" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "action_snoozes_user_id_contact_id_signature_pk" PRIMARY KEY("user_id","contact_id","signature")
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"type" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"outcome" text,
	"kind" text,
	"done" boolean DEFAULT false NOT NULL,
	"bounced" boolean DEFAULT false NOT NULL,
	"meeting_at" timestamp with time zone,
	"cancelled" boolean DEFAULT false NOT NULL,
	"by_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivery" text,
	"delivery_error" text,
	"track_token" text,
	"opened_at" timestamp with time zone,
	"open_count" integer DEFAULT 0 NOT NULL,
	"origin" text DEFAULT 'app' NOT NULL,
	"external_id" text,
	"email_from" text,
	"email_to" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"email_cc" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"body_html" text,
	"mailbox_user_id" uuid,
	"shared" boolean DEFAULT false NOT NULL,
	"shared_with" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider_message_id" text,
	"edited_at" timestamp with time zone,
	"edited_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "ai_summaries" (
	"key" text PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL,
	"data_hash" text NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"detail" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"sow_id" uuid,
	"label" text NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"percent" double precision,
	"due_date" date,
	"trigger" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'invoice' NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"invoice_number" text DEFAULT '' NOT NULL,
	"invoiced_on" date,
	"payment_due" date,
	"requested_at" timestamp with time zone,
	"requested_by_id" uuid,
	"requested_to" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"paid_on" date,
	"payment_id" uuid,
	"assignee_id" uuid,
	"watcher_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"task_id" uuid,
	"auto_send" boolean DEFAULT false NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_pages" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"title" text DEFAULT 'Meet with me' NOT NULL,
	"intro" text DEFAULT '' NOT NULL,
	"durations" jsonb DEFAULT '[30]'::jsonb NOT NULL,
	"workdays" jsonb DEFAULT '[1,2,3,4,5]'::jsonb NOT NULL,
	"start_hour" integer DEFAULT 9 NOT NULL,
	"end_hour" integer DEFAULT 17 NOT NULL,
	"min_notice_hours" integer DEFAULT 4 NOT NULL,
	"days_ahead" integer DEFAULT 21 NOT NULL,
	"buffer_min" integer DEFAULT 0 NOT NULL,
	"online" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_followups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"billing_item_id" uuid NOT NULL,
	"assignee_id" uuid,
	"type" text DEFAULT 'email' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"due_date" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"outcome" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"promise_date" date,
	"promise_amount" double precision,
	"completed_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text DEFAULT '' NOT NULL,
	"mention_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"industry" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"employees" text DEFAULT '' NOT NULL,
	"enriched_at" timestamp with time zone,
	"crm_id" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mailbox_connections" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"email" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"scope" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"last_error" text,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_products" (
	"contact_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	CONSTRAINT "contact_products_contact_id_product_id_pk" PRIMARY KEY("contact_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "contact_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"company_id" uuid,
	"mailbox_user_id" uuid,
	"emails" integer DEFAULT 1 NOT NULL,
	"last_subject" text DEFAULT '' NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"other_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"other_phones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"followup_dismissed_on" text,
	"linkedin_url" text DEFAULT '' NOT NULL,
	"background" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"company_id" uuid,
	"status" text DEFAULT 'new' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"rating" integer DEFAULT 0 NOT NULL,
	"owner_id" uuid,
	"next_follow_up" date,
	"source" text DEFAULT '' NOT NULL,
	"referred_by" text DEFAULT '' NOT NULL,
	"event_id" uuid,
	"team_id" uuid,
	"client_ref" text,
	"unsubscribed_at" timestamp with time zone,
	"outcome_reason" text,
	"outcome_note" text DEFAULT '' NOT NULL,
	"crm_id" text,
	"crm_synced_at" timestamp with time zone,
	"created_by_id" uuid,
	"personal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_touch_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"storage_key" text NOT NULL,
	"size" integer NOT NULL,
	"pages" integer DEFAULT 1 NOT NULL,
	"kind" text DEFAULT 'file' NOT NULL,
	"file_type" text DEFAULT 'application/pdf' NOT NULL,
	"file_name" text DEFAULT '' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"contact_id" uuid,
	"token" text NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid NOT NULL,
	"pages" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL,
	"activity_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"report_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"token" text NOT NULL,
	"link_on" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"amount" double precision NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"date" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"notes" text DEFAULT '' NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"company_id" uuid,
	"contact_id" uuid,
	"product_id" uuid,
	"owner_id" uuid,
	"team_id" uuid,
	"value" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"stage" text DEFAULT 'qualify' NOT NULL,
	"probability" integer DEFAULT 20 NOT NULL,
	"close_date" date,
	"outcome_reason" text,
	"outcome_note" text DEFAULT '' NOT NULL,
	"closed_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"part_ref" text NOT NULL,
	"storage_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_by_id" uuid,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequence_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"step" integer DEFAULT 0 NOT NULL,
	"next_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"stopped_reason" text,
	"last_error" text,
	"enrolled_by_id" uuid,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"location" text DEFAULT '' NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid,
	"task_comment_id" uuid,
	"comment_id" uuid,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "followup_dismissals" (
	"user_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"dismissed_on" date NOT NULL,
	CONSTRAINT "followup_dismissals_user_id_contact_id_pk" PRIMARY KEY("user_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'rep' NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"team_ids" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"task_id" uuid,
	"actor_id" uuid,
	"text" text NOT NULL,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"notes" text DEFAULT '' NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"device" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"number" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"intro" text DEFAULT '' NOT NULL,
	"terms" text DEFAULT '' NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"discount_pct" double precision DEFAULT 0 NOT NULL,
	"tax_rate" double precision DEFAULT 0 NOT NULL,
	"subtotal" double precision DEFAULT 0 NOT NULL,
	"total" double precision DEFAULT 0 NOT NULL,
	"valid_until" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"token" text NOT NULL,
	"sent_to" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sent_at" timestamp with time zone,
	"first_viewed_at" timestamp with time zone,
	"views" integer DEFAULT 0 NOT NULL,
	"responded_at" timestamp with time zone,
	"responded_by" text DEFAULT '' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"def" jsonb NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"schedule" jsonb,
	"last_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page" text NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sow_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sow_id" uuid NOT NULL,
	"type" text DEFAULT 'employee' NOT NULL,
	"name" text NOT NULL,
	"calc" text DEFAULT 'one_time' NOT NULL,
	"planned" double precision DEFAULT 0 NOT NULL,
	"actual" double precision,
	"currency" text DEFAULT 'USD' NOT NULL,
	"start_date" date,
	"end_date" date,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"file_id" uuid,
	"title" text DEFAULT '' NOT NULL,
	"value" double precision,
	"currency" text DEFAULT 'USD' NOT NULL,
	"start_date" date,
	"end_date" date,
	"po_number" text DEFAULT '' NOT NULL,
	"billing_contact" text DEFAULT '' NOT NULL,
	"net_days" integer,
	"terms_summary" text DEFAULT '' NOT NULL,
	"sow_number" text DEFAULT '' NOT NULL,
	"sow_type" text DEFAULT '' NOT NULL,
	"sign_status" text DEFAULT 'signed' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"project_id" uuid,
	"extracted" jsonb,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"event_id" uuid,
	"shared" boolean DEFAULT false NOT NULL,
	"shared_with" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" jsonb,
	"contact_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"company_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"draft" boolean DEFAULT false NOT NULL,
	"people" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text,
	"content_type" text DEFAULT '' NOT NULL,
	"file_name" text DEFAULT '' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"found" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_status" text DEFAULT 'none' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"user_id" uuid,
	"team_id" uuid,
	"measure" text NOT NULL,
	"period" text DEFAULT 'month' NOT NULL,
	"amount" double precision NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"author_id" uuid,
	"kind" text DEFAULT 'comment' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"mention_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "task_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"due_date" text,
	"meeting_title" text DEFAULT '' NOT NULL,
	"meeting_at" timestamp with time zone,
	"contact_id" uuid,
	"company_id" uuid,
	"status" text DEFAULT 'new' NOT NULL,
	"task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_watchers" (
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_watchers_task_id_user_id_pk" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"due_date" date,
	"assignee_id" uuid,
	"contact_id" uuid,
	"company_id" uuid,
	"deal_id" uuid,
	"contact_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"company_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"status" text DEFAULT 'todo' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"repeat" text DEFAULT 'none' NOT NULL,
	"repeat_spawned_id" uuid,
	"reminder_sent_for" date,
	"overdue_sent_for" date,
	"created_by_id" uuid,
	"source_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "team_products" (
	"team_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	CONSTRAINT "team_products_team_id_product_id_pk" PRIMARY KEY("team_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"notes" text DEFAULT '' NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '#4C8DF0' NOT NULL,
	"lead_id" uuid,
	"target" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trash" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"entity_id" text NOT NULL,
	"label" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"file_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deleted_by_id" uuid,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"color" text DEFAULT '#7c5cff' NOT NULL,
	"last_fetch_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"image" text,
	"role" text DEFAULT 'rep' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"invited_by_id" uuid,
	"digest_opt_in" boolean DEFAULT true NOT NULL,
	"timezone" text DEFAULT 'America/Los_Angeles' NOT NULL,
	"last_digest_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "accounting_connections" ADD CONSTRAINT "accounting_connections_connected_by_id_users_id_fk" FOREIGN KEY ("connected_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_snoozes" ADD CONSTRAINT "action_snoozes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_snoozes" ADD CONSTRAINT "action_snoozes_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_by_id_users_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_edited_by_id_users_id_fk" FOREIGN KEY ("edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_items" ADD CONSTRAINT "billing_items_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_items" ADD CONSTRAINT "billing_items_sow_id_sows_id_fk" FOREIGN KEY ("sow_id") REFERENCES "public"."sows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_items" ADD CONSTRAINT "billing_items_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_items" ADD CONSTRAINT "billing_items_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_items" ADD CONSTRAINT "billing_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_items" ADD CONSTRAINT "billing_items_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_pages" ADD CONSTRAINT "booking_pages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_followups" ADD CONSTRAINT "collection_followups_billing_item_id_billing_items_id_fk" FOREIGN KEY ("billing_item_id") REFERENCES "public"."billing_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_followups" ADD CONSTRAINT "collection_followups_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_followups" ADD CONSTRAINT "collection_followups_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_connections" ADD CONSTRAINT "mailbox_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_products" ADD CONSTRAINT "contact_products_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_products" ADD CONSTRAINT "contact_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_suggestions" ADD CONSTRAINT "contact_suggestions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_suggestions" ADD CONSTRAINT "contact_suggestions_mailbox_user_id_users_id_fk" FOREIGN KEY ("mailbox_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content" ADD CONSTRAINT "content_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_links" ADD CONSTRAINT "content_links_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_links" ADD CONSTRAINT "content_links_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_links" ADD CONSTRAINT "content_links_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_views" ADD CONSTRAINT "content_views_link_id_content_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."content_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_payments" ADD CONSTRAINT "deal_payments_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_payments" ADD CONSTRAINT "deal_payments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_enrolled_by_id_users_id_fk" FOREIGN KEY ("enrolled_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_task_comment_id_task_comments_id_fk" FOREIGN KEY ("task_comment_id") REFERENCES "public"."task_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followup_dismissals" ADD CONSTRAINT "followup_dismissals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followup_dismissals" ADD CONSTRAINT "followup_dismissals_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sow_expenses" ADD CONSTRAINT "sow_expenses_sow_id_sows_id_fk" FOREIGN KEY ("sow_id") REFERENCES "public"."sows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sow_expenses" ADD CONSTRAINT "sow_expenses_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sows" ADD CONSTRAINT "sows_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sows" ADD CONSTRAINT "sows_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sows" ADD CONSTRAINT "sows_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_items" ADD CONSTRAINT "story_items_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_items" ADD CONSTRAINT "story_items_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_suggestions" ADD CONSTRAINT "task_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_suggestions" ADD CONSTRAINT "task_suggestions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_suggestions" ADD CONSTRAINT "task_suggestions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_watchers" ADD CONSTRAINT "task_watchers_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_watchers" ADD CONSTRAINT "task_watchers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_products" ADD CONSTRAINT "team_products_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_products" ADD CONSTRAINT "team_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_lead_id_users_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trash" ADD CONSTRAINT "trash_deleted_by_id_users_id_fk" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_calendars" ADD CONSTRAINT "user_calendars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_invoices_ext_uq" ON "accounting_invoices" USING btree ("source","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "activities_external_uq" ON "activities" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "activities_contact_idx" ON "activities" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "activities_at_idx" ON "activities" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "activities_track_uq" ON "activities" USING btree ("track_token");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "billing_deal_idx" ON "billing_items" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "billing_due_idx" ON "billing_items" USING btree ("due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_pages_slug_uq" ON "booking_pages" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "collection_followups_item_idx" ON "collection_followups" USING btree ("billing_item_id");--> statement-breakpoint
CREATE INDEX "comments_entity_idx" ON "comments" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_key_uq" ON "companies" USING btree ("name_key");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_suggestions_email_uq" ON "contact_suggestions" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_client_ref_uq" ON "contacts" USING btree ("client_ref");--> statement-breakpoint
CREATE INDEX "contacts_company_idx" ON "contacts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "contacts_owner_idx" ON "contacts" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_links_token_idx" ON "content_links" USING btree ("token");--> statement-breakpoint
CREATE INDEX "content_views_link_idx" ON "content_views" USING btree ("link_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dashboards_token_idx" ON "dashboards" USING btree ("token");--> statement-breakpoint
CREATE INDEX "deal_payments_deal_idx" ON "deal_payments" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "deals_company_idx" ON "deals" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "email_attachments_activity_idx" ON "email_attachments" USING btree ("activity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_attachments_part_uq" ON "email_attachments" USING btree ("activity_id","part_ref");--> statement-breakpoint
CREATE INDEX "enroll_next_idx" ON "sequence_enrollments" USING btree ("status","next_at");--> statement-breakpoint
CREATE INDEX "files_activity_idx" ON "files" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "files_task_comment_idx" ON "files" USING btree ("task_comment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_email_uq" ON "invites" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_token_uq" ON "invites" USING btree ("token");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "products_name_uq" ON "products" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "push_endpoint_uq" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_number_uq" ON "quotes" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_token_uq" ON "quotes" USING btree ("token");--> statement-breakpoint
CREATE INDEX "quotes_deal_idx" ON "quotes" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "sow_expenses_sow_idx" ON "sow_expenses" USING btree ("sow_id");--> statement-breakpoint
CREATE INDEX "sows_deal_idx" ON "sows" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "story_items_story_idx" ON "story_items" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "task_comments_task_idx" ON "task_comments" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "task_suggestions_key_uq" ON "task_suggestions" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_source_key_uq" ON "tasks" USING btree ("source_key");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_name_uq" ON "teams" USING btree ("name");--> statement-breakpoint
CREATE INDEX "trash_deleted_idx" ON "trash" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");
--> statement-breakpoint
-- Starter email templates (edit or delete them in the app)
INSERT INTO "email_templates" ("name", "subject", "body", "sort_order") VALUES
('Thanks for visiting', 'Great meeting you at our booth, {first}', 'Hi {first},

Thank you for stopping by our booth. It was great to hear what {company} is working on.

I''d like to keep the conversation going. Would you have 30 minutes next week for a short call so we can look at where we could help your team?

Best regards,
{me}
{mycompany}', 10),
('Send brochure', '{mycompany} overview for {company}', 'Hi {first},

Thanks again for your time at the booth. As promised, I''ve attached our product overview.

If you let me know which areas matter most for {company}, I can put together a focused walkthrough for your team.

Best regards,
{me}
{mycompany}', 20),
('Send price list', 'Pricing information, as discussed', 'Hi {first},

Following up on our conversation at the booth, please find our pricing information attached.

Pricing depends on scope, so I''m happy to walk through options that fit {company}. Would a short call this week or next work for you?

Best regards,
{me}
{mycompany}', 30),
('Schedule a meeting', 'Finding time to continue our conversation', 'Hi {first},

It was good to connect at the booth. Could we set up a 30 minute call to go deeper on what {company} needs?

A few times that work on my side:
- 
- 
- 

If none of those suit you, send over a time that does and I''ll make it work.

Best regards,
{me}
{mycompany}', 40),
('Second follow-up', 'Quick follow-up, {first}', 'Hi {first},

I wanted to follow up on my earlier note in case it got buried after the show. Is exploring this still a priority for {company} this quarter?

Happy to send a short summary instead of a call if that''s easier.

Best regards,
{me}
{mycompany}', 50);
