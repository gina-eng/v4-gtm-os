CREATE TABLE "premissa_dist_split" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"premissa_id" uuid NOT NULL,
	"h" "horizonte" NOT NULL,
	"tier" "tier" NOT NULL,
	"pct" double precision NOT NULL
);
--> statement-breakpoint
ALTER TABLE "premissa_dist_split" ADD CONSTRAINT "premissa_dist_split_premissa_id_premissas_id_fk" FOREIGN KEY ("premissa_id") REFERENCES "public"."premissas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_prem_dist_split_unique" ON "premissa_dist_split" USING btree ("premissa_id","h","tier");