/**
 * Schema do banco V4 OS — Drizzle ORM
 *
 * Após alterar este arquivo:
 *   npm run db:generate    → produz SQL diff em src/db/migrations/
 *   npm run db:migrate     → aplica no banco (precisa de DATABASE_URL_DIRECT)
 *
 * Sub-fases:
 * - F1.1: unidades (ex-`organizations`), audit_log
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

// Subcanal de mídia (8 chaves de `SubCanalKey` em funil-reverso.ts) — usado no
// override mensal por subcanal. Inbound: lead_broker/black_box/meeting_broker/
// eventos. Outbound: out_indicacao/out_recovery/out_recomendacao/out_prospeccao.
export const subcanalMidiaEnum = pgEnum("subcanal_midia", [
  "lead_broker",
  "black_box",
  "meeting_broker",
  "eventos",
  "out_indicacao",
  "out_recovery",
  "out_recomendacao",
  "out_prospeccao",
]);

export const userStatusEnum = pgEnum("user_status", ["pending", "active", "inactive"]);
// Sub-escopo da visão "matriz" do seletor global. Só é relevante quando
// activeOrganizationId IS NULL (matriz_propria/unidade usam o próprio org id).
// NULL = retrocompat = comporta-se como 'todas_unidades'. Ver docs/escopo-seletor-4-modos.md.
export const matrizScopeEnum = pgEnum("matriz_scope", ["geral", "todas_unidades"]);
export const roleEnum = pgEnum("role", ["admin", "gerente", "coordenador"]);
export const membershipStatusEnum = pgEnum("membership_status", ["active", "inactive"]);

// ============================================================
// unidades (tabela física `unidades`) — F1.1
//
// Guarda tanto a Matriz (type='matriz', linha única) quanto as unidades
// (type='unidade'). O símbolo TS segue `organizations` e as colunas de FK
// nas outras tabelas seguem `organization_id` — só a tabela física e seus
// índices/constraints foram renomeados para `unidades`.
// ============================================================

export const organizations = pgTable(
  "unidades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: orgTypeEnum("type").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => organizations.id),
    slug: varchar("slug", { length: 60 }).notNull().unique(),
    name: varchar("name", { length: 120 }).notNull(),
    status: orgStatusEnum("status").notNull().default("active"),
    horizonteAtual: horizonteEnum("horizonte_atual").notNull().default("H1"),
    /** ID da unidade em sistema externo (ex: tenant corporativo V4). Solto, sem FK. */
    idTenant: varchar("id_tenant", { length: 120 }),
    cnpj: varchar("cnpj", { length: 18 }),
    /** Franqueado responsável pela unidade (ex-`socio_executivo_nome`). */
    franqueado: varchar("franqueado", { length: 120 }),
    regional: varchar("regional", { length: 30 }),
    dataInicio: date("data_inicio"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_unidades_single_matriz")
      .on(table.type)
      .where(sql`${table.type} = 'matriz'`),
    index("idx_unidades_parent").on(table.parentId),
    index("idx_unidades_type_status").on(table.type, table.status),
    index("idx_unidades_regional").on(table.regional),
    index("idx_unidades_id_tenant").on(table.idTenant),
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
    /** Sub-escopo da visão matriz (só usado quando activeOrganizationId é null).
     *  NULL = retrocompat = 'todas_unidades'. Ver matrizScopeEnum. */
    matrizScope: matrizScopeEnum("matriz_scope"),
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
    splitEv: doublePrecision("split_ev").notNull().default(0),
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

// Override do investimento/leads por SUBCANAL, mês a mês (2026). Grão:
// mês × subcanal (até 8 por mês). `valor` = investimento em R$ para os
// subcanais inbound (lead_broker/black_box/meeting_broker/eventos) ou nº de
// leads para os subcanais outbound (out_*) — a semântica é determinada pelo
// subcanal. Esparso: meses/subcanais ausentes caem no rateio derivado (split
// P6 inbound / mix P16 outbound) feito pelo funil reverso. Hard cap: a soma
// por grupo (inbound/outbound) nunca passa do total do mês (Pace / leadsOb).
export const premissaOverrideSubcanalMes = pgTable(
  "premissa_override_subcanal_mes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    premissaId: uuid("premissa_id")
      .notNull()
      .references(() => premissas.id, { onDelete: "cascade" }),
    mes: varchar("mes", { length: 7 }).notNull(), // "2026-01" .. "2026-12"
    subcanal: subcanalMidiaEnum("subcanal").notNull(),
    valor: doublePrecision("valor").notNull(),
  },
  (table) => [
    uniqueIndex("idx_prem_override_subcanal_mes_unique").on(
      table.premissaId,
      table.mes,
      table.subcanal,
    ),
  ],
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

// Eventos — inbound funil curto multi-tier. custoSql é singleton (1 linha por
// preenchimento) — CR3/CR4 ficam por tier em premissa_conversao_eventos.
export const premissaEventosCusto = pgTable(
  "premissa_eventos_custo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    premissaId: uuid("premissa_id")
      .notNull()
      .references(() => premissas.id, { onDelete: "cascade" }),
    custoSql: doublePrecision("custo_sql").notNull().default(5000),
    meta: text("meta").notNull().default(""),
    pipeline: text("pipeline").notNull().default(""),
  },
  (table) => [uniqueIndex("idx_prem_eventos_custo_unique").on(table.premissaId)],
);

