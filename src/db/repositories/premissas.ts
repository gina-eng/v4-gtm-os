/**
 * Repository das premissas normalizadas — Fase 2.
 *
 * Substitui as colunas jsonb de `unit_setups`. Uma linha por entidade (matriz
 * OU unidade) na tabela `premissas`, identificada por `entidadeId` (o id da org,
 * referência solta — sem FK). Cada bloco de premissa vive em tabelas-filhas
 * normalizadas, agrupadas por dimensão:
 *
 * - premissa_time_comercial  (pessoa)
 * - premissa_cargo           (cargo)              — P17
 * - premissa_horizonte       (horizonte)          — P1 + P6 + P16
 * - premissa_tier            (tier)               — P2 + P3 + P4
 * - premissa_conversao_inbound  (canal × tier)    — P8 + P9
 * - premissa_conversao_outbound (subcanal × tier) — P11–P15
 * - premissa_meeting_broker  (singleton)          — P10
 *
 * A linha de uma entidade é sempre materializada por completo (todos os blocos),
 * pra que a comparação matriz × unidade seja um join direto e as colunas fiquem
 * NOT NULL. Quem decide "herdado da matriz vs. próprio da unidade" é o
 * `completedSteps` (mantido em unit_setups), não a presença de linhas aqui.
 */

import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  premissas,
  premissaTimeComercial,
  premissaCargo,
  premissaHorizonte,
  premissaTier,
  premissaConversaoInbound,
  premissaConversaoOutbound,
  premissaMeetingBroker,
} from "@/db/schema";
import {
  CONVERSAO_BLACK_BOX_DEFAULT,
  CONVERSAO_LEAD_BROKER_DEFAULT,
  CONVERSAO_MEETING_BROKER_DEFAULT,
  CONVERSAO_OUTBOUND_EVENTOS_DEFAULT,
  CONVERSAO_OUTBOUND_INDICACAO_DEFAULT,
  CONVERSAO_OUTBOUND_PROSPECCAO_DEFAULT,
  CONVERSAO_OUTBOUND_RECOMENDACAO_DEFAULT,
  CONVERSAO_OUTBOUND_RECOVERY_DEFAULT,
  DIST_MERCADO_DEFAULT,
  HORIZONTE_CRESCIMENTO_DEFAULT,
  INVESTIMENTO_MIDIA_DEFAULT,
  METRICAS_OPERACIONAIS_DEFAULT,
  MIX_OUTBOUND_DEFAULT,
  RECEITA_PRODUTO_DEFAULT,
  TIERS_CLIENTE_DEFAULT,
  TIME_COMERCIAL_DEFAULT,
  type ConversaoInbound,
  type ConversaoMeetingBroker,
  type ConversaoOutbound,
  type DistMercado,
  type Horizonte,
  type HorizonteCrescimento,
  type InvestimentoMidia,
  type MetricaOperacional,
  type MixOutboundHorizonte,
  type ReceitaProduto,
  type Tier,
  type TierCliente,
  type TimeComercialMembro,
} from "@/lib/premissas/matriz-defaults";
import type {
  ConversoesInboundData,
  ConversoesOutboundData,
  SaveStepInput,
} from "@/lib/unit-setup-types";

/** Conjunto completo de blocos de premissa de uma entidade (sempre materializado). */
export type PremissasBlocks = {
  horizontes: HorizonteCrescimento[];
  timeComercial: TimeComercialMembro[];
  metricasOperacionais: MetricaOperacional[];
  tiersCliente: TierCliente[];
  receitaProduto: ReceitaProduto[];
  distMercado: DistMercado[];
  investimentoMidia: InvestimentoMidia[];
  conversoesInbound: ConversoesInboundData;
  conversoesOutbound: ConversoesOutboundData;
  mixSubcanais: MixOutboundHorizonte[];
};

const HORIZONTE_ORDER: Horizonte[] = ["H1", "H2", "H3", "H4", "H5"];
const TIER_ORDER: Tier[] = ["Tiny", "Small", "Medium", "Large", "Enterprise"];
const CARGO_ORDER = ["LDR", "BDR", "SDR", "CLOSER", "KAM"] as const;

type SubcanalOutbound = (typeof premissaConversaoOutbound.$inferSelect)["subcanal"];

/**
 * Snapshot completo dos defaults da Matriz como `PremissasBlocks`. Serve de
 * ponto de partida tanto pro seed da matriz quanto pro fallback de saves.
 */
