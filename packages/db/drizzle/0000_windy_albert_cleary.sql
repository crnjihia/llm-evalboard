CREATE TABLE "system_health" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
