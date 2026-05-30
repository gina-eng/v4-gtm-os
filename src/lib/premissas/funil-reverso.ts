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

/**
 * Resolve o mês-âncora dentro de 2026. Meses antes desse marco ficam fora da
 * operação da unidade — premissas (incluindo headcount) não devem ser
 * computadas neles, ainda que existam overrides residuais em P6.
 */
function ancoraDeUnidade(opts: CurvaOpts): string {
  return getMesAncora(opts.dataInicio);
}

const TIER_ORDER: Tier[] = ["Tiny", "Small", "Medium", "Large", "Enterprise"];

const SUBCANAIS_OUTBOUND = [
  "indicacao",
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
  /**
   * Horizonte efetivo do mês — promovido automaticamente quando a unidade
   * ultrapassa `faixaMax` (não regride pra baixo do `horizonteAtual` da
   * unidade). Todas as premissas dependentes (P6, P4, P16, P1) usam esse.
   */
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
      // `horizonteAplicado` já vem promovido quando o patamar ultrapassa faixaMax;
      // fallback no horizonteAtual pra meses sem base (antes da âncora etc.).
      horizonte: l.horizonteAplicado ?? horizonteAtual,
      isFechado: !l.isProjetado,
    }));
  }
  // Fallback: planejamento sem realizado ainda → faixaMin do horizonteAtual,
  // capitalizando mês a mês. Promoção segue a mesma regra de
  // `calcularRealizadoVsProjetado`: 3 meses CONSECUTIVOS acima do faixaMax
  // do horizonte vivo atual pra promover (subindo só um degrau por vez).
  const h = horizontes.find((x) => x.h === horizonteAtual);
  const ancora = h?.faixaMin ?? 0;
  const horizontesByH = new Map(horizontes.map((c) => [c.h, c] as const));
  const mesAncora = getMesAncora(opts.dataInicio);
  const HORIZONTE_ORDER: Horizonte[] = ["H1", "H2", "H3", "H4", "H5"];
  const idxH = (x: Horizonte) => HORIZONTE_ORDER.indexOf(x);
  const MESES_PARA_PROMOVER = 3;
  const meses = MESES_ANO_2026 as readonly string[];
  const idxAnc = meses.indexOf(mesAncora);
  const out: LinhaTarget[] = [];
  let valorAnterior = 0;
  let horizonteVivo: Horizonte = horizonteAtual;
  let mesesAcimaConsec = 0;
  for (let idx = 0; idx < meses.length; idx++) {
    const mes = meses[idx];
    if (idx < idxAnc) {
      out.push({ mes, target: 0, horizonte: horizonteAtual, isFechado: false });
      continue;
    }
    let valor: number;
    if (idx === idxAnc) {
      valor = ancora;
    } else {
      const taxa = horizontesByH.get(horizonteVivo)?.crescMensalPct ?? 0;
      valor = Math.round(valorAnterior * (1 + taxa / 100));
    }
    valorAnterior = valor;
    out.push({
      mes,
      target: valor,
      horizonte: horizonteVivo,
      isFechado: false,
    });
    // Avalia 3-meses-consecutivos contra o faixaMax do horizonte vivo.
    const config = horizontesByH.get(horizonteVivo);
    if (config && config.faixaMax !== null) {
      if (valor > config.faixaMax) {
        mesesAcimaConsec += 1;
        if (mesesAcimaConsec >= MESES_PARA_PROMOVER) {
          const proxIdx = idxH(horizonteVivo) + 1;
          if (proxIdx < HORIZONTE_ORDER.length) {
            horizonteVivo = HORIZONTE_ORDER[proxIdx];
          }
          mesesAcimaConsec = 0;
        }
      } else {
        mesesAcimaConsec = 0;
      }
    }
  }
  return out;
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
  /** Eventos — inbound de funil curto (invest → SQL → SAL → WON). */
  ev: CanalValores;
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
 * Calcula o detalhe mês × tier × canal a partir das premissas da entidade.
 *
 * O horizonte é **efetivo por mês** (ver `calcularCurvaTarget`): se a unidade
 * ultrapassa `faixaMax` em algum mês fechado, os meses seguintes já operam no
 * horizonte de cima. P4 (distSplit), P16 (mix outbound), P6 (splitLb/splitBb/
 * pctProducao) são reavaliados por horizonte em cada mês.
 *
 * Investimento total mensal:
 * - Meses **fechados**: prioriza `realizadoHistorico.investido` (o que a
 *   unidade efetivamente gastou); cai em override ou fallback se ainda 0.
 * - Meses **futuros**: override em `investimentoMensal` (R$ absoluto) tem
 *   precedência sobre o fallback `target × pctProducao` do horizonte do mês.
 */