export function matrizDefaultBlocks(): PremissasBlocks {
  return {
    horizontes: HORIZONTE_CRESCIMENTO_DEFAULT,
    timeComercial: TIME_COMERCIAL_DEFAULT,
    metricasOperacionais: METRICAS_OPERACIONAIS_DEFAULT,
    tiersCliente: TIERS_CLIENTE_DEFAULT,
    receitaProduto: RECEITA_PRODUTO_DEFAULT,
    distMercado: DIST_MERCADO_DEFAULT,
    investimentoMidia: INVESTIMENTO_MIDIA_DEFAULT,
    conversoesInbound: {
      leadBroker: CONVERSAO_LEAD_BROKER_DEFAULT,
      blackBox: CONVERSAO_BLACK_BOX_DEFAULT,
      meetingBroker: CONVERSAO_MEETING_BROKER_DEFAULT,
    },
    conversoesOutbound: {
      indicacao: CONVERSAO_OUTBOUND_INDICACAO_DEFAULT,
      eventos: CONVERSAO_OUTBOUND_EVENTOS_DEFAULT,
      recovery: CONVERSAO_OUTBOUND_RECOVERY_DEFAULT,
      recomendacao: CONVERSAO_OUTBOUND_RECOMENDACAO_DEFAULT,
      prospeccao: CONVERSAO_OUTBOUND_PROSPECCAO_DEFAULT,
    },
    mixSubcanais: MIX_OUTBOUND_DEFAULT,
  };
}

// ============================================================
// Leitura
// ============================================================

/**
 * Lê os blocos materializados de uma entidade. Retorna `null` se a entidade
 * ainda não tem linha em `premissas` (nunca salvou).
 */
export async function getPremissas(entidadeId: string): Promise<PremissasBlocks | null> {
  const [header] = await db
    .select({ id: premissas.id })
    .from(premissas)
    .where(eq(premissas.entidadeId, entidadeId))
    .limit(1);
  if (!header) return null;
  return loadBlocksForPremissaIds([header.id]).then((m) => m.get(header.id) ?? null);
}

/**
 * Versão batch: retorna um Map entidadeId → blocos (só entidades que têm linha).
 * Evita N+1 nas telas consolidadas da Matriz e na comparação.
 */
export async function getPremissasByEntityIds(
  ids: string[],
): Promise<Map<string, PremissasBlocks>> {
  const result = new Map<string, PremissasBlocks>();
  if (ids.length === 0) return result;

  const headers = await db
    .select({ id: premissas.id, entidadeId: premissas.entidadeId })
    .from(premissas)
    .where(inArray(premissas.entidadeId, ids));
  if (headers.length === 0) return result;

  const byPremissaId = await loadBlocksForPremissaIds(headers.map((h) => h.id));
  for (const h of headers) {
    const blocks = byPremissaId.get(h.id);
    if (blocks) result.set(h.entidadeId, blocks);
  }
  return result;
}

