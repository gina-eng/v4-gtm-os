/**
 * Funil reverso (bow-tie invertido) — Won → SAL → SQL → MQL → Leads → Investimento.
 *
 * A partir de uma curva de faturamento-alvo (derivada do horizonte atual da unidade
 * e do realizado dos meses fechados) calcula, mês a mês de **Jan a Dez/2026**, o
 * investimento necessário, leads/won/receita por canal/tier/produto e headcount.
 * Alimenta as telas /ramp-up e /canal-tier.
 *
 * Funções puras, sem I/O. Modelo "limpo" derivado das premissas — não tenta
 * reproduzir o jitter de deals inteiros das planilhas de referência (decisão de
 * produto). A curva de target é a mesma do Forecast (`/realizado`): meses fechados
 * = realizado; meses futuros = âncora × (1 + taxa/100)^n com taxa do horizonteAtual
 * da unidade, fixa o ano todo. Quando ainda não há realizado, ancoramos na
 * `faixaMin` do horizonteAtual no mês de início da unidade (planejamento "do zero").
 */

import type {
  ConversaoInbound,
  ConversaoOutbound,
  Horizonte,
  HorizonteCrescimento,
  RealizadoMensal,
  Tier,
} from "@/lib/premissas/matriz-defaults";
import type { PremissasBlocks } from "@/db/repositories/premissas";
import {
  calcularRealizadoVsProjetado,
  getMesAncora,
  MESES_ANO_2026,
} from "@/lib/realizado/projecao";

const TIER_ORDER: Tier[] = ["Tiny", "Small", "Medium", "Large", "Enterprise"];

const SUBCANAIS_OUTBOUND = [
  "indicacao",
  "eventos",
  "recovery",
  "recomendacao",
  "prospeccao",
] as const;

/**
 * Parcela do investimento do H5 direcionada ao Meeting Broker (canal
 * Enterprise-only). Referencia a regra de P6 do H5 ("Ent: 10% budget →
 * MeetingBroker"). Não é uma premissa armazenada — fica como constante nomeada.
 */
export const MB_BUDGET_PCT = 10;

/** Opções comuns para gerar a curva de target. */
export type CurvaOpts = {
  /** Realizado mensal da unidade (jan/26 → dez/26). Default: vazio. */
  realizadoHistorico?: RealizadoMensal[];
  /** Data de inauguração da unidade (YYYY-MM-DD). Define o mês-âncora dentro de 2026. */
  dataInicio?: string | null;
};

// ============================================================
// 1. Curva de target — 12 meses de 2026
// ============================================================

export type LinhaTarget = {
  /** Mês ISO `"2026-01" .. "2026-12"`. */
  mes: string;
  target: number;
  /** Horizonte aplicado — sempre o horizonteAtual da unidade (fixo no ano). */
  horizonte: Horizonte;
  /** True se o mês já está fechado (vem do realizado, não da projeção). */
  isFechado: boolean;
};

/**
 * Gera a curva de target dos 12 meses de 2026.
 *
 * - Se a unidade tem realizado (`faturamento > 0` em algum mês fechado), usa o
 *   Forecast: meses fechados = realizado, meses futuros = projeção a partir do
 *   mês fechado mais recente × `crescMensalPct` do `horizonteAtual`.
 * - Caso contrário (planejamento "do zero"), ancora na `faixaMin` do
 *   horizonteAtual no mês de início da unidade e capitaliza pela mesma taxa.
 */
export function calcularCurvaTarget(
  horizontes: HorizonteCrescimento[],
  horizonteAtual: Horizonte,
  opts: CurvaOpts = {},
): LinhaTarget[] {
  const realizado = opts.realizadoHistorico ?? [];
  const linhas = calcularRealizadoVsProjetado(
    realizado,
    horizontes,
    horizonteAtual,
    { dataInicio: opts.dataInicio ?? null },
  );
  const temBase = linhas.some((l) => l.projetado > 0);
  if (temBase) {
    return linhas.map((l) => ({
      mes: l.mes,
      target: l.projetado,
      horizonte: horizonteAtual,
      isFechado: !l.isProjetado,
    }));
  }
  // Fallback: planejamento sem realizado ainda → faixaMin do horizonteAtual.
  const h = horizontes.find((x) => x.h === horizonteAtual);
  const ancora = h?.faixaMin ?? 0;
  const taxa = h?.crescMensalPct ?? 0;
  const mesAncora = getMesAncora(opts.dataInicio);
  const meses = MESES_ANO_2026 as readonly string[];
  const idxAnc = meses.indexOf(mesAncora);
  return meses.map((mes, idx) => ({
    mes,
    target: idx < idxAnc ? 0 : Math.round(ancora * Math.pow(1 + taxa / 100, idx - idxAnc)),
    horizonte: horizonteAtual,
    isFechado: false,
  }));
}