export function calcularCanalTier(
  blocks: PremissasBlocks,
  horizonteAtual: Horizonte,
  opts: CurvaOpts = {},
): LinhaCanalTier[] {
  const curva = calcularCurvaTarget(blocks.horizontes, horizonteAtual, opts);

  // Caches por horizonte — montados sob demanda à medida que cada mês exige
  // um patamar diferente. Em ano sem promoção, vira efetivamente uma entrada.
  type PerHorizonte = {
    p6: ReturnType<PremissasBlocks["investimentoMidia"]["find"]>;
    pcts: Record<string, number>;
    mix: ReturnType<PremissasBlocks["mixSubcanais"]["find"]>;
    splitLb: number;
    splitBb: number;
    splitMt: number;
    splitEv: number;
    bbOn: boolean;
    mtOn: boolean;
    evOn: boolean;
    somaSplit: number;
    enterpriseAtivo: boolean;
    pctProducaoFallback: number;
  };
  const perH = new Map<Horizonte, PerHorizonte>();
  const getPerH = (h: Horizonte): PerHorizonte => {
    const cached = perH.get(h);
    if (cached) return cached;
    const p6 = blocks.investimentoMidia.find((i) => i.h === h);
    const pcts = blocks.distSplit.find((s) => s.h === h)?.pcts ?? {};
    const mix = blocks.mixSubcanais.find((m) => m.h === h);
    const splitLb = p6?.splitLb ?? 100;
    const splitBb = p6?.splitBb ?? 0;
    const splitMt = p6?.splitMt ?? 0;
    const splitEv = p6?.splitEv ?? 0;
    const enterpriseAtivo = (pcts.Enterprise ?? 0) > 0;
    const bbOn = splitBb > 0 && (p6?.bbPiso ?? 0) > 0;
    const mtOn = splitMt > 0 && enterpriseAtivo;
    const evOn = splitEv > 0;
    const somaSplit =
      splitLb +
        (bbOn ? splitBb : 0) +
        (mtOn ? splitMt : 0) +
        (evOn ? splitEv : 0) || 1;
    const pctProducaoFallback = (p6?.pctProducao ?? 0) / 100;
    const value: PerHorizonte = {
      p6,
      pcts,
      mix,
      splitLb,
      splitBb,
      splitMt,
      splitEv,
      bbOn,
      mtOn,
      evOn,
      somaSplit,
      enterpriseAtivo,
      pctProducaoFallback,
    };
    perH.set(h, value);
    return value;
  };

  const tierInfo = byTier(blocks.tiersCliente);
  const lbByTier = byTier(blocks.conversoesInbound.leadBroker);
  const bbByTier = byTier(blocks.conversoesInbound.blackBox);
  const outByTierBySub = new Map(
    SUBCANAIS_OUTBOUND.map((s) => [s, byTier(blocks.conversoesOutbound[s])] as const),
  );
  const mb = blocks.conversoesInbound.meetingBroker;
  const eventosCusto = blocks.conversoesInbound.eventosCusto;
  const eventosConvByTier = byTier(blocks.conversoesInbound.eventos);

  // Investimento real declarado no setup (meses fechados); override manual
  // (`investimentoMensal`) só se aplica a meses futuros — em fechado, o que
  // valeu foi o que efetivamente foi gasto.
  const investidoRealByMes = new Map<string, number>(
    (opts.realizadoHistorico ?? []).map((r) => [r.mes, r.investido] as const),
  );
  const investByMes = new Map<string, number>(
    blocks.investimentoMensal.map((p) => [p.mes, p.investimento] as const),
  );
  // Outbound proativo: volume mensal de leads = soma da capacidadePct/100 das
  // pessoas com cargo BDR × wipLimit de BDR (P17). Pra meses fechados, prefere
  // `realizado.leadsOb` (o que o time efetivamente gerou).
  const bdrMetric = blocks.metricasOperacionais.find(
    (m) => m.cargo.toUpperCase() === "BDR",
  );
  const wipBdr = bdrMetric?.wipLimit ?? 0;
  const capacidadeBdrMensal = blocks.timeComercial
    .filter((m) => m.cargo.toUpperCase() === "BDR")
    .reduce((acc, m) => acc + ((m.capacidadePct ?? 0) / 100) * wipBdr, 0);
  const leadsObRealByMes = new Map<string, number>(
    (opts.realizadoHistorico ?? []).map((r) => [r.mes, r.leadsOb] as const),
  );

  const convOutPonderada = (tier: Tier, mix: PerHorizonte["mix"]): number => {
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

  for (const { mes, target, horizonte, isFechado } of curva) {
    const ctx = getPerH(horizonte);
    // Prioridade: realizado > override > fallback. Em meses fechados, só usa
    // override/fallback se a unidade ainda não declarou investido > 0.
    const investidoReal = isFechado ? investidoRealByMes.get(mes) ?? 0 : 0;
    const override = investByMes.get(mes);
    const investTotal =
      investidoReal > 0
        ? investidoReal
        : override ?? target * ctx.pctProducaoFallback;
    // Splits LB/BB/MT/EV vivem em P6 e somam ≤ 100% do budget de mídia.
    // Fallback: se ninguém configurou splitMt mas há Enterprise ativo, MB
    // ainda recebe 10% (compatibilidade com versões anteriores).
    const splitMtEff = ctx.mtOn
      ? ctx.splitMt
      : ctx.enterpriseAtivo
        ? MB_BUDGET_PCT
        : 0;
    const somaSplitEff = ctx.mtOn
      ? ctx.somaSplit
      : ctx.somaSplit + (ctx.enterpriseAtivo ? MB_BUDGET_PCT : 0);
    const lbBudgetMes = investTotal * (ctx.splitLb / somaSplitEff);
    const bbBudgetMes = ctx.bbOn ? investTotal * (ctx.splitBb / somaSplitEff) : 0;
    const mbBudgetMes = splitMtEff > 0 ? investTotal * (splitMtEff / somaSplitEff) : 0;
    const evBudgetMes = ctx.evOn ? investTotal * (ctx.splitEv / somaSplitEff) : 0;

    // Inbound por tier → acumula receita inbound do mês.
    const porTier: Array<{
      tier: Tier;
      lb: CanalValores;
      bb: CanalValores;
      mb: CanalValores;
      ev: CanalValores;
    }> = [];
    let recInboundMes = 0;
    for (const tier of TIER_ORDER) {
      const share = (ctx.pcts[tier] ?? 0) / 100;
      if (share <= 0) continue;
      const info = tierInfo.get(tier);
      const tcv = info?.tcvBooking ?? 0;

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

      // Eventos (inbound funil curto: invest → SQL → SAL → WON) — para todos os
      // tiers. Custo por SQL = eventosCusto.custoSql (singleton); cr3/cr4 vêm do
      // bloco premissa_conversao_eventos do tier.
      const evCanal = zeroCanal();
      if (evBudgetMes > 0 && eventosCusto.custoSql > 0) {
        evCanal.invest = evBudgetMes * share;
        const sqls = evCanal.invest / eventosCusto.custoSql;
        evCanal.leads = sqls;
        const convEv = eventosConvByTier.get(tier);
        const cr3 = (convEv?.cr3 ?? 0) / 100;
        const cr4 = (convEv?.cr4 ?? 0) / 100;
        evCanal.won = sqls * cr3 * cr4;
        evCanal.receita = evCanal.won * tcv;
      }

      recInboundMes += lb.receita + bb.receita + mbCanal.receita + evCanal.receita;
      porTier.push({ tier, lb, bb, mb: mbCanal, ev: evCanal });
    }

    // Outbound proativo: volume de leads OB = capacidade do time BDR (ou
    // realizado.leadsOb pra meses fechados). NÃO é resíduo do target — a
    // receita total (inbound + outbound) pode ficar acima ou abaixo do target.
    // Em meses antes da operação (target=0), zera também — sem time atuando.
    const leadsObReal = isFechado ? leadsObRealByMes.get(mes) ?? 0 : 0;
    const leadsObTotalMes =
      leadsObReal > 0 ? leadsObReal : target > 0 ? capacidadeBdrMensal : 0;

    for (const linha of porTier) {
      const share = (ctx.pcts[linha.tier] ?? 0) / 100;
      const info = tierInfo.get(linha.tier);
      const tcv = info?.tcvBooking ?? 0;
      const out = zeroCanal();
      out.leads = leadsObTotalMes * share;
      const conv = convOutPonderada(linha.tier, ctx.mix);
      out.won = out.leads * conv;
      out.receita = out.won * tcv;

      const totalWon =
        linha.lb.won + linha.bb.won + linha.mb.won + linha.ev.won + out.won;
      const totalReceita =
        linha.lb.receita +
        linha.bb.receita +
        linha.mb.receita +
        linha.ev.receita +
        out.receita;

      linhas.push({
        mes,
        horizonte,
        tier: linha.tier,
        lb: linha.lb,
        bb: linha.bb,
        mb: linha.mb,
        ev: linha.ev,
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

  const mesAncora = ancoraDeUnidade(opts);
  // Map de realizado pra sobrescrever faturamento/leads em meses fechados —
  // o que o usuário entrou no setup tem prioridade sobre o que o funil calcula.
  const realizadoByMes = new Map<string, RealizadoMensal>();
  for (const r of opts.realizadoHistorico ?? []) realizadoByMes.set(r.mes, r);
  const linhas: LinhaRampUp[] = [];
  // Garante a ordem cronológica dos 12 meses (mesmo que algum mês não tenha tiers ativos).
  for (const mes of MESES_ANO_2026 as readonly string[]) {
    const tiers = porMes.get(mes) ?? [];
    const info = targetInfo.get(mes);
    const target = info?.target ?? 0;
    const isFechado = info?.isFechado ?? false;
    const realMes = realizadoByMes.get(mes);
    // Meses antes da abertura da unidade: HC sempre zero, independente do
    // que sobrou em P6/realizado. A curva já zera target, mas overrides
    // residuais no investimentoMensal podiam vazar volume → headcount.
    const isPreOperacao = mes < mesAncora;

    let investLb = 0, investBb = 0, investMb = 0, investEv = 0;
    let recInbound = 0, recOutbound = 0;
    let leadsIb = 0, leadsOb = 0, sqlsTotal = 0;
    let saber = 0, ter = 0, executar = 0;
    const recPorTier = { Tiny: 0, Small: 0, Medium: 0, Large: 0, Enterprise: 0 } as Record<Tier, number>;

    for (const d of tiers) {
      investLb += d.lb.invest;
      investBb += d.bb.invest;
      investMb += d.mb.invest;
      investEv += d.ev.invest;
      recInbound += d.lb.receita + d.bb.receita + d.mb.receita + d.ev.receita;
      recOutbound += d.out.receita;
      recPorTier[d.tier] += d.totalReceita;

      leadsIb += d.lb.leads + d.bb.leads;
      leadsOb += d.out.leads;

      sqlsTotal += d.lb.leads * convInboundSql(lbByTier.get(d.tier));
      sqlsTotal += d.bb.leads * convInboundSql(bbByTier.get(d.tier));
      sqlsTotal += d.mb.leads;
      sqlsTotal += d.ev.leads; // Eventos: d.ev.leads já é a contagem de SQLs.
      sqlsTotal += d.out.leads * (cr1OutByTier.get(d.tier) ?? 0);

      const rp = receitaByTier.get(d.tier);
      if (rp) {
        saber += d.totalReceita * (rp.saberPct / 100);
        ter += d.totalReceita * (rp.terPct / 100);
        executar += d.totalReceita * (rp.execPct / 100);
      }
    }

    const investTotal = investLb + investBb + investMb + investEv;
    let recTotal = recInbound + recOutbound;
    // Sobrescrita pelo realizado do usuário (meses fechados): o que ele
    // declarou no setup é o número que tem que aparecer, não o que o funil
    // teria calculado. Faz o split inbound/outbound + por tier/produto
    // proporcionalmente ao que o funil deu pra preservar consistência.
    if (isFechado && realMes && realMes.faturamento > 0 && recTotal > 0) {
      const scale = realMes.faturamento / recTotal;
      recInbound *= scale;
      recOutbound *= scale;
      saber *= scale;
      ter *= scale;
      executar *= scale;
      for (const tier of TIER_ORDER) {
        recPorTier[tier] *= scale;
      }
      recTotal = realMes.faturamento;
    } else if (isFechado && realMes && realMes.faturamento > 0 && recTotal === 0) {
      // Funil zerou mas o usuário declarou faturamento — exibe o declarado mesmo
      // sem decomposição (não temos como split sem o motor do funil rodando).
      recTotal = realMes.faturamento;
    }
    // Leads: usa o declarado pelo usuário em meses fechados quando disponível.
    if (isFechado && realMes) {
      if ((realMes.leadsIb ?? 0) > 0) leadsIb = realMes.leadsIb;
      if ((realMes.leadsOb ?? 0) > 0) leadsOb = realMes.leadsOb;
    }
    const leadsTotal = leadsIb + leadsOb;
    const wonTotal = tiers.reduce((acc, d) => acc + d.totalWon, 0);

    // Headcount (P17) por cargo. Antes da abertura da unidade, fica zerado.
    const headcount: Record<string, number> = {};
    let hcTotal = 0;
    if (!isPreOperacao) {
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
    } else {
      for (const m of metricas) headcount[m.cargo] = 0;
    }

    linhas.push({
      mes,
      // Horizonte efetivo do mês (já promovido se a unidade ultrapassou faixaMax).
      horizonte: info?.horizonte ?? horizonteAtual,
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
  | "eventos"
  | "out_indicacao"
  | "out_recovery"
  | "out_recomendacao"
  | "out_prospeccao";

export type CanalGrupo = "inbound" | "outbound";

export const SUB_CANAIS: ReadonlyArray<{
  key: SubCanalKey;
  canal: CanalGrupo;
  label: string;
  /** Rótulo da 2ª métrica: Leads (LB/BB/Outbound) ou SQL (MB/Eventos). */
  leadLabel: "Leads" | "SQL";
}> = [
  { key: "lead_broker", canal: "inbound", label: "Lead Broker", leadLabel: "Leads" },
  { key: "black_box", canal: "inbound", label: "Black Box", leadLabel: "Leads" },
  { key: "meeting_broker", canal: "inbound", label: "Meeting Broker", leadLabel: "SQL" },
  { key: "eventos", canal: "inbound", label: "Eventos", leadLabel: "SQL" },
  { key: "out_indicacao", canal: "outbound", label: "Indicação", leadLabel: "Leads" },
  { key: "out_recovery", canal: "outbound", label: "Recovery", leadLabel: "Leads" },
  { key: "out_recomendacao", canal: "outbound", label: "Recomendação", leadLabel: "Leads" },
  { key: "out_prospeccao", canal: "outbound", label: "Prospecção", leadLabel: "Leads" },
];

/**
 * Funil completo por sub-canal — mesma estrutura usada na visão por tier
 * (`LinhaTier`), mas agregando todos os tiers de um sub-canal.
 *
 * Etapas do funil variam por canal:
 * - LB/BB (inbound longo): Invest → Leads → MQL → SQL → SAL → Won
 * - MB (inbound curto): Invest → SQL (entrada direta) → SAL → Won
 * - Outbound: Leads → SQL → SAL → Won (sem invest, sem MQL)
 *
 * Etapas inaplicáveis ficam zeradas e a UI as oculta para o sub-canal.
 */
export type LinhaSubCanal = {
  mes: string;
  subcanal: SubCanalKey;
  invest: number;
  /** Leads (LB/BB/Outbound) ou SQLs (MB). */
  leads: number;
  mql: number;
  sql: number;
  sal: number;
  won: number;
  /** Decomposição do Won por produto (P3). */
  wonSaber: number;
  wonTer: number;
  wonExecutar: number;
  receita: number;
  /** Decomposição da receita por produto (P3). */
  receitaSaber: number;
  receitaTer: number;
  receitaExecutar: number;
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
  invest: number;
  leads: number;
  mql: number;
  sql: number;
  sal: number;
  won: number;
  wonSaber: number;
  wonTer: number;
  wonExecutar: number;
  receita: number;
  receitaSaber: number;
  receitaTer: number;
  receitaExecutar: number;
};
const zeroSub = (): SubAcc => ({
  invest: 0, leads: 0, mql: 0, sql: 0, sal: 0, won: 0,
  wonSaber: 0, wonTer: 0, wonExecutar: 0,
  receita: 0, receitaSaber: 0, receitaTer: 0, receitaExecutar: 0,
});

export function calcularPorSubCanal(
  blocks: PremissasBlocks,
  horizonteAtual: Horizonte,
  opts: CurvaOpts = {},
): LinhaSubCanal[] {
  const detalhe = calcularCanalTier(blocks, horizonteAtual, opts);
  const tierInfo = byTier(blocks.tiersCliente);
  const receitaByTier = byTier(blocks.receitaProduto);
  const lbByTier = byTier(blocks.conversoesInbound.leadBroker);
  const bbByTier = byTier(blocks.conversoesInbound.blackBox);
  const mb = blocks.conversoesInbound.meetingBroker;
  const eventosConvByTier = byTier(blocks.conversoesInbound.eventos);
  // Mix de outbound varia por horizonte — promoção automática (calcularCanalTier)
  // já calcula o horizonte efetivo do mês; aqui só lemos esse horizonte.
  const mixByH = new Map(blocks.mixSubcanais.map((m) => [m.h, m] as const));
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
      eventos: zeroSub(),
      out_indicacao: zeroSub(),
      out_recovery: zeroSub(),
      out_recomendacao: zeroSub(),
      out_prospeccao: zeroSub(),
    };

    for (const t of tiers) {
      const rp = receitaByTier.get(t.tier);
      const saberP = (rp?.saberPct ?? 0) / 100;
      const terP = (rp?.terPct ?? 0) / 100;
      const execP = (rp?.execPct ?? 0) / 100;

      // Inbound LB/BB: funil longo (Leads → MQL → SQL → SAL → Won).
      const addInbLongo = (
        c: CanalValores,
        key: SubCanalKey,
        conv: { cr1: number; cr2: number; cr3: number } | undefined,
      ) => {
        const a = acc[key];
        a.invest += c.invest;
        a.leads += c.leads;
        a.won += c.won;
        a.receita += c.receita;
        a.wonSaber += c.won * saberP;
        a.wonTer += c.won * terP;
        a.wonExecutar += c.won * execP;
        a.receitaSaber += c.receita * saberP;
        a.receitaTer += c.receita * terP;
        a.receitaExecutar += c.receita * execP;
        if (conv && c.leads > 0) {
          const cr1 = conv.cr1 / 100, cr2 = conv.cr2 / 100, cr3 = conv.cr3 / 100;
          a.mql += c.leads * cr1;
          a.sql += c.leads * cr1 * cr2;
          a.sal += c.leads * cr1 * cr2 * cr3;
        }
      };
      addInbLongo(t.lb, "lead_broker", lbByTier.get(t.tier));
      addInbLongo(t.bb, "black_box", bbByTier.get(t.tier));

      // Inbound MB: funil curto. `leads` aqui já é a contagem de SQLs.
      {
        const c = t.mb;
        const a = acc["meeting_broker"];
        a.invest += c.invest;
        a.leads += c.leads; // mantido por consistência; UI usa `sql`.
        a.sql += c.leads;
        a.sal += c.leads * (mb.cr3 / 100);
        a.won += c.won;
        a.receita += c.receita;
        a.wonSaber += c.won * saberP;
        a.wonTer += c.won * terP;
        a.wonExecutar += c.won * execP;
        a.receitaSaber += c.receita * saberP;
        a.receitaTer += c.receita * terP;
        a.receitaExecutar += c.receita * execP;
      }

      // Inbound Eventos: funil curto (invest → SQL → SAL → WON), cr3/cr4
      // vêm do bloco premissa_conversao_eventos do tier.
      {
        const c = t.ev;
        const a = acc["eventos"];
        const convEv = eventosConvByTier.get(t.tier);
        a.invest += c.invest;
        a.leads += c.leads;
        a.sql += c.leads;
        a.sal += c.leads * ((convEv?.cr3 ?? 0) / 100);
        a.won += c.won;
        a.receita += c.receita;
        a.wonSaber += c.won * saberP;
        a.wonTer += c.won * terP;
        a.wonExecutar += c.won * execP;
        a.receitaSaber += c.receita * saberP;
        a.receitaTer += c.receita * terP;
        a.receitaExecutar += c.receita * execP;
      }

      // Outbound: re-splitta por subcanal usando o mix do horizonte EFETIVO do
      // mês (`t.horizonte` já vem promovido por calcularCanalTier).
      const mix = mixByH.get(t.horizonte);
      const tcv = tierInfo.get(t.tier)?.tcvBooking ?? 0;
      for (const sub of SUBCANAIS_OUTBOUND) {
        const peso = (mix?.[sub] ?? 0) / 100;
        const leadsTierSub = t.out.leads * peso;
        const convSub = outByTierBySub.get(sub)!.get(t.tier);
        const cr1 = convSub ? convSub.cr1 / 100 : 0;
        const cr3 = convSub ? convSub.cr3 / 100 : 0;
        const cr4 = convSub ? convSub.cr4 / 100 : 0;
        const sqlTierSub = leadsTierSub * cr1;
        const salTierSub = sqlTierSub * cr3;
        const wonTierSub = salTierSub * cr4;
        const receitaTierSub = wonTierSub * tcv;
        const key = `out_${sub}` as SubCanalKey;
        const a = acc[key];
        a.leads += leadsTierSub;
        a.sql += sqlTierSub;
        a.sal += salTierSub;
        a.won += wonTierSub;
        a.receita += receitaTierSub;
        a.wonSaber += wonTierSub * saberP;
        a.wonTer += wonTierSub * terP;
        a.wonExecutar += wonTierSub * execP;
        a.receitaSaber += receitaTierSub * saberP;
        a.receitaTer += receitaTierSub * terP;
        a.receitaExecutar += receitaTierSub * execP;
      }
    }

    for (const sub of SUB_CANAIS) {
      resultado.push({ mes, subcanal: sub.key, ...acc[sub.key] });
    }
  }
  return resultado;
}

// ============================================================
// 8. Por tier de cliente — agregado por mês × tier
//
// Mantém o tier como granularidade e soma os 4 canais (LB/BB/MB/Outbound).
// Recalcula MQL/SQL/SAL a partir das conversões — info que `LinhaCanalTier`
// não carrega (lá só sobrevive won/leads/invest/receita). Receita e Won por
// categoria de produto seguem o mesmo split P3 já usado em outras tabelas.
// ============================================================

export type LinhaTier = {
  mes: string;
  tier: Tier;
  invest: number;
  /** MQL só existe em LB/BB (inbound longo). MB entra já como SQL; outbound pula MQL. */
  mql: number;
  sql: number;
  sal: number;
  won: number;
  wonSaber: number;
  wonTer: number;
  wonExecutar: number;
  receita: number;
  receitaSaber: number;
  receitaTer: number;
  receitaExecutar: number;
};

export function calcularPorTier(
  blocks: PremissasBlocks,
  horizonteAtual: Horizonte,
  opts: CurvaOpts = {},
): LinhaTier[] {
  const detalhe = calcularCanalTier(blocks, horizonteAtual, opts);
  const receitaByTier = byTier(blocks.receitaProduto);
  const lbByTier = byTier(blocks.conversoesInbound.leadBroker);
  const bbByTier = byTier(blocks.conversoesInbound.blackBox);
  const outByTierBySub = new Map(
    SUBCANAIS_OUTBOUND.map((s) => [s, byTier(blocks.conversoesOutbound[s])] as const),
  );
  // Mix por horizonte efetivo do mês (promovido por calcularCanalTier).
  const mixByH = new Map(blocks.mixSubcanais.map((m) => [m.h, m] as const));
  const mb = blocks.conversoesInbound.meetingBroker;
  const eventosConvByTier = byTier(blocks.conversoesInbound.eventos);

  const resultado: LinhaTier[] = [];

  for (const d of detalhe) {
    const mix = mixByH.get(d.horizonte);
    let mql = 0, sql = 0, sal = 0;

    const lbConv = lbByTier.get(d.tier);
    if (lbConv && d.lb.leads > 0) {
      const cr1 = lbConv.cr1 / 100, cr2 = lbConv.cr2 / 100, cr3 = lbConv.cr3 / 100;
      mql += d.lb.leads * cr1;
      sql += d.lb.leads * cr1 * cr2;
      sal += d.lb.leads * cr1 * cr2 * cr3;
    }
    const bbConv = bbByTier.get(d.tier);
    if (bbConv && d.bb.leads > 0) {
      const cr1 = bbConv.cr1 / 100, cr2 = bbConv.cr2 / 100, cr3 = bbConv.cr3 / 100;
      mql += d.bb.leads * cr1;
      sql += d.bb.leads * cr1 * cr2;
      sal += d.bb.leads * cr1 * cr2 * cr3;
    }
    // MB entra direto como SQL (d.mb.leads é a contagem de SQLs).
    if (d.mb.leads > 0) {
      sql += d.mb.leads;
      sal += d.mb.leads * (mb.cr3 / 100);
    }
    // Eventos: igual MB — d.ev.leads já é a contagem de SQLs.
    if (d.ev.leads > 0) {
      const evConv = eventosConvByTier.get(d.tier);
      sql += d.ev.leads;
      sal += d.ev.leads * ((evConv?.cr3 ?? 0) / 100);
    }
    // Outbound: re-splitta pelo mix P16 e usa cr1/cr3 do subcanal × tier.
    if (mix && d.out.leads > 0) {
      for (const s of SUBCANAIS_OUTBOUND) {
        const peso = (mix[s] ?? 0) / 100;
        if (peso <= 0) continue;
        const conv = outByTierBySub.get(s)?.get(d.tier);
        if (!conv) continue;
        const leadsSub = d.out.leads * peso;
        const cr1 = conv.cr1 / 100, cr3 = conv.cr3 / 100;
        sql += leadsSub * cr1;
        sal += leadsSub * cr1 * cr3;
      }
    }

    const invest = d.lb.invest + d.bb.invest + d.mb.invest + d.ev.invest;
    const won = d.totalWon;
    const receita = d.totalReceita;

    const rp = receitaByTier.get(d.tier);
    const saberP = (rp?.saberPct ?? 0) / 100;
    const terP = (rp?.terPct ?? 0) / 100;
    const execP = (rp?.execPct ?? 0) / 100;

    resultado.push({
      mes: d.mes,
      tier: d.tier,
      invest,
      mql,
      sql,
      sal,
      won,
      wonSaber: won * saberP,
      wonTer: won * terP,
      wonExecutar: won * execP,
      receita,
      receitaSaber: receita * saberP,
      receitaTer: receita * terP,
      receitaExecutar: receita * execP,
    });
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

// ============================================================
// 7b. Por sub-canal × tier — mesma decomposição da seção 7, sem somar tiers.
// Alimenta o sub-bloco "Por tier" dentro de cada sub-canal na tela /realizado.
// ============================================================

/** Mesma estrutura de `LinhaSubCanal`, mas mantendo o tier como granularidade. */
export type LinhaSubCanalTier = {
  mes: string;
  subcanal: SubCanalKey;
  tier: Tier;
  invest: number;
  /** Leads (LB/BB/Outbound) ou SQLs (MB). */
  leads: number;
  mql: number;
  sql: number;
  sal: number;
  won: number;
  wonSaber: number;
  wonTer: number;
  wonExecutar: number;
  receita: number;
  receitaSaber: number;
  receitaTer: number;
  receitaExecutar: number;
};

export function calcularPorSubCanalPorTier(
  blocks: PremissasBlocks,
  horizonteAtual: Horizonte,
  opts: CurvaOpts = {},
): LinhaSubCanalTier[] {
  const detalhe = calcularCanalTier(blocks, horizonteAtual, opts);
  const tierInfo = byTier(blocks.tiersCliente);
  const receitaByTier = byTier(blocks.receitaProduto);
  const lbByTier = byTier(blocks.conversoesInbound.leadBroker);
  const bbByTier = byTier(blocks.conversoesInbound.blackBox);
  const mb = blocks.conversoesInbound.meetingBroker;
  const eventosConvByTier = byTier(blocks.conversoesInbound.eventos);
  // Mix por horizonte efetivo do mês (promovido por calcularCanalTier).
  const mixByH = new Map(blocks.mixSubcanais.map((m) => [m.h, m] as const));
  const outByTierBySub = new Map(
    SUBCANAIS_OUTBOUND.map((s) => [s, byTier(blocks.conversoesOutbound[s])] as const),
  );

  const out: LinhaSubCanalTier[] = [];
  for (const d of detalhe) {
    const mix = mixByH.get(d.horizonte);
    const rp = receitaByTier.get(d.tier);
    const saberP = (rp?.saberPct ?? 0) / 100;
    const terP = (rp?.terPct ?? 0) / 100;
    const execP = (rp?.execPct ?? 0) / 100;
    const decomp = (won: number, receita: number) => ({
      wonSaber: won * saberP,
      wonTer: won * terP,
      wonExecutar: won * execP,
      receitaSaber: receita * saberP,
      receitaTer: receita * terP,
      receitaExecutar: receita * execP,
    });

    // LB — funil longo: Leads → MQL → SQL → SAL → Won
    {
      const conv = lbByTier.get(d.tier);
      const cr1 = (conv?.cr1 ?? 0) / 100;
      const cr2 = (conv?.cr2 ?? 0) / 100;
      const cr3 = (conv?.cr3 ?? 0) / 100;
      out.push({
        mes: d.mes,
        subcanal: "lead_broker",
        tier: d.tier,
        invest: d.lb.invest,
        leads: d.lb.leads,
        mql: d.lb.leads * cr1,
        sql: d.lb.leads * cr1 * cr2,
        sal: d.lb.leads * cr1 * cr2 * cr3,
        won: d.lb.won,
        receita: d.lb.receita,
        ...decomp(d.lb.won, d.lb.receita),
      });
    }
    // BB — funil longo
    {
      const conv = bbByTier.get(d.tier);
      const cr1 = (conv?.cr1 ?? 0) / 100;
      const cr2 = (conv?.cr2 ?? 0) / 100;
      const cr3 = (conv?.cr3 ?? 0) / 100;
      out.push({
        mes: d.mes,
        subcanal: "black_box",
        tier: d.tier,
        invest: d.bb.invest,
        leads: d.bb.leads,
        mql: d.bb.leads * cr1,
        sql: d.bb.leads * cr1 * cr2,
        sal: d.bb.leads * cr1 * cr2 * cr3,
        won: d.bb.won,
        receita: d.bb.receita,
        ...decomp(d.bb.won, d.bb.receita),
      });
    }
    // MB — funil curto: SQL (= leads) → SAL → Won
    {
      const sqls = d.mb.leads; // já é SQL
      out.push({
        mes: d.mes,
        subcanal: "meeting_broker",
        tier: d.tier,
        invest: d.mb.invest,
        leads: sqls,
        mql: 0,
        sql: sqls,
        sal: sqls * (mb.cr3 / 100),
        won: d.mb.won,
        receita: d.mb.receita,
        ...decomp(d.mb.won, d.mb.receita),
      });
    }
    // Eventos — funil curto inbound (SQL → SAL → Won), cr3 do bloco premissa_conversao_eventos.
    {
      const sqls = d.ev.leads;
      const evConv = eventosConvByTier.get(d.tier);
      out.push({
        mes: d.mes,
        subcanal: "eventos",
        tier: d.tier,
        invest: d.ev.invest,
        leads: sqls,
        mql: 0,
        sql: sqls,
        sal: sqls * ((evConv?.cr3 ?? 0) / 100),
        won: d.ev.won,
        receita: d.ev.receita,
        ...decomp(d.ev.won, d.ev.receita),
      });
    }

    // Outbound (4 subcanais) — funil curto sem invest.
    const tcv = tierInfo.get(d.tier)?.tcvBooking ?? 0;
    for (const s of SUBCANAIS_OUTBOUND) {
      const peso = (mix?.[s] ?? 0) / 100;
      const leadsTierSub = d.out.leads * peso;
      const conv = outByTierBySub.get(s)!.get(d.tier);
      const cr1 = conv ? conv.cr1 / 100 : 0;
      const cr3 = conv ? conv.cr3 / 100 : 0;
      const cr4 = conv ? conv.cr4 / 100 : 0;
      const sqlTierSub = leadsTierSub * cr1;
      const salTierSub = sqlTierSub * cr3;
      const wonTierSub = salTierSub * cr4;
      const receitaTierSub = wonTierSub * tcv;
      out.push({
        mes: d.mes,
        subcanal: `out_${s}` as SubCanalKey,
        tier: d.tier,
        invest: 0,
        leads: leadsTierSub,
        mql: 0,
        sql: sqlTierSub,
        sal: salTierSub,
        won: wonTierSub,
        receita: receitaTierSub,
        ...decomp(wonTierSub, receitaTierSub),
      });
    }
  }
  return out;
}

/** Soma `LinhaSubCanalTier` de várias unidades por (mes, subcanal, tier). */
export function agregarPorSubCanalPorTierMatriz(
  conjuntos: LinhaSubCanalTier[][],
): LinhaSubCanalTier[] {
  const acc = new Map<string, LinhaSubCanalTier>();
  for (const linhas of conjuntos) {
    for (const l of linhas) {
      const k = `${l.mes}|${l.subcanal}|${l.tier}`;
      const cur = acc.get(k);
      if (!cur) {
        acc.set(k, { ...l });
        continue;
      }
      cur.invest += l.invest;
      cur.leads += l.leads;
      cur.mql += l.mql;
      cur.sql += l.sql;
      cur.sal += l.sal;
      cur.won += l.won;
      cur.wonSaber += l.wonSaber;
      cur.wonTer += l.wonTer;
      cur.wonExecutar += l.wonExecutar;
      cur.receita += l.receita;
      cur.receitaSaber += l.receitaSaber;
      cur.receitaTer += l.receitaTer;
      cur.receitaExecutar += l.receitaExecutar;
    }
  }
  return [...acc.values()];
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
      cur.invest += l.invest;
      cur.leads += l.leads;
      cur.mql += l.mql;
      cur.sql += l.sql;
      cur.sal += l.sal;
      cur.won += l.won;
      cur.wonSaber += l.wonSaber;
      cur.wonTer += l.wonTer;
      cur.wonExecutar += l.wonExecutar;
      cur.receita += l.receita;
      cur.receitaSaber += l.receitaSaber;
      cur.receitaTer += l.receitaTer;
      cur.receitaExecutar += l.receitaExecutar;
    }
  }
  return [...acc.values()].sort((a, b) => {
    const cmp = a.mes.localeCompare(b.mes);
    return cmp !== 0 ? cmp : ord.indexOf(a.subcanal) - ord.indexOf(b.subcanal);
  });
}

/** Soma `LinhaTier` de várias unidades por (mes, tier). */
export function agregarPorTierMatriz(conjuntos: LinhaTier[][]): LinhaTier[] {
  const acc = new Map<string, LinhaTier>();
  for (const linhas of conjuntos) {
    for (const l of linhas) {
      const k = `${l.mes}|${l.tier}`;
      const cur = acc.get(k);
      if (!cur) {
        acc.set(k, { ...l });
        continue;
      }
      cur.invest += l.invest;
      cur.mql += l.mql;
      cur.sql += l.sql;
      cur.sal += l.sal;
      cur.won += l.won;
      cur.wonSaber += l.wonSaber;
      cur.wonTer += l.wonTer;
      cur.wonExecutar += l.wonExecutar;
      cur.receita += l.receita;
      cur.receitaSaber += l.receitaSaber;
      cur.receitaTer += l.receitaTer;
      cur.receitaExecutar += l.receitaExecutar;
    }
  }
  return [...acc.values()].sort((a, b) =>
    a.mes.localeCompare(b.mes) || TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier),
  );
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
          ev: { ...l.ev },
          out: { ...l.out },
        });
        continue;
      }
      addCanal(cur.lb, l.lb);
      addCanal(cur.bb, l.bb);
      addCanal(cur.mb, l.mb);
      addCanal(cur.ev, l.ev);
      addCanal(cur.out, l.out);
      cur.totalWon += l.totalWon;
      cur.totalReceita += l.totalReceita;
    }
  }
  return [...acc.values()].sort((a, b) =>
    a.mes.localeCompare(b.mes) || TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier),
  );
}