/** Carrega e remonta os blocos para um conjunto de premissaIds. */
async function loadBlocksForPremissaIds(
  premissaIds: string[],
): Promise<Map<string, PremissasBlocks>> {
  const [time, cargos, horiz, tiers, inbound, outbound, mb] = await Promise.all([
    db.select().from(premissaTimeComercial).where(inArray(premissaTimeComercial.premissaId, premissaIds)),
    db.select().from(premissaCargo).where(inArray(premissaCargo.premissaId, premissaIds)),
    db.select().from(premissaHorizonte).where(inArray(premissaHorizonte.premissaId, premissaIds)),
    db.select().from(premissaTier).where(inArray(premissaTier.premissaId, premissaIds)),
    db.select().from(premissaConversaoInbound).where(inArray(premissaConversaoInbound.premissaId, premissaIds)),
    db.select().from(premissaConversaoOutbound).where(inArray(premissaConversaoOutbound.premissaId, premissaIds)),
    db.select().from(premissaMeetingBroker).where(inArray(premissaMeetingBroker.premissaId, premissaIds)),
  ]);

  const group = <T extends { premissaId: string }>(rows: T[]): Map<string, T[]> => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const arr = m.get(r.premissaId) ?? [];
      arr.push(r);
      m.set(r.premissaId, arr);
    }
    return m;
  };
  const timeBy = group(time);
  const cargoBy = group(cargos);
  const horizBy = group(horiz);
  const tierBy = group(tiers);
  const inboundBy = group(inbound);
  const outboundBy = group(outbound);
  const mbBy = group(mb);

  const result = new Map<string, PremissasBlocks>();
  for (const pid of premissaIds) {
    result.set(pid, {
      timeComercial: (timeBy.get(pid) ?? [])
        .sort((a, b) => a.ord - b.ord)
        .map((r) => ({
          email: r.email,
          cargo: r.cargo,
          salario: r.salario,
          comissaoPct: r.comissaoPct,
          capacidadePct: r.capacidadePct,
        })),
      metricasOperacionais: orderBy(cargoBy.get(pid) ?? [], "cargo", CARGO_ORDER).map(
        (r) => ({
          cargo: r.cargo,
          wipLimit: r.wipLimit,
          contratacao: r.contratacao,
          onboarding: r.onboarding,
          rampagem: r.rampagem,
          atingimentoMes: r.atingimentoMes,
          permanencia: r.permanencia,
          turnoverMesPct: r.turnoverMesPct,
          ligacoesMes: r.ligacoesMes,
          conexaoPct: r.conexaoPct,
          extra: r.extra,
        }),
      ),
      horizontes: orderBy(horizBy.get(pid) ?? [], "h", HORIZONTE_ORDER).map((r) => ({
        h: r.h,
        faixaMin: r.faixaMin,
        faixaMax: r.faixaMax,
        tempoMaxMeses: r.tempoMaxMeses,
        crescMensalPct: r.crescMensalPct,
      })),
      investimentoMidia: orderBy(horizBy.get(pid) ?? [], "h", HORIZONTE_ORDER).map((r) => ({
        h: r.h,
        pctProducao: r.pctProducao,
        splitLb: r.splitLb,
        splitBb: r.splitBb,
        bbPiso: r.bbPiso,
        regra: r.regra,
      })),
      mixSubcanais: orderBy(horizBy.get(pid) ?? [], "h", HORIZONTE_ORDER).map((r) => ({
        h: r.h,
        indicacao: r.mixIndicacao,
        eventos: r.mixEventos,
        recovery: r.mixRecovery,
        recomendacao: r.mixRecomendacao,
        prospeccao: r.mixProspeccao,
      })),
      tiersCliente: orderBy(tierBy.get(pid) ?? [], "tier", TIER_ORDER).map((r) => ({
        tier: r.tier,
        faturamentoMin: r.faturamentoMin,
        faturamentoMax: r.faturamentoMax,
        tcvBooking: r.tcvBooking,
        tcvProdCom: r.tcvProdCom,
        cplLb: r.cplLb,
        cplBb: r.cplBb,
      })),
      receitaProduto: orderBy(tierBy.get(pid) ?? [], "tier", TIER_ORDER).map((r) => ({
        tier: r.tier,
        saberPct: r.saberPct,
        saberAt: r.saberAt,
        terPct: r.terPct,
        terAt: r.terAt,
        execPct: r.execPct,
        execAt: r.execAt,
      })),
      distMercado: orderBy(tierBy.get(pid) ?? [], "tier", TIER_ORDER).map((r) => ({
        tier: r.tier,
        pctMercado: r.pctMercado,
        entraHorizonte: r.entraHorizonte,
      })),
      conversoesInbound: {
        leadBroker: orderBy(
          (inboundBy.get(pid) ?? []).filter((r) => r.canal === "lead_broker"),
          "tier",
          TIER_ORDER,
        ).map(inboundRowToCr),
        blackBox: orderBy(
          (inboundBy.get(pid) ?? []).filter((r) => r.canal === "black_box"),
          "tier",
          TIER_ORDER,
        ).map(inboundRowToCr),
        meetingBroker: (() => {
          const r = (mbBy.get(pid) ?? [])[0];
          return r
            ? { custoSql: r.custoSql, cr3: r.cr3, cr4: r.cr4, meta: r.meta, pipeline: r.pipeline }
            : CONVERSAO_MEETING_BROKER_DEFAULT;
        })(),
      },
      conversoesOutbound: {
        indicacao: outboundFor(outboundBy.get(pid) ?? [], "indicacao"),
        eventos: outboundFor(outboundBy.get(pid) ?? [], "eventos"),
        recovery: outboundFor(outboundBy.get(pid) ?? [], "recovery"),
        recomendacao: outboundFor(outboundBy.get(pid) ?? [], "recomendacao"),
        prospeccao: outboundFor(outboundBy.get(pid) ?? [], "prospeccao"),
      },
    });
  }
  return result;
}

