CREATE TYPE "public"."canal_inbound" AS ENUM('lead_broker', 'black_box');--> statement-breakpoint
CREATE TYPE "public"."cargo_comercial" AS ENUM('LDR', 'BDR', 'SDR', 'CLOSER', 'KAM');--> statement-breakpoint
CREATE TYPE "public"."subcanal_outbound" AS ENUM('indicacao', 'eventos', 'recovery', 'recomendacao', 'prospeccao');--> statement-breakpoint
CREATE TYPE "public"."tier" AS ENUM('Tiny', 'Small', 'Medium', 'Large', 'Enterprise');--> statement-breakpoint
CREATE TABLE "premissa_cargo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"premissa_id" uuid NOT NULL,
	"cargo" "cargo_comercial" NOT NULL,
	"wip_limit" integer NOT NULL,
	"contratacao" integer NOT NULL,
	"onboarding" integer NOT NULL,
	"rampagem" integer NOT NULL,
	"atingimento_mes" integer NOT NULL,
	"permanencia" integer NOT NULL,
	"turnover_mes_pct" double precision NOT NULL,
	"ligacoes_mes" integer NOT NULL,
	"conexao_pct" double precision NOT NULL,
	"extra" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "premissa_conversao_inbound" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"premissa_id" uuid NOT NULL,
	"canal" "canal_inbound" NOT NULL,
	"tier" "tier" NOT NULL,
	"cr1" double precision NOT NULL,
	"cr2" double precision NOT NULL,
	"cr3" double precision NOT NULL,
	"cr4" double precision NOT NULL,
	"cr5" double precision NOT NULL,
	"cr6" double precision NOT NULL,
	"cr7" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "premissa_conversao_outbound" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"premissa_id" uuid NOT NULL,
	"subcanal" "subcanal_outbound" NOT NULL,
	"tier" "tier" NOT NULL,
	"cr1" double precision NOT NULL,
	"cr3" double precision NOT NULL,
	"cr4" double precision NOT NULL,
	"cr6" double precision NOT NULL,
	"cr7" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "premissa_horizonte" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"premissa_id" uuid NOT NULL,
	"h" "horizonte" NOT NULL,
	"faixa_min" double precision NOT NULL,
	"faixa_max" double precision,
	"tempo_max_meses" integer,
	"cresc_mensal_pct" double precision NOT NULL,
	"pct_producao" double precision NOT NULL,
	"split_lb" double precision NOT NULL,
	"split_bb" double precision NOT NULL,
	"bb_piso" double precision NOT NULL,
	"regra" text DEFAULT '' NOT NULL,
	"mix_indicacao" double precision NOT NULL,
	"mix_eventos" double precision NOT NULL,
	"mix_recovery" double precision NOT NULL,
	"mix_recomendacao" double precision NOT NULL,
	"mix_prospeccao" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "premissa_meeting_broker" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"premissa_id" uuid NOT NULL,
	"custo_sql" double precision NOT NULL,
	"cr3" double precision NOT NULL,
	"cr4" double precision NOT NULL,
	"meta" text DEFAULT '' NOT NULL,
	"pipeline" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "premissa_tier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"premissa_id" uuid NOT NULL,
	"tier" "tier" NOT NULL,
	"faturamento_min" double precision NOT NULL,
	"faturamento_max" double precision,
	"tcv_booking" double precision NOT NULL,
	"tcv_prod_com" double precision NOT NULL,
	"cpl_lb" double precision NOT NULL,
	"cpl_bb" double precision NOT NULL,
	"saber_pct" double precision NOT NULL,
	"saber_at" double precision NOT NULL,
	"ter_pct" double precision NOT NULL,
	"ter_at" double precision NOT NULL,
	"exec_pct" double precision NOT NULL,
	"exec_at" double precision NOT NULL,
	"pct_mercado" double precision NOT NULL,
	"entra_horizonte" "horizonte" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "premissa_time_comercial" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"premissa_id" uuid NOT NULL,
	"ord" integer DEFAULT 0 NOT NULL,
	"email" varchar(255) DEFAULT '' NOT NULL,
	"cargo" "cargo_comercial" NOT NULL,
	"salario" double precision NOT NULL,
	"comissao_pct" double precision NOT NULL,
	"capacidade_pct" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "premissas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entidade_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "premissa_cargo" ADD CONSTRAINT "premissa_cargo_premissa_id_premissas_id_fk" FOREIGN KEY ("premissa_id") REFERENCES "public"."premissas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premissa_conversao_inbound" ADD CONSTRAINT "premissa_conversao_inbound_premissa_id_premissas_id_fk" FOREIGN KEY ("premissa_id") REFERENCES "public"."premissas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premissa_conversao_outbound" ADD CONSTRAINT "premissa_conversao_outbound_premissa_id_premissas_id_fk" FOREIGN KEY ("premissa_id") REFERENCES "public"."premissas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premissa_horizonte" ADD CONSTRAINT "premissa_horizonte_premissa_id_premissas_id_fk" FOREIGN KEY ("premissa_id") REFERENCES "public"."premissas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premissa_meeting_broker" ADD CONSTRAINT "premissa_meeting_broker_premissa_id_premissas_id_fk" FOREIGN KEY ("premissa_id") REFERENCES "public"."premissas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premissa_tier" ADD CONSTRAINT "premissa_tier_premissa_id_premissas_id_fk" FOREIGN KEY ("premissa_id") REFERENCES "public"."premissas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premissa_time_comercial" ADD CONSTRAINT "premissa_time_comercial_premissa_id_premissas_id_fk" FOREIGN KEY ("premissa_id") REFERENCES "public"."premissas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_prem_cargo_unique" ON "premissa_cargo" USING btree ("premissa_id","cargo");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_prem_conv_inbound_unique" ON "premissa_conversao_inbound" USING btree ("premissa_id","canal","tier");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_prem_conv_outbound_unique" ON "premissa_conversao_outbound" USING btree ("premissa_id","subcanal","tier");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_prem_horizonte_unique" ON "premissa_horizonte" USING btree ("premissa_id","h");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_prem_meeting_broker_unique" ON "premissa_meeting_broker" USING btree ("premissa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_prem_tier_unique" ON "premissa_tier" USING btree ("premissa_id","tier");--> statement-breakpoint
CREATE INDEX "idx_prem_time_comercial_premissa" ON "premissa_time_comercial" USING btree ("premissa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_premissas_entidade" ON "premissas" USING btree ("entidade_id");