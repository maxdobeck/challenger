CREATE TABLE "scan_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"scan_event_id" integer,
	"user_id" text NOT NULL,
	"ai_config_key" text NOT NULL,
	"kind" text NOT NULL,
	"comment" text,
	"corrected_crit" integer,
	"corrected_kill" integer,
	"corrected_tac" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scan_event" ADD COLUMN "resumption_token" text;--> statement-breakpoint
ALTER TABLE "scan_feedback" ADD CONSTRAINT "scan_feedback_scan_event_id_scan_event_id_fk" FOREIGN KEY ("scan_event_id") REFERENCES "public"."scan_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_feedback" ADD CONSTRAINT "scan_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;