// ============================================================
// Resumo do funil 2026 — usado no /iniciar/resumo
//
// `calcularResumo` devolve a evolução mês a mês (12 linhas Jan→Dez) + total
// anual. CPL é base inbound (LB+BB); taxas e ROAS no total são calculados a
// partir das somas (não médias mensais — média de razão ≠ razão da média).
// ============================================================

export type ResumoMetricas = {
  investimentoTotal: number;
  mql: number;
  sql: number;
  sal: number;
  won: number;
  wonSaber: number;
  wonTer: number;
  wonExecutar: number;
  receitaTotal: number;
  receitaSaber: number;
  receitaTer: number;
  receitaExecutar: number;
  /** Ticket médio (Receita ÷ Won) por categoria de produto. 0 se won=0. */
  tmSaber: number;
  tmTer: number;
  tmExecutar: number;
  /** Conversões acumuladas do funil (proporção, 0..1). 0 se etapa anterior=0. */
  taxaMqlSql: number;
  taxaSqlSal: number;
  taxaSalWon: number;
  /** Receita ÷ Investimento total. 0 se invest=0. */
  roas: number;
  /** Investimento inbound (LB+BB) ÷ leads inbound. 0 se leads=0. */
  cpl: number;
  /** Investimento inbound (LB+BB) total. Exposto pra permitir consolidação. */
  investInbound: number;
  /** Leads inbound (LB+BB). Exposto pra permitir consolidação do CPL. */
  leadsInbound: number;
};