export const premissaConversaoEventos = pgTable(
  "premissa_conversao_eventos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    premissaId: uuid("premissa_id")
      .notNull()
      .references(() => premissas.id, { onDelete: "cascade" }),
    tier: tierEnum("tier").notNull(),
    cr3: doublePrecision("cr3").notNull(),
    cr4: doublePrecision("cr4").notNull(),
  },
  (table) => [uniqueIndex("idx_prem_conv_eventos_unique").on(table.premissaId, table.tier)],
);

// ============================================================
// realizado_funil — realizado do funil (grão DIÁRIO)
//
// Uma linha por célula (organizationId × dia × subcanal × tier × categoria).
// Derivado da landing `realizado_import_lead` por scripts/derive-realizado-funil.ts
// (de-para de canal/tier + bucket por data de evento). O `/bowtie` lê isto
// agregado dia→mês (ver getRealizadoFunil) e cruza com a projeção mensal de
// calcularPorSubCanalPorTier pelo mesmo eixo.
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
    // Competência DIÁRIA: cada métrica entra no dia da sua data de evento
    // (leads/mql←cadastro, sql←rm, sal←rr, won/faturamento←venda).
    dia: date("dia").notNull(),
    // `mes` é derivado de `dia` (YYYY-MM) e gravado pela derivação (único writer),
    // então fica sempre consistente com `dia`. Plano: coluna gerada exigiria
    // expressão imutável (to_char é só STABLE) — manter plano é mais simples.
    mes: varchar("mes", { length: 7 }).notNull(),
    subcanal: varchar("subcanal", { length: 40 }).notNull(),
    tier: tierEnum("tier").notNull(),
    // Categoria do produto (P3): '' no topo do funil; Saber/Ter/Executar no won.
    categoria: varchar("categoria", { length: 60 }).notNull().default(""),
    leads: doublePrecision("leads").notNull().default(0),
    mql: doublePrecision("mql").notNull().default(0),
    sql: doublePrecision("sql").notNull().default(0),
    sal: doublePrecision("sal").notNull().default(0),
    won: doublePrecision("won").notNull().default(0),
    faturamento: doublePrecision("faturamento").notNull().default(0),
    // Investimento de mídia realizado (origem: media_investment do import). ⚠️ Hoje
    // o dado do banco é da REDE inteira (não por unidade) e inflado — os custos
    // realizados (CPMQL/CPSQL/CPSAL/CAC) saem absurdos até o time de dados mandar o
    // investido POR UNIDADE. Estrutura já fiada: ao corrigir o dado + re-derivar, os
    // custos ficam certos sem mexer no código.
    invest: doublePrecision("invest").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_realizado_funil_unique").on(
      table.organizationId,
      table.dia,
      table.subcanal,
      table.tier,
      table.categoria,
    ),
    index("idx_realizado_funil_org_mes").on(table.organizationId, table.mes),
    index("idx_realizado_funil_org_dia").on(table.organizationId, table.dia),
  ],
);

export type RealizadoFunilRow = typeof realizadoFunil.$inferSelect;
export type NewRealizadoFunilRow = typeof realizadoFunil.$inferInsert;