// ============================================================
// 2-5. Funil reverso por mês × tier × canal
// ============================================================

/** Valores de um canal (LB/BB/MB/Out) para um tier num mês. */
export type CanalValores = {
  won: number;
  leads: number;
  invest: number;
  receita: number;
};

const zeroCanal = (): CanalValores => ({ won: 0, leads: 0, invest: 0, receita: 0 });

/** Detalhe do funil reverso por mês × tier (espelha a planilha "Canal × Tier"). */
export type LinhaCanalTier = {
  mes: string;
  horizonte: Horizonte;
  tier: Tier;
  lb: CanalValores;
  bb: CanalValores;
  mb: CanalValores;
  out: CanalValores;
  totalWon: number;
  totalReceita: number;
};

function byTier<T extends { tier: Tier }>(arr: T[]): Map<Tier, T> {
  return new Map(arr.map((r) => [r.tier, r] as const));
}

/** Conversão acumulada do funil longo inbound (L→MQL→SQL→SAL→Won). */
function convInbound(c: ConversaoInbound | undefined): number {
  if (!c) return 0;
  return (c.cr1 / 100) * (c.cr2 / 100) * (c.cr3 / 100) * (c.cr4 / 100);
}
/** Conversão até SQL no funil inbound (L→MQL→SQL) — para a contagem de SQLs. */
function convInboundSql(c: ConversaoInbound | undefined): number {
  if (!c) return 0;
  return (c.cr1 / 100) * (c.cr2 / 100);
}
/** Conversão acumulada do funil curto outbound (L→SQL→SAL→Won). */
function convOutbound(c: ConversaoOutbound | undefined): number {
  if (!c) return 0;
  return (c.cr1 / 100) * (c.cr3 / 100) * (c.cr4 / 100);
}

/**
 * Calcula o detalhe mês × tier × canal a partir das premissas da entidade e do
 * horizonteAtual da unidade. Mesma lógica para meses fechados e futuros — o que
 * muda é a origem do target (realizado vs. projeção), via `calcularCurvaTarget`.
 *
 * Como o horizonte é fixo no ano, P6 (pctProducao/splitLb/splitBb/bbPiso), P4
 * (distSplit) e P16 (mix outbound) são calculados uma única vez.
 */