export type ResumoMensalLinha = ResumoMetricas & {
  mes: string;
  /** True se o mês veio do realizado (não da projeção). */
  isFechado: boolean;
};

export type ResumoCompleto = {
  meses: ResumoMensalLinha[];
  total: ResumoMetricas;
};

const safeDiv = (n: number, d: number) => (d > 0 ? n / d : 0);

export function calcularResumo(
  blocks: PremissasBlocks,
  horizonteAtual: Horizonte,
  opts: CurvaOpts = {},
): ResumoCompleto {
  const rampUp = calcularRampUp(blocks, horizonteAtual, opts);
  const porTier = calcularPorTier(blocks, horizonteAtual, opts);

  // Agrega porTier por mês (soma os tiers).
  type Agg = {
    mql: number; sql: number; sal: number; won: number;
    wonSaber: number; wonTer: number; wonExecutar: number;
    receitaTotal: number; receitaSaber: number; receitaTer: number; receitaExecutar: number;
  };
  const aggByMes = new Map<string, Agg>();
  for (const t of porTier) {
    const cur = aggByMes.get(t.mes) ?? {
      mql: 0, sql: 0, sal: 0, won: 0,
      wonSaber: 0, wonTer: 0, wonExecutar: 0,
      receitaTotal: 0, receitaSaber: 0, receitaTer: 0, receitaExecutar: 0,
    };
    cur.mql += t.mql;
    cur.sql += t.sql;
    cur.sal += t.sal;
    cur.won += t.won;
    cur.wonSaber += t.wonSaber;
    cur.wonTer += t.wonTer;
    cur.wonExecutar += t.wonExecutar;
    cur.receitaTotal += t.receita;
    cur.receitaSaber += t.receitaSaber;
    cur.receitaTer += t.receitaTer;
    cur.receitaExecutar += t.receitaExecutar;
    aggByMes.set(t.mes, cur);
  }

  const meses: ResumoMensalLinha[] = rampUp.map((r) => {
    const a = aggByMes.get(r.mes) ?? {
      mql: 0, sql: 0, sal: 0, won: 0,
      wonSaber: 0, wonTer: 0, wonExecutar: 0,
      receitaTotal: 0, receitaSaber: 0, receitaTer: 0, receitaExecutar: 0,
    };
    const investInboundMes = r.investLb + r.investBb;
    return {
      mes: r.mes,
      isFechado: r.isFechado,
      investimentoTotal: r.investTotal,
      mql: a.mql,
      sql: a.sql,
      sal: a.sal,
      won: a.won,
      wonSaber: a.wonSaber,
      wonTer: a.wonTer,
      wonExecutar: a.wonExecutar,
      receitaTotal: a.receitaTotal,
      receitaSaber: a.receitaSaber,
      receitaTer: a.receitaTer,
      receitaExecutar: a.receitaExecutar,
      tmSaber: safeDiv(a.receitaSaber, a.wonSaber),
      tmTer: safeDiv(a.receitaTer, a.wonTer),
      tmExecutar: safeDiv(a.receitaExecutar, a.wonExecutar),
      taxaMqlSql: safeDiv(a.sql, a.mql),
      taxaSqlSal: safeDiv(a.sal, a.sql),
      taxaSalWon: safeDiv(a.won, a.sal),
      roas: safeDiv(a.receitaTotal, r.investTotal),
      cpl: safeDiv(investInboundMes, r.leadsIb),
      investInbound: investInboundMes,
      leadsInbound: r.leadsIb,
    };
  });

  // Total anual — soma das absolutas, razões calculadas dos totais.
  let investimentoTotal = 0, investInbound = 0, leadsInbound = 0;
  let mql = 0, sql = 0, sal = 0, won = 0;
  let wonSaber = 0, wonTer = 0, wonExecutar = 0;
  let receitaTotal = 0, receitaSaber = 0, receitaTer = 0, receitaExecutar = 0;
  for (const r of rampUp) {
    investimentoTotal += r.investTotal;
    investInbound += r.investLb + r.investBb;
    leadsInbound += r.leadsIb;
  }
  for (const t of porTier) {
    mql += t.mql;
    sql += t.sql;
    sal += t.sal;
    won += t.won;
    wonSaber += t.wonSaber;
    wonTer += t.wonTer;
    wonExecutar += t.wonExecutar;
    receitaTotal += t.receita;
    receitaSaber += t.receitaSaber;
    receitaTer += t.receitaTer;
    receitaExecutar += t.receitaExecutar;
  }

  const total: ResumoMetricas = {
    investimentoTotal,
    mql, sql, sal, won,
    wonSaber, wonTer, wonExecutar,
    receitaTotal, receitaSaber, receitaTer, receitaExecutar,
    tmSaber: safeDiv(receitaSaber, wonSaber),
    tmTer: safeDiv(receitaTer, wonTer),
    tmExecutar: safeDiv(receitaExecutar, wonExecutar),
    taxaMqlSql: safeDiv(sql, mql),
    taxaSqlSal: safeDiv(sal, sql),
    taxaSalWon: safeDiv(won, sal),
    roas: safeDiv(receitaTotal, investimentoTotal),
    cpl: safeDiv(investInbound, leadsInbound),
    investInbound,
    leadsInbound,
  };

  return { meses, total };
}
