CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_code" text NOT NULL,
	"filename" text NOT NULL,
	"path" text NOT NULL,
	"uploaded_on" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_code" text NOT NULL,
	"posted_by" text NOT NULL,
	"posted_on" timestamp DEFAULT now() NOT NULL,
	"edited_on" timestamp,
	"content" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_code" text NOT NULL,
	"email" text NOT NULL,
	"invited_by" text NOT NULL,
	"created_on" timestamp DEFAULT now() NOT NULL,
	"accepted_on" timestamp,
	"permissions" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_sequences" (
	"project_code" text PRIMARY KEY NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"code" text PRIMARY KEY NOT NULL,
	"project_code" text NOT NULL,
	"assigned_to" text,
	"created_by" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"created_on" timestamp DEFAULT now() NOT NULL,
	"updated_on" timestamp DEFAULT now() NOT NULL,
	"due_by" timestamp with time zone,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"markdown_description" text,
	"comment_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_users" (
	"user_handle" text NOT NULL,
	"project_code" text NOT NULL,
	"permissions" jsonb NOT NULL,
	CONSTRAINT "project_users_user_handle_project_code_pk" PRIMARY KEY("user_handle","project_code")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"code" text PRIMARY KEY NOT NULL,
	"created_on" timestamp DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"background_img_path" text,
	"description" text,
	"status_definitions" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"handle" text PRIMARY KEY NOT NULL,
	"created_on" timestamp DEFAULT now() NOT NULL,
	"display_name" text NOT NULL,
	"avatar_path" text,
	"bio" text,
	"email" text,
	"password_hash" text,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_issue_code_issues_code_fk" FOREIGN KEY ("issue_code") REFERENCES "public"."issues"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_issue_code_issues_code_fk" FOREIGN KEY ("issue_code") REFERENCES "public"."issues"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_posted_by_users_handle_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("handle") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_project_code_projects_code_fk" FOREIGN KEY ("project_code") REFERENCES "public"."projects"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_handle_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("handle") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sequences" ADD CONSTRAINT "issue_sequences_project_code_projects_code_fk" FOREIGN KEY ("project_code") REFERENCES "public"."projects"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_project_code_projects_code_fk" FOREIGN KEY ("project_code") REFERENCES "public"."projects"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_assigned_to_users_handle_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("handle") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_created_by_users_handle_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("handle") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_users" ADD CONSTRAINT "project_users_user_handle_users_handle_fk" FOREIGN KEY ("user_handle") REFERENCES "public"."users"("handle") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_users" ADD CONSTRAINT "project_users_project_code_projects_code_fk" FOREIGN KEY ("project_code") REFERENCES "public"."projects"("code") ON DELETE cascade ON UPDATE no action;