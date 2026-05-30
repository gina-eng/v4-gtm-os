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
  text,
  timestamp,
  date,
  jsonb,
  integer,
  doublePrecision,
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

// Dimensões das premissas (Fase 2 — tabelas normalizadas)
export const tierEnum = pgEnum("tier", ["Tiny", "Small", "Medium", "Large", "Enterprise"]);
// `cargo` NÃO é enum: a unidade/matriz pode cadastrar cargos customizados além
// dos 5 principais (LDR/BDR/SDR/CLOSER/KAM). Fica como varchar livre.
export const canalInboundEnum = pgEnum("canal_inbound", ["lead_broker", "black_box"]);
export const subcanalOutboundEnum = pgEnum("subcanal_outbound", [
  "indicacao",
  "eventos",
  "recovery",
  "recomendacao",
  "prospeccao",
]);

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

// ============================================================
// premissas — Fase 2 (premissas normalizadas)
//
// 1 linha por entidade (matriz OU unidade) na `premissas`; cada bloco de
// premissa vira uma tabela-filha onde CADA métrica é coluna e cada item de
// dimensão (tier, horizonte, cargo, canal, subcanal) é uma linha. Substitui
// as colunas jsonb de `unit_setups` (que ficam só com realizado + progresso).
//
// `entidade_id` é o id da organization (matriz ou unidade) — referência SOLTA
// (sem FK), só indexada/UNIQUE, pra cruzar com `organizations` sem amarrar.
// ============================================================

export const premissas = pgTable(
  "premissas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entidadeId: uuid("entidade_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("idx_premissas_entidade").on(table.entidadeId)],
);

export type PremissasRow = typeof premissas.$inferSelect;
export type NewPremissasRow = typeof premissas.$inferInsert;

// Time Comercial — grão: pessoa (N membros). Sem unique por cargo: pode haver
// 2 SDRs. Métricas do cargo (P17) ficam em `premissa_cargo`, à parte.
export const premissaTimeComercial = pgTable(
  "premissa_time_comercial",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    premissaId: uuid("premissa_id")
      .notNull()
      .references(() => premissas.id, { onDelete: "cascade" }),
    ord: integer("ord").notNull().default(0),
    email: varchar("email", { length: 255 }).notNull().default(""),
    cargo: varchar("cargo", { length: 60 }).notNull(),
    salario: doublePrecision("salario").notNull(),
    comissaoPct: doublePrecision("comissao_pct").notNull(),
    capacidadePct: integer("capacidade_pct").notNull(),
  },
  (table) => [index("idx_prem_time_comercial_premissa").on(table.premissaId)],
);

// P17 — Capacidade Operacional. Grão: cargo (5 cargos).
export const premissaCargo = pgTable(
  "premissa_cargo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    premissaId: uuid("premissa_id")
      .notNull()
      .references(() => premissas.id, { onDelete: "cascade" }),
    cargo: varchar("cargo", { length: 60 }).notNull(),
    wipLimit: integer("wip_limit").notNull(),
    contratacao: integer("contratacao").notNull(),
    onboarding: integer("onboarding").notNull(),
    rampagem: integer("rampagem").notNull(),
    atingimentoMes: integer("atingimento_mes").notNull(),
    permanencia: integer("permanencia").notNull(),
    turnoverMesPct: doublePrecision("turnover_mes_pct").notNull(),
    ligacoesMes: integer("ligacoes_mes").notNull(),
    conexaoPct: doublePrecision("conexao_pct").notNull(),
  },
  (table) => [uniqueIndex("idx_prem_cargo_unique").on(table.premissaId, table.cargo)],
);

