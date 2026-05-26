CREATE TABLE "unit_setups" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"completed_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"horizontes" jsonb,
	"time_comercial" jsonb,
	"metricas_operacionais" jsonb,
	"tiers_cliente" jsonb,
	"receita_produto" jsonb,
	"dist_mercado" jsonb,
	"investimento_midia" jsonb,
	"conversoes_inbound" jsonb,
	"conversoes_outbound" jsonb,
	"mix_subcanais" jsonb,
	"realizado_historico" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "unit_setups" ADD CONSTRAINT "unit_setups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;