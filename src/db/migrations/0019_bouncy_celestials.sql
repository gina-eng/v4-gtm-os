DROP INDEX "idx_realizado_funil_unique";--> statement-breakpoint
ALTER TABLE "realizado_funil" ADD COLUMN "dia" date NOT NULL;--> statement-breakpoint
ALTER TABLE "realizado_funil" ADD COLUMN "categoria" varchar(60) DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_realizado_funil_org_dia" ON "realizado_funil" USING btree ("organization_id","dia");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_realizado_funil_unique" ON "realizado_funil" USING btree ("organization_id","dia","subcanal","tier","categoria");