export function calcularCanalTier(
  blocks: PremissasBlocks,
  horizonteAtual: Horizonte,
  opts: CurvaOpts = {},
): LinhaCanalTier[] {
  const curva = calcularCurvaTarget(blocks.horizontes, horizonteAtual, opts);

  const p6 = blocks.investimentoMidia.find((i) => i.h === horizonteAtual);
  const pcts = blocks.distSplit.find((s) => s.h === horizonteAtual)?.pcts ?? {};
  const mix = blocks.mixSubcanais.find((m) => m.h === horizonteAtual);
  const tierInfo = byTier(blocks.tiersCliente);
  const lbByTier = byTier(blocks.conversoesInbound.leadBroker);
  const bbByTier = byTier(blocks.conversoesInbound.blackBox);
  const outByTierBySub = new Map(
    SUBCANAIS_OUTBOUND.map((s) => [s, byTier(blocks.conversoesOutbound[s])] as const),
  );
  const mb = blocks.conversoesInbound.meetingBroker;

  const splitLb = p6?.splitLb ?? 100;
  const splitBb = p6?.splitBb ?? 0;
  const bbOn = splitBb > 0 && (p6?.bbPiso ?? 0) > 0;
  const somaSplit = bbOn ? splitLb + splitBb : splitLb || 1;
  const enterpriseAtivo = (pcts.Enterprise ?? 0) > 0;
  const pctProducao = (p6?.pctProducao ?? 0) / 100;

  const convOutPonderada = (tier: Tier): number => {
    if (!mix) return 0;
    let acc = 0;
    for (const s of SUBCANAIS_OUTBOUND) {
      const peso = (mix[s] ?? 0) / 100;
      if (peso <= 0) continue;
      acc += peso * convOutbound(outByTierBySub.get(s)!.get(tier));
    }
    return acc;
  };

  const linhas: LinhaCanalTier[] = [];

  for (const { mes, target } of curva) {
    const investTotal = target * pctProducao;
    const mbBudgetMes = enterpriseAtivo ? investTotal * (MB_BUDGET_PCT / 100) : 0;
    const mediaBudget = investTotal - mbBudgetMes;
    const lbBudgetMes = bbOn ? mediaBudget * (splitLb / somaSplit) : mediaBudget;
    const bbBudgetMes = bbOn ? mediaBudget * (splitBb / somaSplit) : 0;

    // Inbound por tier → acumula receita inbound do mês.
    const porTier: Array<{ tier: Tier; lb: CanalValores; bb: CanalValores; mb: CanalValores }> = [];
    let recInboundMes = 0;
    for (const tier of TIER_ORDER) {
      const share = (pcts[tier] ?? 0) / 100;
      if (share <= 0) continue;
      const info = tierInfo.get(tier);
      const tcv = info?.tcvProdCom ?? 0;

      const lb = zeroCanal();
      lb.invest = lbBudgetMes * share;
      lb.leads = info && info.cplLb > 0 ? lb.invest / info.cplLb : 0;
      lb.won = lb.leads * convInbound(lbByTier.get(tier));
      lb.receita = lb.won * tcv;

      const bb = zeroCanal();
      bb.invest = bbBudgetMes * share;
      bb.leads = info && info.cplBb > 0 ? bb.invest / info.cplBb : 0;
      bb.won = bb.leads * convInbound(bbByTier.get(tier));
      bb.receita = bb.won * tcv;

      const mbCanal = zeroCanal();
      if (tier === "Enterprise" && mbBudgetMes > 0 && mb.custoSql > 0) {
        mbCanal.invest = mbBudgetMes;
        const sqls = mbCanal.invest / mb.custoSql;
        mbCanal.leads = sqls; // MB conta SQLs, não leads de topo
        mbCanal.won = sqls * (mb.cr3 / 100) * (mb.cr4 / 100);
        mbCanal.receita = mbCanal.won * tcv;
      }

      recInboundMes += lb.receita + bb.receita + mbCanal.receita;
      porTier.push({ tier, lb, bb, mb: mbCanal });
    }

    // Outbound = resíduo do target, distribuído por tier (split P4).
    const recOutboundMes = Math.max(0, target - recInboundMes);

    for (const linha of porTier) {
      const share = (pcts[linha.tier] ?? 0) / 100;
      const info = tierInfo.get(linha.tier);
      const tcv = info?.tcvProdCom ?? 0;
      const out = zeroCanal();
      out.receita = recOutboundMes * share;
      out.won = tcv > 0 ? out.receita / tcv : 0;
      const conv = convOutPonderada(linha.tier);
      out.leads = conv > 0 ? out.won / conv : 0;

      const totalWon = linha.lb.won + linha.bb.won + linha.mb.won + out.won;
      const totalReceita = linha.lb.receita + linha.bb.receita + linha.mb.receita + out.receita;

      linhas.push({
        mes,
        horizonte: horizonteAtual,
        tier: linha.tier,
        lb: linha.lb,
        bb: linha.bb,
        mb: linha.mb,
        out,
        totalWon,
        totalReceita,
      });
    }
  }

  return linhas;
}

// ============================================================
// 6. Ramp-up agregado por mês (+ produto P3 + headcount P17)
// ============================================================

/** Volume do funil que cada cargo processa — base do headcount (P17). */
const STAGE_BY_CARGO: Record<string, "leadsTotal" | "leadsOb" | "leadsIb" | "sqls" | "won"> = {
  LDR: "leadsTotal",
  BDR: "leadsOb",
  SDR: "sqls",
  CLOSER: "won",
  KAM: "won",
};

