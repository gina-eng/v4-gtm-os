CREATE TABLE "premissa_conversao_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"premissa_id" uuid NOT NULL,
	"tier" "tier" NOT NULL,
	"cr3" double precision NOT NULL,
	"cr4" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "premissa_eventos_custo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"premissa_id" uuid NOT NULL,
	"custo_sql" double precision DEFAULT 5000 NOT NULL,
	"meta" text DEFAULT '' NOT NULL,
	"pipeline" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "premissa_horizonte" ADD COLUMN "split_ev" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "premissa_conversao_eventos" ADD CONSTRAINT "premissa_conversao_eventos_premissa_id_premissas_id_fk" FOREIGN KEY ("premissa_id") REFERENCES "public"."premissas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premissa_eventos_custo" ADD CONSTRAINT "premissa_eventos_custo_premissa_id_premissas_id_fk" FOREIGN KEY ("premissa_id") REFERENCES "public"."premissas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_prem_conv_eventos_unique" ON "premissa_conversao_eventos" USING btree ("premissa_id","tier");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_prem_eventos_custo_unique" ON "premissa_eventos_custo" USING btree ("premissa_id");