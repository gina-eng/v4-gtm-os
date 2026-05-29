CREATE TABLE "realizado_funil" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"mes" varchar(7) NOT NULL,
	"subcanal" varchar(40) NOT NULL,
	"tier" "tier" NOT NULL,
	"leads" double precision DEFAULT 0 NOT NULL,
	"mql" double precision DEFAULT 0 NOT NULL,
	"sql" double precision DEFAULT 0 NOT NULL,
	"sal" double precision DEFAULT 0 NOT NULL,
	"won" double precision DEFAULT 0 NOT NULL,
	"faturamento" double precision DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "realizado_funil" ADD CONSTRAINT "realizado_funil_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_realizado_funil_unique" ON "realizado_funil" USING btree ("organization_id","mes","subcanal","tier");--> statement-breakpoint
CREATE INDEX "idx_realizado_funil_org_mes" ON "realizado_funil" USING btree ("organization_id","mes");