export type LinhaRampUp = {
  /** Mês ISO `"2026-01" .. "2026-12"`. */
  mes: string;
  horizonte: Horizonte;
  target: number;
  isFechado: boolean;
  investLb: number;
  investBb: number;
  investMb: number;
  investTotal: number;
  /** investTotal ÷ target × 100. */
  pctInvest: number;
  recInbound: number;
  recOutbound: number;
  recTotal: number;
  /** recTotal − target (overshoot). */
  delta: number;
  recPorTier: Record<Tier, number>;
  saber: number;
  ter: number;
  executar: number;
  leadsIb: number;
  leadsOb: number;
  sqlsTotal: number;
  /** Headcount por cargo (de P17). */
  headcount: Record<string, number>;
  hcTotal: number;
};

export function calcularRampUp(
  blocks: PremissasBlocks,
  horizonteAtual: Horizonte,
  opts: CurvaOpts = {},
): LinhaRampUp[] {
  const detalhe = calcularCanalTier(blocks, horizonteAtual, opts);
  const curva = calcularCurvaTarget(blocks.horizontes, horizonteAtual, opts);
  const receitaByTier = byTier(blocks.receitaProduto);
  const metricas = blocks.metricasOperacionais;

  const lbByTier = byTier(blocks.conversoesInbound.leadBroker);
  const bbByTier = byTier(blocks.conversoesInbound.blackBox);
  const cr1OutByTier = new Map<Tier, number>(
    TIER_ORDER.map((tier) => [tier, mediaCr1Outbound(blocks, tier)] as const),
  );
  const targetInfo = new Map(curva.map((c) => [c.mes, c] as const));

  // Agrupa o detalhe por mês.
  const porMes = new Map<string, LinhaCanalTier[]>();
  for (const d of detalhe) {
    const arr = porMes.get(d.mes) ?? [];
    arr.push(d);
    porMes.set(d.mes, arr);
  }

  const linhas: LinhaRampUp[] = [];
  // Garante a ordem cronológica dos 12 meses (mesmo que algum mês não tenha tiers ativos).
  for (const mes of MESES_ANO_2026 as readonly string[]) {
    const tiers = porMes.get(mes) ?? [];
    const info = targetInfo.get(mes);
    const target = info?.target ?? 0;
    const isFechado = info?.isFechado ?? false;

    let investLb = 0, investBb = 0, investMb = 0;
    let recInbound = 0, recOutbound = 0;
    let leadsIb = 0, leadsOb = 0, sqlsTotal = 0;
    let saber = 0, ter = 0, executar = 0;
    const recPorTier = { Tiny: 0, Small: 0, Medium: 0, Large: 0, Enterprise: 0 } as Record<Tier, number>;

    for (const d of tiers) {
      investLb += d.lb.invest;
      investBb += d.bb.invest;
      investMb += d.mb.invest;
      recInbound += d.lb.receita + d.bb.receita + d.mb.receita;
      recOutbound += d.out.receita;
      recPorTier[d.tier] += d.totalReceita;

      leadsIb += d.lb.leads + d.bb.leads;
      leadsOb += d.out.leads;

      sqlsTotal += d.lb.leads * convInboundSql(lbByTier.get(d.tier));
      sqlsTotal += d.bb.leads * convInboundSql(bbByTier.get(d.tier));
      sqlsTotal += d.mb.leads;
      sqlsTotal += d.out.leads * (cr1OutByTier.get(d.tier) ?? 0);

      const rp = receitaByTier.get(d.tier);
      if (rp) {
        saber += d.totalReceita * (rp.saberPct / 100);
        ter += d.totalReceita * (rp.terPct / 100);
        executar += d.totalReceita * (rp.execPct / 100);
      }
    }

    const investTotal = investLb + investBb + investMb;
    const recTotal = recInbound + recOutbound;
    const leadsTotal = leadsIb + leadsOb;
    const wonTotal = tiers.reduce((acc, d) => acc + d.totalWon, 0);

    // Headcount (P17) por cargo.
    const headcount: Record<string, number> = {};
    let hcTotal = 0;
    for (const m of metricas) {
      if (m.wipLimit <= 0) continue;
      const stage = STAGE_BY_CARGO[m.cargo.toUpperCase()] ?? "leadsTotal";
      const volume =
        stage === "leadsTotal" ? leadsTotal
        : stage === "leadsOb" ? leadsOb
        : stage === "leadsIb" ? leadsIb
        : stage === "sqls" ? sqlsTotal
        : /* won */ wonTotal;
      const hc = volume > 0 ? Math.ceil(volume / m.wipLimit) : 0;
      headcount[m.cargo] = hc;
      hcTotal += hc;
    }

    linhas.push({
      mes,
      horizonte: horizonteAtual,
      target,
      isFechado,
      investLb,
      investBb,
      investMb,
      investTotal,
      pctInvest: target > 0 ? (investTotal / target) * 100 : 0,
      recInbound,
      recOutbound,
      recTotal,
      delta: recTotal - target,
      recPorTier,
      saber,
      ter,
      executar,
      leadsIb,
      leadsOb,
      sqlsTotal,
      headcount,
      hcTotal,
    });
  }

  return linhas;
}