function inboundRowToCr(r: typeof premissaConversaoInbound.$inferSelect) {
  return { tier: r.tier, cr1: r.cr1, cr2: r.cr2, cr3: r.cr3, cr4: r.cr4, cr5: r.cr5, cr6: r.cr6, cr7: r.cr7 };
}

function outboundFor(
  rows: (typeof premissaConversaoOutbound.$inferSelect)[],
  subcanal: SubcanalOutbound,
) {
  return orderBy(
    rows.filter((r) => r.subcanal === subcanal),
    "tier",
    TIER_ORDER,
  ).map((r) => ({ tier: r.tier, cr1: r.cr1, cr3: r.cr3, cr4: r.cr4, cr6: r.cr6, cr7: r.cr7 }));
}

/** Ordena `rows` pela posição de `rows[i][key]` em `order`. Itens fora da lista
 * (ex: cargos customizados) vão pro fim, preservando ordem relativa. */
function orderBy<T, K extends keyof T>(rows: T[], key: K, order: readonly T[K][]): T[] {
  const rank = (v: T[K]) => {
    const i = order.indexOf(v);
    return i < 0 ? order.length : i;
  };
  return [...rows].sort((a, b) => rank(a[key]) - rank(b[key]));
}

// ============================================================
// Escrita
// ============================================================

/**
 * Sobrescreve TODOS os blocos de uma entidade (replace-set). Numa transação:
 * upsert do header por `entidadeId`, apaga as filhas e reinsere. O caller deve
 * passar o snapshot completo (geralmente: blocos atuais + patch do step).
 */
