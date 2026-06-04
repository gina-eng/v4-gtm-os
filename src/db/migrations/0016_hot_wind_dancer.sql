CREATE TYPE "public"."subcanal_midia" AS ENUM('lead_broker', 'black_box', 'meeting_broker', 'eventos', 'out_indicacao', 'out_recovery', 'out_recomendacao', 'out_prospeccao');--> statement-breakpoint
CREATE TABLE "premissa_override_subcanal_mes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"premissa_id" uuid NOT NULL,
	"mes" varchar(7) NOT NULL,
	"subcanal" "subcanal_midia" NOT NULL,
	"valor" double precision NOT NULL
);
--> statement-breakpoint
ALTER TABLE "premissa_override_subcanal_mes" ADD CONSTRAINT "premissa_override_subcanal_mes_premissa_id_premissas_id_fk" FOREIGN KEY ("premissa_id") REFERENCES "public"."premissas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_prem_override_subcanal_mes_unique" ON "premissa_override_subcanal_mes" USING btree ("premissa_id","mes","subcanal");