/**
 * cr1 (L→SQL) outbound médio dos subcanais para um tier — aproximação simples
 * (média não ponderada) usada só para contar SQLs outbound no headline.
 */
function mediaCr1Outbound(blocks: PremissasBlocks, tier: Tier): number {
  let soma = 0;
  let n = 0;
  for (const s of SUBCANAIS_OUTBOUND) {
    const c = byTier(blocks.conversoesOutbound[s]).get(tier);
    if (c) {
      soma += c.cr1 / 100;
      n++;
    }
  }
  return n > 0 ? soma / n : 0;
}

// ============================================================
// 7. Por sub-canal (LB, BB, MB + 5 subcanais outbound) — agregado por mês
//
// Granularidade: drop tier, mantém sub-canal. Para Outbound, re-splitta o
// agregado por mix P16 e usa as conversões específicas do subcanal × tier
// pra back-out de leads/won/receita.
// ============================================================

export type SubCanalKey =
  | "lead_broker"
  | "black_box"
  | "meeting_broker"
  | "out_indicacao"
  | "out_eventos"
  | "out_recovery"
  | "out_recomendacao"
  | "out_prospeccao";

export type CanalGrupo = "inbound" | "outbound";

export const SUB_CANAIS: ReadonlyArray<{
  key: SubCanalKey;
  canal: CanalGrupo;
  label: string;
  /** Rótulo da 2ª métrica: Leads (LB/BB/Outbound) ou SQL (MB). */
  leadLabel: "Leads" | "SQL";
}> = [
  { key: "lead_broker", canal: "inbound", label: "Lead Broker", leadLabel: "Leads" },
  { key: "black_box", canal: "inbound", label: "Black Box", leadLabel: "Leads" },
  { key: "meeting_broker", canal: "inbound", label: "Meeting Broker", leadLabel: "SQL" },
  { key: "out_indicacao", canal: "outbound", label: "Indicação", leadLabel: "Leads" },
  { key: "out_eventos", canal: "outbound", label: "Eventos", leadLabel: "Leads" },
  { key: "out_recovery", canal: "outbound", label: "Recovery", leadLabel: "Leads" },
  { key: "out_recomendacao", canal: "outbound", label: "Recomendação", leadLabel: "Leads" },
  { key: "out_prospeccao", canal: "outbound", label: "Prospecção", leadLabel: "Leads" },
];

export type LinhaSubCanal = {
  mes: string;
  subcanal: SubCanalKey;
  won: number;
  /** Leads (LB/BB/Outbound) ou SQLs (MB). */
  leads: number;
  invest: number;
  receita: number;
  /** Decomposição da receita por categoria de produto (P3). */
  saber: number;
  ter: number;
  executar: number;
};

function addCanal(a: CanalValores, b: CanalValores): void {
  a.won += b.won;
  a.leads += b.leads;
  a.invest += b.invest;
  a.receita += b.receita;
}