export async function savePremissas(
  entidadeId: string,
  blocks: PremissasBlocks,
): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    const [header] = await tx
      .insert(premissas)
      .values({ entidadeId, updatedAt: now })
      .onConflictDoUpdate({ target: premissas.entidadeId, set: { updatedAt: now } })
      .returning({ id: premissas.id });
    const pid = header!.id;

    await Promise.all([
      tx.delete(premissaTimeComercial).where(eq(premissaTimeComercial.premissaId, pid)),
      tx.delete(premissaCargo).where(eq(premissaCargo.premissaId, pid)),
      tx.delete(premissaHorizonte).where(eq(premissaHorizonte.premissaId, pid)),
      tx.delete(premissaTier).where(eq(premissaTier.premissaId, pid)),
      tx.delete(premissaConversaoInbound).where(eq(premissaConversaoInbound.premissaId, pid)),
      tx.delete(premissaConversaoOutbound).where(eq(premissaConversaoOutbound.premissaId, pid)),
      tx.delete(premissaMeetingBroker).where(eq(premissaMeetingBroker.premissaId, pid)),
    ]);

    // Time comercial (grão: pessoa) — preserva ordem via `ord`.
    if (blocks.timeComercial.length > 0) {
      await tx.insert(premissaTimeComercial).values(
        blocks.timeComercial.map((m, i) => ({
          premissaId: pid,
          ord: i,
          email: m.email,
          cargo: m.cargo,
          salario: m.salario,
          comissaoPct: m.comissaoPct,
          capacidadePct: m.capacidadePct,
        })),
      );
    }

    // P17 — cargo
    if (blocks.metricasOperacionais.length > 0) {
      await tx.insert(premissaCargo).values(
        blocks.metricasOperacionais.map((m) => ({
          premissaId: pid,
          cargo: m.cargo,
          wipLimit: m.wipLimit,
          contratacao: m.contratacao,
          onboarding: m.onboarding,
          rampagem: m.rampagem,
          atingimentoMes: m.atingimentoMes,
          permanencia: m.permanencia,
          turnoverMesPct: m.turnoverMesPct,
          ligacoesMes: m.ligacoesMes,
          conexaoPct: m.conexaoPct,
          extra: m.extra,
        })),
      );
    }

    // P1 + P6 + P16 — horizonte (merge por `h`)
    const invByH = indexByH(blocks.investimentoMidia);
    const mixByH = indexByH(blocks.mixSubcanais);
    await tx.insert(premissaHorizonte).values(
      blocks.horizontes.map((p1) => {
        const p6 = invByH.get(p1.h);
        const p16 = mixByH.get(p1.h);
        return {
          premissaId: pid,
          h: p1.h,
          faixaMin: p1.faixaMin,
          faixaMax: p1.faixaMax,
          tempoMaxMeses: p1.tempoMaxMeses,
          crescMensalPct: p1.crescMensalPct,
          pctProducao: p6?.pctProducao ?? 0,
          splitLb: p6?.splitLb ?? 0,
          splitBb: p6?.splitBb ?? 0,
          bbPiso: p6?.bbPiso ?? 0,
          regra: p6?.regra ?? "",
          mixIndicacao: p16?.indicacao ?? 0,
          mixEventos: p16?.eventos ?? 0,
          mixRecovery: p16?.recovery ?? 0,
          mixRecomendacao: p16?.recomendacao ?? 0,
          mixProspeccao: p16?.prospeccao ?? 0,
        };
      }),
    );

    // P2 + P3 + P4 — tier (merge por `tier`)
    const recByTier = indexByTier(blocks.receitaProduto);
    const distByTier = indexByTier(blocks.distMercado);
    await tx.insert(premissaTier).values(
      blocks.tiersCliente.map((p2) => {
        const p3 = recByTier.get(p2.tier);
        const p4 = distByTier.get(p2.tier);
        return {
          premissaId: pid,
          tier: p2.tier,
          faturamentoMin: p2.faturamentoMin,
          faturamentoMax: p2.faturamentoMax,
          tcvBooking: p2.tcvBooking,
          tcvProdCom: p2.tcvProdCom,
          cplLb: p2.cplLb,
          cplBb: p2.cplBb,
          saberPct: p3?.saberPct ?? 0,
          saberAt: p3?.saberAt ?? 0,
          terPct: p3?.terPct ?? 0,
          terAt: p3?.terAt ?? 0,
          execPct: p3?.execPct ?? 0,
          execAt: p3?.execAt ?? 0,
          pctMercado: p4?.pctMercado ?? 0,
          entraHorizonte: p4?.entraHorizonte ?? "H1",
        };
      }),
    );

    // P8 + P9 — conversões inbound (canal × tier)
    const inboundRows = [
      ...blocks.conversoesInbound.leadBroker.map((c) => ({ canal: "lead_broker" as const, ...c })),
      ...blocks.conversoesInbound.blackBox.map((c) => ({ canal: "black_box" as const, ...c })),
    ];
    if (inboundRows.length > 0) {
      await tx.insert(premissaConversaoInbound).values(
        inboundRows.map((c) => ({
          premissaId: pid,
          canal: c.canal,
          tier: c.tier,
          cr1: c.cr1,
          cr2: c.cr2,
          cr3: c.cr3,
          cr4: c.cr4,
          cr5: c.cr5,
          cr6: c.cr6,
          cr7: c.cr7,
        })),
      );
    }

    // P10 — meeting broker (singleton)
    const mb = blocks.conversoesInbound.meetingBroker;
    await tx.insert(premissaMeetingBroker).values({
      premissaId: pid,
      custoSql: mb.custoSql,
      cr3: mb.cr3,
      cr4: mb.cr4,
      meta: mb.meta,
      pipeline: mb.pipeline,
    });

    // P11–P15 — conversões outbound (subcanal × tier)
    const out = blocks.conversoesOutbound;
    const outboundRows = [
      ...out.indicacao.map((c) => ({ subcanal: "indicacao" as const, ...c })),
      ...out.eventos.map((c) => ({ subcanal: "eventos" as const, ...c })),
      ...out.recovery.map((c) => ({ subcanal: "recovery" as const, ...c })),
      ...out.recomendacao.map((c) => ({ subcanal: "recomendacao" as const, ...c })),
      ...out.prospeccao.map((c) => ({ subcanal: "prospeccao" as const, ...c })),
    ];
    if (outboundRows.length > 0) {
      await tx.insert(premissaConversaoOutbound).values(
        outboundRows.map((c) => ({
          premissaId: pid,
          subcanal: c.subcanal,
          tier: c.tier,
          cr1: c.cr1,
          cr3: c.cr3,
          cr4: c.cr4,
          cr6: c.cr6,
          cr7: c.cr7,
        })),
      );
    }
  });
}

function indexByH<T extends { h: Horizonte }>(rows: T[]): Map<Horizonte, T> {
  return new Map(rows.map((r) => [r.h, r]));
}
function indexByTier<T extends { tier: Tier }>(rows: T[]): Map<Tier, T> {
  return new Map(rows.map((r) => [r.tier, r]));
}