// P1 (Horizontes) + P6 (Investimento Mídia) + P16 (Mix Subcanais). Grão: horizonte (5).
export const premissaHorizonte = pgTable(
  "premissa_horizonte",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    premissaId: uuid("premissa_id")
      .notNull()
      .references(() => premissas.id, { onDelete: "cascade" }),
    h: horizonteEnum("h").notNull(),
    // P1 — Horizontes de Crescimento
    faixaMin: doublePrecision("faixa_min").notNull(),
    faixaMax: doublePrecision("faixa_max"),
    tempoMaxMeses: integer("tempo_max_meses"),
    crescMensalPct: doublePrecision("cresc_mensal_pct").notNull(),
    // P6 — Investimento em Mídia
    pctProducao: doublePrecision("pct_producao").notNull(),
    splitLb: doublePrecision("split_lb").notNull(),
    splitBb: doublePrecision("split_bb").notNull(),
    splitMt: doublePrecision("split_mt").notNull().default(0),
    bbPiso: doublePrecision("bb_piso").notNull(),
    regra: text("regra").notNull().default(""),
    // P16 — Mix Subcanais Outbound (% por horizonte)
    mixIndicacao: doublePrecision("mix_indicacao").notNull(),
    mixRecovery: doublePrecision("mix_recovery").notNull(),
    mixRecomendacao: doublePrecision("mix_recomendacao").notNull(),
    mixProspeccao: doublePrecision("mix_prospeccao").notNull(),
  },
  (table) => [uniqueIndex("idx_prem_horizonte_unique").on(table.premissaId, table.h)],
);

// P2 (Tiers) + P3 (Receita/Produto) + P4 (Distribuição). Grão: tier (5).
export const premissaTier = pgTable(
  "premissa_tier",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    premissaId: uuid("premissa_id")
      .notNull()
      .references(() => premissas.id, { onDelete: "cascade" }),
    tier: tierEnum("tier").notNull(),
    // P2 — Tiers de Cliente
    faturamentoMin: doublePrecision("faturamento_min").notNull(),
    faturamentoMax: doublePrecision("faturamento_max"),
    tcvBooking: doublePrecision("tcv_booking").notNull(),
    cplLb: doublePrecision("cpl_lb").notNull(),
    cplBb: doublePrecision("cpl_bb").notNull(),
    cpmqlMt: doublePrecision("cpmql_mt").notNull().default(5000),
    // P3 — Receita por Produto/Tier
    saberPct: doublePrecision("saber_pct").notNull(),
    saberAt: doublePrecision("saber_at").notNull(),
    terPct: doublePrecision("ter_pct").notNull(),
    terAt: doublePrecision("ter_at").notNull(),
    execPct: doublePrecision("exec_pct").notNull(),
    execAt: doublePrecision("exec_at").notNull(),
    // P4 — Distribuição de Leads por Tier
    pctMercado: doublePrecision("pct_mercado").notNull(),
    entraHorizonte: horizonteEnum("entra_horizonte").notNull(),
  },
  (table) => [uniqueIndex("idx_prem_tier_unique").on(table.premissaId, table.tier)],
);

// P6 — Override do investimento em mídia (R$), mês a mês (2026). Grão: mês
// (até 12 linhas por unidade). Quando ausente, o cálculo usa o pctProducao do
// horizonte atual em premissa_horizonte como fallback (target × pct). O input
// do usuário é o valor absoluto; o % da produção é derivado (investimento ÷
// target × 100) na UI.
export const premissaInvestimentoMes = pgTable(
  "premissa_investimento_mes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    premissaId: uuid("premissa_id")
      .notNull()
      .references(() => premissas.id, { onDelete: "cascade" }),
    mes: varchar("mes", { length: 7 }).notNull(), // "2026-01" .. "2026-12"
    investimento: doublePrecision("investimento").notNull(),
  },
  (table) => [uniqueIndex("idx_prem_invest_mes_unique").on(table.premissaId, table.mes)],
);

// P4 — Split normalizado de leads por horizonte × tier (tabela direita do P4).
// Grão: horizonte × tier (esparso — só tiers ativos no horizonte).
export const premissaDistSplit = pgTable(
  "premissa_dist_split",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    premissaId: uuid("premissa_id")
      .notNull()
      .references(() => premissas.id, { onDelete: "cascade" }),
    h: horizonteEnum("h").notNull(),
    tier: tierEnum("tier").notNull(),
    pct: doublePrecision("pct").notNull(),
  },
  (table) => [uniqueIndex("idx_prem_dist_split_unique").on(table.premissaId, table.h, table.tier)],
);