/**
 * Agrega o detalhe por sub-canal (somando tiers). Para os 5 subcanais outbound,
 * re-splitta a receita/leads/won do outbound agregado usando o mix P16 e as
 * conversões específicas de cada subcanal × tier.
 *
 * Identidade preservada: Σ won_subcanal = won_outbound_total da unidade (o mix
 * fatia os leads e as conversões fatiam o won proporcionalmente).
 */
type SubAcc = {
  won: number;
  leads: number;
  invest: number;
  receita: number;
  saber: number;
  ter: number;
  executar: number;
};
const zeroSub = (): SubAcc => ({
  won: 0, leads: 0, invest: 0, receita: 0, saber: 0, ter: 0, executar: 0,
});

export function calcularPorSubCanal(
  blocks: PremissasBlocks,
  horizonteAtual: Horizonte,
  opts: CurvaOpts = {},
): LinhaSubCanal[] {
  const detalhe = calcularCanalTier(blocks, horizonteAtual, opts);
  const tierInfo = byTier(blocks.tiersCliente);
  const receitaByTier = byTier(blocks.receitaProduto);
  const mix = blocks.mixSubcanais.find((m) => m.h === horizonteAtual);
  const outByTierBySub = new Map(
    SUBCANAIS_OUTBOUND.map((s) => [s, byTier(blocks.conversoesOutbound[s])] as const),
  );

  const porMes = new Map<string, LinhaCanalTier[]>();
  for (const d of detalhe) {
    const arr = porMes.get(d.mes) ?? [];
    arr.push(d);
    porMes.set(d.mes, arr);
  }

  const resultado: LinhaSubCanal[] = [];
  for (const mes of MESES_ANO_2026 as readonly string[]) {
    const tiers = porMes.get(mes) ?? [];

    // Acumuladores por sub-canal (com produto P3).
    const acc: Record<SubCanalKey, SubAcc> = {
      lead_broker: zeroSub(),
      black_box: zeroSub(),
      meeting_broker: zeroSub(),
      out_indicacao: zeroSub(),
      out_eventos: zeroSub(),
      out_recovery: zeroSub(),
      out_recomendacao: zeroSub(),
      out_prospeccao: zeroSub(),
    };

    for (const t of tiers) {
      const rp = receitaByTier.get(t.tier);
      const saberP = (rp?.saberPct ?? 0) / 100;
      const terP = (rp?.terPct ?? 0) / 100;
      const execP = (rp?.execPct ?? 0) / 100;

      // Inbound: soma os tiers em cada canal e decompõe a receita por produto.
      const addInbound = (c: CanalValores, key: SubCanalKey) => {
        const a = acc[key];
        a.won += c.won;
        a.leads += c.leads;
        a.invest += c.invest;
        a.receita += c.receita;
        a.saber += c.receita * saberP;
        a.ter += c.receita * terP;
        a.executar += c.receita * execP;
      };
      addInbound(t.lb, "lead_broker");
      addInbound(t.bb, "black_box");
      addInbound(t.mb, "meeting_broker");

      // Outbound: re-splitta por subcanal usando o mix do horizonte.
      const tcv = tierInfo.get(t.tier)?.tcvProdCom ?? 0;
      for (const sub of SUBCANAIS_OUTBOUND) {
        const peso = (mix?.[sub] ?? 0) / 100;
        const leadsTierSub = t.out.leads * peso;
        const conv = convOutbound(outByTierBySub.get(sub)!.get(t.tier));
        const wonTierSub = leadsTierSub * conv;
        const receitaTierSub = wonTierSub * tcv;
        const key = `out_${sub}` as SubCanalKey;
        const a = acc[key];
        a.leads += leadsTierSub;
        a.won += wonTierSub;
        a.receita += receitaTierSub;
        a.saber += receitaTierSub * saberP;
        a.ter += receitaTierSub * terP;
        a.executar += receitaTierSub * execP;
        // invest fica em 0 — outbound não consome mídia.
      }
    }

    for (const sub of SUB_CANAIS) {
      resultado.push({ mes, subcanal: sub.key, ...acc[sub.key] });
    }
  }
  return resultado;
}

