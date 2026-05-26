ALTER TABLE "premissa_cargo" ALTER COLUMN "cargo" SET DATA TYPE varchar(60) USING "cargo"::text;--> statement-breakpoint
ALTER TABLE "premissa_time_comercial" ALTER COLUMN "cargo" SET DATA TYPE varchar(60) USING "cargo"::text;--> statement-breakpoint
DROP TYPE "public"."cargo_comercial";