// ============================================================
// realizado_import_lead — landing CRU do extrato de realizado (grão lead/cohort)
//
// Espelha 1-pra-1 o template enviado pelo time de dados (Metabase/BI), preservando
// os rótulos crus do BI (canal/tier ainda SEM de-para pras 8/5 chaves do sistema)
// e as 4 datas de evento do funil. É a camada de aterrissagem: dela derivamos
// depois `realizado_funil` (unidade × dia × subcanal × tier) e `realizado_diario`
// (investido) aplicando o de-para e bucketizando CADA métrica pela SUA data —
// dt_cadastro_lead → leads/mql, dt_rm → sql, dt_rr → sal, dt_venda → won/faturamento.
//
// Grão: 1 linha por linha do extrato (cohort de leads que compartilham
// tier/canal/categoria/datas). Sem chave natural — recarga é idempotente por
// `loadBatch` (delete-where-batch + insert).
//
// ⚠️ `mediaInvestment` é guardado CRU mas NÃO é confiável como "investido": no
// extrato v3 soma ~R$10,5 bi numa unidade só, com valores repetidos e presença em
// canais sem mídia (Recovery/Reativação). NÃO usar pro CAC/investido até o time de
// dados confirmar a semântica (ver docs/realizado-extract-spec.md §4 e §6).
// ============================================================

export const realizadoImportLead = pgTable(
  "realizado_import_lead",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Link com a unidade resolvido via id_tenant → organizations.id_tenant.
    // Nullable: fica NULL quando o id_tenant do extrato não casa com nenhuma org.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    // ── Dimensões cruas (rótulos do BI, exatamente como vieram) ──
    idTenant: varchar("id_tenant", { length: 120 }),
    franqueado: varchar("franqueado", { length: 120 }),
    tierLead: varchar("tier_lead", { length: 40 }),
    tierVenda: varchar("tier_venda", { length: 40 }),
    canalAquisicao: varchar("canal_aquisicao", { length: 60 }),
    canalOrigem: varchar("canal_origem", { length: 60 }),
    categoriaProduto: varchar("categoria_produto", { length: 60 }),
    // ── Datas por etapa do funil (competência diária; podem ser pré-2026) ──
    dtCadastroLead: date("dt_cadastro_lead"),
    dtRm: date("dt_rm"),
    dtRr: date("dt_rr"),
    dtVenda: date("dt_venda"),
    // ── Métricas do funil (contagens) ──
    leads: integer("leads").notNull().default(0),
    mql: integer("mql").notNull().default(0),
    rm: integer("rm").notNull().default(0), // = SQL (reunião marcada)
    rr: integer("rr").notNull().default(0), // = SAL (reunião realizada)
    won: integer("won").notNull().default(0),
    revenueWon: doublePrecision("revenue_won").notNull().default(0),
    // ⚠️ cru, não-confiável — ver cabeçalho.
    mediaInvestment: doublePrecision("media_investment").notNull().default(0),
    // ── Proveniência ──
    loadBatch: varchar("load_batch", { length: 60 }).notNull(),
    loadedAt: timestamp("loaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_realizado_import_org").on(table.organizationId),
    index("idx_realizado_import_tenant").on(table.idTenant),
    index("idx_realizado_import_batch").on(table.loadBatch),
    index("idx_realizado_import_dt_venda").on(table.dtVenda),
    index("idx_realizado_import_dt_cadastro").on(table.dtCadastroLead),
  ],
);

export type RealizadoImportLeadRow = typeof realizadoImportLead.$inferSelect;
export type NewRealizadoImportLeadRow = typeof realizadoImportLead.$inferInsert;

// ============================================================
// realizado_import_investimento — landing do INVESTIDO por subcanal (grão diário)
//
// Tabela dedicada ao investido de mídia, separada do funil. Substitui o
// `realizado_import_lead.media_investment` (que era da REDE, inflado e quebrava os
// custos do bowtie). O time de dados entrega aqui o investido POR SUBCANAL POR DIA,
// já por unidade, num formato "wide": uma linha por (data × id_tenant) com uma
// coluna de investido por subcanal.
//
// Colunas de subcanal (códigos do time de dados → de-para em INVEST_COL_TO_SUBCANAL):
//   lb → lead_broker (Lead Broker)
//   mb → meeting_broker (Meeting Broker)
//   bb → black_box (Black Box)
//   db → SEM subcanal definido por ora — guardado cru, NÃO conectado ao funil/bowtie
//        até o de-para ser fechado (ver de-para.ts). Eventos (EV) não vem nesta
//        entrega, então não recebe investido por aqui.
//
// Grão: 1 linha por (data × id_tenant). A unidade é resolvida na derivação
// (scripts/derive-realizado-funil.ts) via id_tenant → organizations.id_tenant, e o
// investido de cada dia/subcanal é distribuído entre os tiers (proporcional aos
// leads do dia) ao gravar `realizado_funil.invest` — mantém o downstream intacto.
// ============================================================

