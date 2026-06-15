-- Renomeia a tabela física `organizations` -> `unidades` (preserva os dados).
-- O símbolo Drizzle segue `organizations` e as FKs seguem `organization_id`;
-- só a tabela e seus índices/constraints foram renomeados.
ALTER TABLE "organizations" RENAME TO "unidades";--> statement-breakpoint

-- `socio_executivo_nome` vira `franqueado` (mantém o conteúdo já cadastrado).
ALTER TABLE "unidades" RENAME COLUMN "socio_executivo_nome" TO "franqueado";--> statement-breakpoint

-- Novas colunas (nullable; Matriz e linhas existentes ficam NULL).
ALTER TABLE "unidades" ADD COLUMN "id_tenant" varchar(120);--> statement-breakpoint
ALTER TABLE "unidades" ADD COLUMN "cnpj" varchar(18);--> statement-breakpoint

-- Campos descontinuados.
ALTER TABLE "unidades" DROP COLUMN "socio_executivo_email";--> statement-breakpoint
ALTER TABLE "unidades" DROP COLUMN "estado";--> statement-breakpoint
ALTER TABLE "unidades" DROP COLUMN "cidade";--> statement-breakpoint
ALTER TABLE "unidades" DROP COLUMN "telefone";--> statement-breakpoint

-- Índices: renomeia para o novo nome físico da tabela.
ALTER INDEX "idx_organizations_single_matriz" RENAME TO "idx_unidades_single_matriz";--> statement-breakpoint
ALTER INDEX "idx_organizations_parent" RENAME TO "idx_unidades_parent";--> statement-breakpoint
ALTER INDEX "idx_organizations_type_status" RENAME TO "idx_unidades_type_status";--> statement-breakpoint
ALTER INDEX "idx_organizations_regional" RENAME TO "idx_unidades_regional";--> statement-breakpoint

-- Constraints derivados pelo Drizzle a partir do nome da tabela (FKs + unique do slug).
ALTER TABLE "unidades" RENAME CONSTRAINT "organizations_parent_id_organizations_id_fk" TO "unidades_parent_id_unidades_id_fk";--> statement-breakpoint
ALTER TABLE "unidades" RENAME CONSTRAINT "organizations_slug_unique" TO "unidades_slug_unique";--> statement-breakpoint
ALTER TABLE "users" RENAME CONSTRAINT "users_active_organization_id_organizations_id_fk" TO "users_active_organization_id_unidades_id_fk";--> statement-breakpoint
ALTER TABLE "memberships" RENAME CONSTRAINT "memberships_organization_id_organizations_id_fk" TO "memberships_organization_id_unidades_id_fk";--> statement-breakpoint
ALTER TABLE "audit_log" RENAME CONSTRAINT "audit_log_organization_id_organizations_id_fk" TO "audit_log_organization_id_unidades_id_fk";--> statement-breakpoint
ALTER TABLE "unit_setups" RENAME CONSTRAINT "unit_setups_organization_id_organizations_id_fk" TO "unit_setups_organization_id_unidades_id_fk";--> statement-breakpoint
ALTER TABLE "realizado_funil" RENAME CONSTRAINT "realizado_funil_organization_id_organizations_id_fk" TO "realizado_funil_organization_id_unidades_id_fk";--> statement-breakpoint

-- Índice novo do id_tenant.
CREATE INDEX "idx_unidades_id_tenant" ON "unidades" USING btree ("id_tenant");