CREATE TYPE "public"."horizonte" AS ENUM('H1', 'H2', 'H3', 'H4', 'H5');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('active', 'inactive', 'pending');--> statement-breakpoint
CREATE TYPE "public"."org_type" AS ENUM('matriz', 'unidade');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"organization_id" uuid,
	"action" varchar(60) NOT NULL,
	"entity" varchar(60),
	"entity_id" uuid,
	"changes" jsonb,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" varchar(45),
	"user_agent" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "org_type" NOT NULL,
	"parent_id" uuid,
	"slug" varchar(60) NOT NULL,
	"name" varchar(120) NOT NULL,
	"status" "org_status" DEFAULT 'active' NOT NULL,
	"horizonte_atual" "horizonte" DEFAULT 'H1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_parent_id_organizations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_log_ts" ON "audit_log" USING btree ("ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_audit_log_actor" ON "audit_log" USING btree ("actor_user_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_audit_log_org" ON "audit_log" USING btree ("organization_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_audit_log_entity" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_organizations_single_matriz" ON "organizations" USING btree ("type") WHERE "organizations"."type" = 'matriz';--> statement-breakpoint
CREATE INDEX "idx_organizations_parent" ON "organizations" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_organizations_type_status" ON "organizations" USING btree ("type","status");