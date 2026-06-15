CREATE TABLE "realizado_import_lead" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"id_tenant" varchar(120),
	"franqueado" varchar(120),
	"tier_lead" varchar(40),
	"tier_venda" varchar(40),
	"canal_aquisicao" varchar(60),
	"canal_origem" varchar(60),
	"categoria_produto" varchar(60),
	"dt_cadastro_lead" date,
	"dt_rm" date,
	"dt_rr" date,
	"dt_venda" date,
	"leads" integer DEFAULT 0 NOT NULL,
	"mql" integer DEFAULT 0 NOT NULL,
	"rm" integer DEFAULT 0 NOT NULL,
	"rr" integer DEFAULT 0 NOT NULL,
	"won" integer DEFAULT 0 NOT NULL,
	"revenue_won" double precision DEFAULT 0 NOT NULL,
	"media_investment" double precision DEFAULT 0 NOT NULL,
	"load_batch" varchar(60) NOT NULL,
	"loaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "realizado_import_lead" ADD CONSTRAINT "realizado_import_lead_organization_id_unidades_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."unidades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_realizado_import_org" ON "realizado_import_lead" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_realizado_import_tenant" ON "realizado_import_lead" USING btree ("id_tenant");--> statement-breakpoint
CREATE INDEX "idx_realizado_import_batch" ON "realizado_import_lead" USING btree ("load_batch");--> statement-breakpoint
CREATE INDEX "idx_realizado_import_dt_venda" ON "realizado_import_lead" USING btree ("dt_venda");--> statement-breakpoint
CREATE INDEX "idx_realizado_import_dt_cadastro" ON "realizado_import_lead" USING btree ("dt_cadastro_lead");