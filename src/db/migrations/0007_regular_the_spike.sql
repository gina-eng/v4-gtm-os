CREATE TABLE "premissa_pct_producao_mes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"premissa_id" uuid NOT NULL,
	"mes" varchar(7) NOT NULL,
	"pct_producao" double precision NOT NULL
);
--> statement-breakpoint
ALTER TABLE "premissa_pct_producao_mes" ADD CONSTRAINT "premissa_pct_producao_mes_premissa_id_premissas_id_fk" FOREIGN KEY ("premissa_id") REFERENCES "public"."premissas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_prem_pct_prod_mes_unique" ON "premissa_pct_producao_mes" USING btree ("premissa_id","mes");