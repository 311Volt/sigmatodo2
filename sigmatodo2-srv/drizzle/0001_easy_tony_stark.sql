ALTER TABLE "invitations" ADD COLUMN "invitation_code" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "invitation_for" text;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitation_for_users_handle_fk" FOREIGN KEY ("invitation_for") REFERENCES "public"."users"("handle") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitation_code_unique" UNIQUE("invitation_code");