/** Aplica o patch de um step nos blocos base. (realizado-historico não é bloco.) */
export function applyStepToBlocks(base: PremissasBlocks, input: SaveStepInput): PremissasBlocks {
  switch (input.step) {
    case "horizontes":
      return { ...base, horizontes: input.data };
    case "time-comercial":
      return { ...base, timeComercial: input.data };
    case "metricas-operacionais":
      return { ...base, metricasOperacionais: input.data };
    case "tiers-receita":
      return { ...base, tiersCliente: input.data.tiers, receitaProduto: input.data.produtos };
    case "leads-investimento":
      return { ...base, distMercado: input.data.distMercado, investimentoMidia: input.data.investimentoMidia };
    case "conversoes-inbound":
      return { ...base, conversoesInbound: input.data };
    case "conversoes-outbound":
      return { ...base, conversoesOutbound: input.data };
    case "mix-subcanais":
      return { ...base, mixSubcanais: input.data };
    case "realizado-historico":
      return base;
  }
}

/**
 * Salva um único step de premissa direto numa entidade (sem mexer em
 * completedSteps). Usado pela tela /premissas (edição da Matriz). Lê os blocos
 * atuais (ou defaults da matriz como base), aplica o patch e sobrescreve.
 */
export async function savePremissasStep(
  entidadeId: string,
  input: SaveStepInput,
): Promise<void> {
  const base = (await getPremissas(entidadeId)) ?? matrizDefaultBlocks();
  await savePremissas(entidadeId, applyStepToBlocks(base, input));
}

/**
 * Patch granular por bloco — a tela /premissas salva uma seção por vez, e o
 * agrupamento dela é mais fino que os steps do wizard (cada canal de conversão,
 * cada subcanal outbound tem seu próprio botão). Cada patch atualiza só o seu
 * bloco no snapshot atual da entidade.
 */
export type PremissaBlockPatch =
  | { block: "horizontes"; data: HorizonteCrescimento[] }
  | { block: "investimentoMidia"; data: InvestimentoMidia[] }
  | { block: "mixSubcanais"; data: MixOutboundHorizonte[] }
  | { block: "tiersCliente"; data: TierCliente[] }
  | { block: "receitaProduto"; data: ReceitaProduto[] }
  | { block: "distMercado"; data: DistMercado[] }
  | { block: "metricasOperacionais"; data: MetricaOperacional[] }
  | { block: "timeComercial"; data: TimeComercialMembro[] }
  | { block: "conversaoInbound"; canal: "lead_broker" | "black_box"; data: ConversaoInbound[] }
  | { block: "meetingBroker"; data: ConversaoMeetingBroker }
  | { block: "conversaoOutbound"; subcanal: SubcanalOutbound; data: ConversaoOutbound[] };

function applyBlockPatch(base: PremissasBlocks, patch: PremissaBlockPatch): PremissasBlocks {
  switch (patch.block) {
    case "horizontes":
      return { ...base, horizontes: patch.data };
    case "investimentoMidia":
      return { ...base, investimentoMidia: patch.data };
    case "mixSubcanais":
      return { ...base, mixSubcanais: patch.data };
    case "tiersCliente":
      return { ...base, tiersCliente: patch.data };
    case "receitaProduto":
      return { ...base, receitaProduto: patch.data };
    case "distMercado":
      return { ...base, distMercado: patch.data };
    case "metricasOperacionais":
      return { ...base, metricasOperacionais: patch.data };
    case "timeComercial":
      return { ...base, timeComercial: patch.data };
    case "conversaoInbound":
      return {
        ...base,
        conversoesInbound: {
          ...base.conversoesInbound,
          [patch.canal === "lead_broker" ? "leadBroker" : "blackBox"]: patch.data,
        },
      };
    case "meetingBroker":
      return {
        ...base,
        conversoesInbound: { ...base.conversoesInbound, meetingBroker: patch.data },
      };
    case "conversaoOutbound":
      return {
        ...base,
        conversoesOutbound: { ...base.conversoesOutbound, [patch.subcanal]: patch.data },
      };
  }
}

export async function savePremissasBlock(
  entidadeId: string,
  patch: PremissaBlockPatch,
): Promise<void> {
  const base = (await getPremissas(entidadeId)) ?? matrizDefaultBlocks();
  await savePremissas(entidadeId, applyBlockPatch(base, patch));
}
