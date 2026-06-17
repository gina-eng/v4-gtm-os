CREATE TABLE "realizado_import_investimento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id_tenant" varchar(120),
	"data" date,
	"lb" double precision DEFAULT 0 NOT NULL,
	"db" double precision DEFAULT 0 NOT NULL,
	"mb" double precision DEFAULT 0 NOT NULL,
	"bb" double precision DEFAULT 0 NOT NULL,
	"loaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_realizado_invest_tenant" ON "realizado_import_investimento" USING btree ("id_tenant");--> statement-breakpoint
CREATE INDEX "idx_realizado_invest_data" ON "realizado_import_investimento" USING btree ("data");