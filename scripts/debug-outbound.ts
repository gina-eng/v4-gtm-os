/**
 * Reproduz o cenário do usuário (unidade H1 → H2 → H3 ao longo de 2026)
 * pra inspecionar os valores de outbound mês a mês. Print por sub-canal × tier.
 *
 *   npx tsx scripts/debug-outbound.ts
 */

import {
  HORIZONTE_CRESCIMENTO_DEFAULT,
  TIME_COMERCIAL_DEFAULT,
  METRICAS_OPERACIONAIS_DEFAULT,
  TIERS_CLIENTE_DEFAULT,
  RECEITA_PRODUTO_DEFAULT,
  DIST_MERCADO_DEFAULT,
  DIST_SPLIT_DEFAULT,
  INVESTIMENTO_MIDIA_DEFAULT,
  MIX_OUTBOUND_DEFAULT,
  CONVERSAO_LEAD_BROKER_DEFAULT,
  CONVERSAO_BLACK_BOX_DEFAULT,
  CONVERSAO_EVENTOS_DEFAULT,
  CONVERSAO_MEETING_BROKER_DEFAULT,
  EVENTOS_CUSTO_DEFAULT,
  CONVERSAO_OUTBOUND_INDICACAO_DEFAULT,
  CONVERSAO_OUTBOUND_RECOVERY_DEFAULT,
  CONVERSAO_OUTBOUND_RECOMENDACAO_DEFAULT,
  CONVERSAO_OUTBOUND_PROSPECCAO_DEFAULT,
  type RealizadoMensal,
} from "@/lib/premissas/matriz-defaults";
import type { PremissasBlocks } from "@/db/repositories/premissas";
import {
  calcularRampUp,
  calcularPorSubCanal,
} from "@/lib/premissas/funil-reverso";

const blocks: PremissasBlocks = {
  horizontes: HORIZONTE_CRESCIMENTO_DEFAULT,
  timeComercial: TIME_COMERCIAL_DEFAULT,
  metricasOperacionais: METRICAS_OPERACIONAIS_DEFAULT,
  tiersCliente: TIERS_CLIENTE_DEFAULT,
  receitaProduto: RECEITA_PRODUTO_DEFAULT,
  distMercado: DIST_MERCADO_DEFAULT,
  distSplit: DIST_SPLIT_DEFAULT,
  investimentoMidia: INVESTIMENTO_MIDIA_DEFAULT,
  investimentoMensal: [],
  overridesSubcanalMes: [],
  conversoesInbound: {
    leadBroker: CONVERSAO_LEAD_BROKER_DEFAULT,
    blackBox: CONVERSAO_BLACK_BOX_DEFAULT,
    meetingBroker: CONVERSAO_MEETING_BROKER_DEFAULT,
    eventosCusto: EVENTOS_CUSTO_DEFAULT,
    eventos: CONVERSAO_EVENTOS_DEFAULT,
  },
  conversoesOutbound: {
    indicacao: CONVERSAO_OUTBOUND_INDICACAO_DEFAULT,
    recovery: CONVERSAO_OUTBOUND_RECOVERY_DEFAULT,
    recomendacao: CONVERSAO_OUTBOUND_RECOMENDACAO_DEFAULT,
    prospeccao: CONVERSAO_OUTBOUND_PROSPECCAO_DEFAULT,
  },
  mixSubcanais: MIX_OUTBOUND_DEFAULT,
};

const realizado: RealizadoMensal[] = [
  { mes: "2026-03", faturamento: 20_000, investido: 3_360, leadsIb: 0, leadsOb: 0, won: 0 },
  { mes: "2026-04", faturamento: 35_000, investido: 5_880, leadsIb: 0, leadsOb: 0, won: 0 },
];

const opts = { realizadoHistorico: realizado, dataInicio: "2026-03-01" };
const ramp = calcularRampUp(blocks, "H1", opts);

console.log("== Ramp-up por mês (target, invest, recIB, recOB, horizonte) ==");
for (const l of ramp) {
  console.log(
    `  ${l.mes} [${l.isFechado ? "fechado" : "futuro "}] H=${l.horizonte} target=${Math.round(l.target).toString().padStart(7)} invTot=${Math.round(l.investTotal).toString().padStart(6)} recIB=${Math.round(l.recInbound).toString().padStart(7)} recOB=${Math.round(l.recOutbound).toString().padStart(6)} delta=${Math.round(l.delta).toString().padStart(6)}`,
  );
}

console.log("\n== Outbound por sub-canal (receita) ==");
const sub = calcularPorSubCanal(blocks, "H1", opts);
const outbound = sub.filter((s) => s.subcanal.startsWith("out_"));
const byMes = new Map<string, Record<string, number>>();
for (const l of outbound) {
  const cur = byMes.get(l.mes) ?? {};
  cur[l.subcanal] = l.receita;
  byMes.set(l.mes, cur);
}
for (const [mes, r] of Array.from(byMes.entries()).sort()) {
  console.log(
    `  ${mes}  indic=${Math.round(r.out_indicacao ?? 0).toString().padStart(5)} recov=${Math.round(r.out_recovery ?? 0).toString().padStart(5)} recom=${Math.round(r.out_recomendacao ?? 0).toString().padStart(5)} prosp=${Math.round(r.out_prospeccao ?? 0).toString().padStart(5)}`,
  );
}

console.log("\n== Won outbound (fractional) por sub-canal ==");
const byMesWon = new Map<string, Record<string, number>>();
for (const l of outbound) {
  const cur = byMesWon.get(l.mes) ?? {};
  cur[l.subcanal] = l.won;
  byMesWon.set(l.mes, cur);
}
for (const [mes, r] of Array.from(byMesWon.entries()).sort()) {
  console.log(
    `  ${mes}  indic=${(r.out_indicacao ?? 0).toFixed(2).padStart(6)} recov=${(r.out_recovery ?? 0).toFixed(2).padStart(6)} recom=${(r.out_recomendacao ?? 0).toFixed(2).padStart(6)} prosp=${(r.out_prospeccao ?? 0).toFixed(2).padStart(6)}`,
  );
}

console.log("\n== Cenário extremo: investido alto em meses futuros (override) ==");
// Reproduzindo o caso em que user pode ter setado override > target × pctProducao
const blocks2 = {
  ...blocks,
  investimentoMensal: [
    { mes: "2026-08", investimento: 50_000 }, // bem acima do target × pctProd default
    { mes: "2026-09", investimento: 80_000 },
    { mes: "2026-10", investimento: 100_000 },
    { mes: "2026-11", investimento: 120_000 },
    { mes: "2026-12", investimento: 150_000 },
  ],
};
const ramp2 = calcularRampUp(blocks2, "H1", opts);
console.log("Com overrides altos:");
for (const l of ramp2.slice(5)) {
  console.log(
    `  ${l.mes} [${l.isFechado ? "fechado" : "futuro "}] H=${l.horizonte} target=${Math.round(l.target).toString().padStart(7)} invTot=${Math.round(l.investTotal).toString().padStart(6)} recIB=${Math.round(l.recInbound).toString().padStart(7)} recOB=${Math.round(l.recOutbound).toString().padStart(6)}`,
  );
}