export const realizadoImportInvestimento = pgTable(
  "realizado_import_investimento",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Chave de unidade crua (mesmo padrão da landing de leads). A org é resolvida
    // na derivação por id_tenant → organizations.id_tenant.
    idTenant: varchar("id_tenant", { length: 120 }),
    // Competência DIÁRIA do investido (pode ser null/fora de 2026 — derivação filtra).
    data: date("data"),
    // ── Investido por subcanal (R$) ──
    lb: doublePrecision("lb").notNull().default(0), // Lead Broker
    db: doublePrecision("db").notNull().default(0), // parado: sem subcanal (não conectado)
    mb: doublePrecision("mb").notNull().default(0), // Meeting Broker
    bb: doublePrecision("bb").notNull().default(0), // Black Box
    loadedAt: timestamp("loaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_realizado_invest_tenant").on(table.idTenant),
    index("idx_realizado_invest_data").on(table.data),
  ],
);

export type RealizadoImportInvestimentoRow = typeof realizadoImportInvestimento.$inferSelect;
export type NewRealizadoImportInvestimentoRow = typeof realizadoImportInvestimento.$inferInsert;

// ============================================================
// realizado_nao_classificado — o "balde" do realizado que NÃO encaixa no grid
//
// `realizado_funil` só guarda o que é comparável ao projetado (unidade real ×
// subcanal das 8 chaves × tier das 5 chaves × 2026). Tudo que acontece mas não
// classifica — tenant sem unidade, canal fora do de-para, tier inválido, venda
// sem tier_venda — cai AQUI, etiquetado por `motivo`, em vez de ser descartado.
//
// Regra de ouro: realizado TOTAL = realizado_funil (classificado) + este
// (não-classificado). Garante reconciliação 100% sem poluir o grid nem mexer no
// projetado. NÃO é lido pela comparação do bowtie — é exibido à parte ("fora de
// meta") e serve de fila de trabalho: cada motivo é dado recuperável (cadastrar a
// unidade, estender o de-para, preencher o tier no extrato).
//
// `organizationId` é NULL quando o motivo é tenant sem unidade; preenchido quando
// a unidade existe mas outra dimensão falhou. `rotuloCru` guarda o valor que
// causou o descarte (id_tenant / canal / tier), pra drill-down e pro de-para.
// ============================================================

export const motivoNaoClassificado = pgEnum("motivo_nao_classificado", [
  "tenant_nao_cadastrado",
  "canal_nao_mapeado",
  "tier_lead_invalido",
  "venda_sem_tier",
]);

export const realizadoNaoClassificado = pgTable(
  "realizado_nao_classificado",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    idTenant: varchar("id_tenant", { length: 120 }),
    // Competência mensal por data do evento (YYYY-MM). Mesmo escopo 2026 do grid.
    mes: varchar("mes", { length: 7 }).notNull(),
    motivo: motivoNaoClassificado("motivo").notNull(),
    // Valor cru que causou o descarte (id_tenant, canal_aquisicao ou tier).
    rotuloCru: varchar("rotulo_cru", { length: 120 }).notNull().default(""),
    leads: doublePrecision("leads").notNull().default(0),
    mql: doublePrecision("mql").notNull().default(0),
    sql: doublePrecision("sql").notNull().default(0),
    sal: doublePrecision("sal").notNull().default(0),
    won: doublePrecision("won").notNull().default(0),
    faturamento: doublePrecision("faturamento").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_nao_classif_unique").on(
      table.idTenant,
      table.mes,
      table.motivo,
      table.rotuloCru,
    ),
    index("idx_nao_classif_org").on(table.organizationId),
    index("idx_nao_classif_motivo").on(table.motivo),
    index("idx_nao_classif_mes").on(table.mes),
  ],
);

export type RealizadoNaoClassificadoRow = typeof realizadoNaoClassificado.$inferSelect;
export type NewRealizadoNaoClassificadoRow = typeof realizadoNaoClassificado.$inferInsert;
