CREATE TABLE "scan_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "player1_primary_op_choice" text;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "player2_primary_op_choice" text;--> statement-breakpoint
ALTER TABLE "scan_event" ADD CONSTRAINT "scan_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;