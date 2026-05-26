ALTER TABLE "memberships" ALTER COLUMN "organization_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "regional" varchar(30);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "socio_executivo_nome" varchar(120);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "socio_executivo_email" varchar(255);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "regional" varchar(30);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "estado" varchar(60);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "cidade" varchar(120);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "telefone" varchar(30);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "data_inicio" date;--> statement-breakpoint
CREATE INDEX "idx_memberships_regional" ON "memberships" USING btree ("regional","status");--> statement-breakpoint
CREATE INDEX "idx_organizations_regional" ON "organizations" USING btree ("regional");--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_regional_unique" UNIQUE("user_id","regional");