// ============================================================
// Agregação Matriz — soma das unidades por mês (Jan..Dez)
//
// Cada unidade já calcula com seu próprio horizonteAtual e sua própria âncora;
// o agregador só soma mês a mês. A "horizonte" exibida na linha agregada é a da
// primeira unidade encontrada — placeholder, no consolidado a coluna perde
// significado individual (units podem estar em horizontes diferentes).
// ============================================================

export function agregarRampUpMatriz(conjuntos: LinhaRampUp[][]): LinhaRampUp[] {
  const acc = new Map<string, LinhaRampUp>();
  for (const linhas of conjuntos) {
    for (const l of linhas) {
      const cur = acc.get(l.mes);
      if (!cur) {
        acc.set(l.mes, {
          ...l,
          recPorTier: { ...l.recPorTier },
          headcount: { ...l.headcount },
        });
        continue;
      }
      cur.target += l.target;
      cur.investLb += l.investLb;
      cur.investBb += l.investBb;
      cur.investMb += l.investMb;
      cur.investTotal += l.investTotal;
      cur.recInbound += l.recInbound;
      cur.recOutbound += l.recOutbound;
      cur.recTotal += l.recTotal;
      cur.delta += l.delta;
      cur.saber += l.saber;
      cur.ter += l.ter;
      cur.executar += l.executar;
      cur.leadsIb += l.leadsIb;
      cur.leadsOb += l.leadsOb;
      cur.sqlsTotal += l.sqlsTotal;
      cur.hcTotal += l.hcTotal;
      for (const t of TIER_ORDER) cur.recPorTier[t] += l.recPorTier[t];
      for (const [cargo, hc] of Object.entries(l.headcount)) {
        cur.headcount[cargo] = (cur.headcount[cargo] ?? 0) + hc;
      }
    }
  }
  const linhas = [...acc.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  for (const l of linhas) l.pctInvest = l.target > 0 ? (l.investTotal / l.target) * 100 : 0;
  return linhas;
}

/** Soma `LinhaSubCanal` de várias unidades por (mes, subcanal). */
export function agregarPorSubCanalMatriz(conjuntos: LinhaSubCanal[][]): LinhaSubCanal[] {
  const acc = new Map<string, LinhaSubCanal>();
  const ord = SUB_CANAIS.map((s) => s.key);
  for (const linhas of conjuntos) {
    for (const l of linhas) {
      const k = `${l.mes}|${l.subcanal}`;
      const cur = acc.get(k);
      if (!cur) {
        acc.set(k, { ...l });
        continue;
      }
      cur.won += l.won;
      cur.leads += l.leads;
      cur.invest += l.invest;
      cur.receita += l.receita;
      cur.saber += l.saber;
      cur.ter += l.ter;
      cur.executar += l.executar;
    }
  }
  return [...acc.values()].sort((a, b) => {
    const cmp = a.mes.localeCompare(b.mes);
    return cmp !== 0 ? cmp : ord.indexOf(a.subcanal) - ord.indexOf(b.subcanal);
  });
}

export function agregarCanalTierMatriz(conjuntos: LinhaCanalTier[][]): LinhaCanalTier[] {
  const key = (mes: string, tier: Tier) => `${mes}|${tier}`;
  const acc = new Map<string, LinhaCanalTier>();
  const addCanal = (a: CanalValores, b: CanalValores) => {
    a.won += b.won;
    a.leads += b.leads;
    a.invest += b.invest;
    a.receita += b.receita;
  };
  for (const linhas of conjuntos) {
    for (const l of linhas) {
      const k = key(l.mes, l.tier);
      const cur = acc.get(k);
      if (!cur) {
        acc.set(k, {
          ...l,
          lb: { ...l.lb },
          bb: { ...l.bb },
          mb: { ...l.mb },
          out: { ...l.out },
        });
        continue;
      }
      addCanal(cur.lb, l.lb);
      addCanal(cur.bb, l.bb);
      addCanal(cur.mb, l.mb);
      addCanal(cur.out, l.out);
      cur.totalWon += l.totalWon;
      cur.totalReceita += l.totalReceita;
    }
  }
  return [...acc.values()].sort((a, b) =>
    a.mes.localeCompare(b.mes) || TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier),
  );
}