// P8 (Lead Broker) + P9 (Black Box). Grão: canal × tier (10). Funil longo (cr1–cr7).
export const premissaConversaoInbound = pgTable(
  "premissa_conversao_inbound",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    premissaId: uuid("premissa_id")
      .notNull()
      .references(() => premissas.id, { onDelete: "cascade" }),
    canal: canalInboundEnum("canal").notNull(),
    tier: tierEnum("tier").notNull(),
    cr1: doublePrecision("cr1").notNull(),
    cr2: doublePrecision("cr2").notNull(),
    cr3: doublePrecision("cr3").notNull(),
    cr4: doublePrecision("cr4").notNull(),
    cr5: doublePrecision("cr5").notNull(),
    cr6: doublePrecision("cr6").notNull(),
    cr7: doublePrecision("cr7").notNull(),
  },
  (table) => [
    uniqueIndex("idx_prem_conv_inbound_unique").on(table.premissaId, table.canal, table.tier),
  ],
);

// P11–P15 (5 subcanais outbound). Grão: subcanal × tier (25). Funil curto (cr1,3,4,6,7).
export const premissaConversaoOutbound = pgTable(
  "premissa_conversao_outbound",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    premissaId: uuid("premissa_id")
      .notNull()
      .references(() => premissas.id, { onDelete: "cascade" }),
    subcanal: subcanalOutboundEnum("subcanal").notNull(),
    tier: tierEnum("tier").notNull(),
    cr1: doublePrecision("cr1").notNull(),
    cr3: doublePrecision("cr3").notNull(),
    cr4: doublePrecision("cr4").notNull(),
    cr6: doublePrecision("cr6").notNull(),
    cr7: doublePrecision("cr7").notNull(),
  },
  (table) => [
    uniqueIndex("idx_prem_conv_outbound_unique").on(
      table.premissaId,
      table.subcanal,
      table.tier,
    ),
  ],
);

// P10 — Meeting Broker (Enterprise-only). Singleton: 1 linha por preenchimento.
export const premissaMeetingBroker = pgTable(
  "premissa_meeting_broker",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    premissaId: uuid("premissa_id")
      .notNull()
      .references(() => premissas.id, { onDelete: "cascade" }),
    custoSql: doublePrecision("custo_sql").notNull(),
    cr3: doublePrecision("cr3").notNull(),
    cr4: doublePrecision("cr4").notNull(),
    meta: text("meta").notNull().default(""),
    pipeline: text("pipeline").notNull().default(""),
  },
  (table) => [uniqueIndex("idx_prem_meeting_broker_unique").on(table.premissaId)],
);

// ============================================================
// realizado_funil — Fase /bowtie (input do realizado do funil)
//
// Uma linha por célula (organizationId × mes × subcanal × tier). Substitui o
// futuro pull de sistema externo. Granularidade casa 1-pra-1 com a projeção
// de calcularPorSubCanalPorTier — assim os filtros do /bowtie agregam projetado
// e realizado pelo mesmo eixo.
//
// `subcanal` é varchar livre (em vez dos enums separados inbound/outbound) pra
// caber as 8 chaves de SUB_CANAIS num único campo: lead_broker, black_box,
// meeting_broker, eventos, out_indicacao, out_recovery, out_recomendacao,
// out_prospeccao.
// ============================================================

export const realizadoFunil = pgTable(
  "realizado_funil",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    mes: varchar("mes", { length: 7 }).notNull(),
    subcanal: varchar("subcanal", { length: 40 }).notNull(),
    tier: tierEnum("tier").notNull(),
    leads: doublePrecision("leads").notNull().default(0),
    mql: doublePrecision("mql").notNull().default(0),
    sql: doublePrecision("sql").notNull().default(0),
    sal: doublePrecision("sal").notNull().default(0),
    won: doublePrecision("won").notNull().default(0),
    faturamento: doublePrecision("faturamento").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_realizado_funil_unique").on(
      table.organizationId,
      table.mes,
      table.subcanal,
      table.tier,
    ),
    index("idx_realizado_funil_org_mes").on(table.organizationId, table.mes),
  ],
);

export type RealizadoFunilRow = typeof realizadoFunil.$inferSelect;
export type NewRealizadoFunilRow = typeof realizadoFunil.$inferInsert;
