/**
 * Schema do banco V4 OS — Drizzle ORM
 *
 * Após alterar este arquivo:
 *   npm run db:generate    → produz SQL diff em src/db/migrations/
 *   npm run db:migrate     → aplica no banco (precisa de DATABASE_URL_DIRECT)
 *
 * Sub-fases:
 * - F1.1: organizations, audit_log
 * - F1.MOCK+F1.3 (atual): users, sessions, memberships
 */

import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  uuid,
  varchar,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
  unique,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// ============================================================
// Enums
// ============================================================

export const orgTypeEnum = pgEnum("org_type", ["matriz", "unidade"]);
export const orgStatusEnum = pgEnum("org_status", ["active", "inactive", "pending"]);
export const horizonteEnum = pgEnum("horizonte", ["H1", "H2", "H3", "H4", "H5"]);

export const userStatusEnum = pgEnum("user_status", ["pending", "active", "inactive"]);
export const roleEnum = pgEnum("role", ["admin", "gerente", "coordenador"]);
export const membershipStatusEnum = pgEnum("membership_status", ["active", "inactive"]);

// ============================================================
// organizations — F1.1
// ============================================================

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: orgTypeEnum("type").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => organizations.id),
    slug: varchar("slug", { length: 60 }).notNull().unique(),
    name: varchar("name", { length: 120 }).notNull(),
    status: orgStatusEnum("status").notNull().default("active"),
    horizonteAtual: horizonteEnum("horizonte_atual").notNull().default("H1"),
    socioExecutivoNome: varchar("socio_executivo_nome", { length: 120 }),
    socioExecutivoEmail: varchar("socio_executivo_email", { length: 255 }),
    regional: varchar("regional", { length: 30 }),
    estado: varchar("estado", { length: 60 }),
    cidade: varchar("cidade", { length: 120 }),
    telefone: varchar("telefone", { length: 30 }),
    dataInicio: date("data_inicio"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_organizations_single_matriz")
      .on(table.type)
      .where(sql`${table.type} = 'matriz'`),
    index("idx_organizations_parent").on(table.parentId),
    index("idx_organizations_type_status").on(table.type, table.status),
    index("idx_organizations_regional").on(table.regional),
  ],
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

// ============================================================
// users — F1.MOCK (schema completo, mas só name/email/status são usados em dev)
// ============================================================

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 120 }).notNull(),
    /** Preenchido pela auth real (adendo) — em dev fica NULL. */
    passwordHash: varchar("password_hash", { length: 255 }),
    status: userStatusEnum("status").notNull().default("active"),
    activeOrganizationId: uuid("active_organization_id").references(() => organizations.id),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    /** Auth real (adendo): token de ativação por email. */
    activationToken: varchar("activation_token", { length: 255 }),
    activationExpiresAt: timestamp("activation_expires_at", { withTimezone: true }),
    resetToken: varchar("reset_token", { length: 255 }),
    resetExpiresAt: timestamp("reset_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_users_email_lower").on(sql`LOWER(${table.email})`),
    index("idx_users_active_org").on(table.activeOrganizationId),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// ============================================================
// sessions — F1.MOCK (criada mas vazia até auth real entrar)
// ============================================================

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 255 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    ip: varchar("ip", { length: 45 }),
    userAgent: varchar("user_agent", { length: 255 }),
  },
  (table) => [
    index("idx_sessions_token").on(table.token),
    index("idx_sessions_user").on(table.userId, table.expiresAt),
  ],
);

export type Session = typeof sessions.$inferSelect;

// ============================================================
// memberships — F1.3
// ============================================================

/**
 * Memberships podem ser de dois escopos (mutuamente exclusivos):
 * - **Por unidade**: `organizationId` setado, `regional` NULL → acesso a 1 org.
 * - **Por regional**: `regional` setado, `organizationId` NULL → acesso a todas
 *   as unidades (type='unidade') com `organizations.regional = membership.regional`.
 *   Funciona como "delegação regional" feita pela Matriz.
 *
 * A regra "exatamente um dos dois preenchido" é enforced no código (repository
 * + validation schema). No banco, fica como CHECK constraint quando migrar.
 */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    regional: varchar("regional", { length: 30 }),
    role: roleEnum("role").notNull(),
    status: membershipStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("memberships_user_org_unique").on(table.userId, table.organizationId),
    unique("memberships_user_regional_unique").on(table.userId, table.regional),
    index("idx_memberships_user").on(table.userId, table.status),
    index("idx_memberships_org").on(table.organizationId, table.status),
    index("idx_memberships_regional").on(table.regional, table.status),
  ],
);

export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;

// ============================================================
// audit_log — F1.1
// ============================================================

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    organizationId: uuid("organization_id").references(() => organizations.id),
    action: varchar("action", { length: 60 }).notNull(),
    entity: varchar("entity", { length: 60 }),
    entityId: uuid("entity_id"),
    changes: jsonb("changes"),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    ip: varchar("ip", { length: 45 }),
    userAgent: varchar("user_agent", { length: 255 }),
  },
  (table) => [
    index("idx_audit_log_ts").on(table.ts.desc()),
    index("idx_audit_log_actor").on(table.actorUserId, table.ts.desc()),
    index("idx_audit_log_org").on(table.organizationId, table.ts.desc()),
    index("idx_audit_log_entity").on(table.entity, table.entityId),
  ],
);

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;

// ============================================================
// unit_setups — Fase 1B (Wizard /iniciar)
// ============================================================

/**
 * Uma linha por organization. Cada step é uma coluna jsonb nullable:
 * se a unidade ainda não personalizou, o campo é NULL e o app cai pro
 * default da Matriz (definido em src/lib/premissas/matriz-defaults.ts).
 *
 * `completedSteps` é jsonb (array de strings) — simples de manipular sem
 * lidar com o tipo `text[]` do PG no client.
 */
export const unitSetups = pgTable("unit_setups", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  completedSteps: jsonb("completed_steps").$type<string[]>().notNull().default([]),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  horizontes: jsonb("horizontes"),
  timeComercial: jsonb("time_comercial"),
  metricasOperacionais: jsonb("metricas_operacionais"),
  tiersCliente: jsonb("tiers_cliente"),
  receitaProduto: jsonb("receita_produto"),
  distMercado: jsonb("dist_mercado"),
  investimentoMidia: jsonb("investimento_midia"),
  conversoesInbound: jsonb("conversoes_inbound"),
  conversoesOutbound: jsonb("conversoes_outbound"),
  mixSubcanais: jsonb("mix_subcanais"),
  realizadoHistorico: jsonb("realizado_historico"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UnitSetupRow = typeof unitSetups.$inferSelect;
export type NewUnitSetupRow = typeof unitSetups.$inferInsert;
