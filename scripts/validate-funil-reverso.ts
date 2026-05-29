/**
 * Harness de validação do motor de funil reverso (modelo 2026, 12 meses).
 *
 *   npx tsx scripts/validate-funil-reverso.ts
 *
 * Roda com os defaults da Matriz e exercita as duas pontas:
 * - Sem realizado: fallback ancorado na faixaMin do horizonteAtual.
 * - Com realizado: âncora no mês fechado mais recente, projeção pela taxa do horizonte.
 *
 * Não é parte do bundle do app — ferramenta de validação local.
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
  CONVERSAO_MEETING_BROKER_DEFAULT,
  CONVERSAO_OUTBOUND_INDICACAO_DEFAULT,
  CONVERSAO_OUTBOUND_EVENTOS_DEFAULT,
  CONVERSAO_OUTBOUND_RECOVERY_DEFAULT,
  CONVERSAO_OUTBOUND_RECOMENDACAO_DEFAULT,
  CONVERSAO_OUTBOUND_PROSPECCAO_DEFAULT,
  type RealizadoMensal,
} from "@/lib/premissas/matriz-defaults";
import type { PremissasBlocks } from "@/db/repositories/premissas";
import {
  calcularCurvaTarget,
  calcularRampUp,
  calcularCanalTier,
  calcularPorSubCanal,
  agregarRampUpMatriz,
  SUB_CANAIS,
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

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detalhe?: string) {
  if (cond) pass++;
  else {
    fail++;
    console.log(`  ✗ ${label}${detalhe ? " · " + detalhe : ""}`);
  }
}
function approx(label: string, got: number, expected: number, tol = 1) {
  check(label, Math.abs(got - expected) <= tol, `got ${got}, expected ${expected}`);
}

// ── 1. Curva de target sem realizado (fallback faixaMin) ──────────────────
console.log("== Curva de target — fallback (sem realizado) ==");
for (const h of ["H1", "H2", "H3", "H4", "H5"] as const) {
  const curva = calcularCurvaTarget(HORIZONTE_CRESCIMENTO_DEFAULT, h);
  const info = HORIZONTE_CRESCIMENTO_DEFAULT.find((x) => x.h === h)!;
  check(`${h}: 12 meses`, curva.length === 12);
  approx(`${h}: M1 = faixaMin`, curva[0]!.target, info.faixaMin);
  // M2 = faixaMin × (1 + taxa/100)
  const m2Esperado = Math.round(info.faixaMin * (1 + info.crescMensalPct / 100));
  approx(`${h}: M2 = M1 × (1 + ${info.crescMensalPct}%)`, curva[1]!.target, m2Esperado);
  // Todos no horizonte do unit
  check(`${h}: horizonte fixo`, curva.every((l) => l.horizonte === h));
  check(`${h}: nenhum mês fechado (fallback)`, curva.every((l) => !l.isFechado));
}

// ── 2. Curva de target com realizado ──────────────────────────────────────
console.log("\n== Curva de target — com realizado (anchor) ==");
// Unidade em H3, com realizado nos 3 primeiros meses.
const realizado: RealizadoMensal[] = [
  { mes: "2026-01", faturamento: 200_000, investido: 30_000, leadsIb: 50, leadsOb: 80, won: 6 },
  { mes: "2026-02", faturamento: 240_000, investido: 36_000, leadsIb: 60, leadsOb: 95, won: 7 },
  { mes: "2026-03", faturamento: 290_000, investido: 42_000, leadsIb: 70, leadsOb: 110, won: 9 },
];
const curvaH3 = calcularCurvaTarget(HORIZONTE_CRESCIMENTO_DEFAULT, "H3", {
  realizadoHistorico: realizado,
});
check("12 meses", curvaH3.length === 12);
// M1-M3 fechados, target = realizado
approx("M1 target = realizado", curvaH3[0]!.target, 200_000);
approx("M2 target = realizado", curvaH3[1]!.target, 240_000);
approx("M3 target = realizado", curvaH3[2]!.target, 290_000);
check("M1-M3 fechados", curvaH3.slice(0, 3).every((l) => l.isFechado));
// Mês fechado mais recente: depende de getUltimoMesFechado() (data corrente).
// Se já estamos depois de mar/2026 → mar é o último fechado → M4 = 290.000 × 1.20.
// Se estamos no ano antes de jan/2027, função clampa em dez/2026 — pode ser que
// todos os meses até dez sejam considerados fechados. Sanity: o forecast começa
// após o último fechado.
// Base da projeção = último mês fechado com target > 0 (pode pular meses
// fechados sem realizado). O primeiro futuro = base × (1 + taxa/100)^n, com n
// = distância em meses até a base.
const baseFechado = [...curvaH3].reverse().find((l) => l.isFechado && l.target > 0);
const primeiroFuturo = curvaH3.find((l) => !l.isFechado);
if (baseFechado && primeiroFuturo) {
  const idxBase = curvaH3.indexOf(baseFechado);
  const idxFut = curvaH3.indexOf(primeiroFuturo);
  const n = idxFut - idxBase;
  const taxaH3 = HORIZONTE_CRESCIMENTO_DEFAULT.find((h) => h.h === "H3")!.crescMensalPct;
  const esperado = Math.round(baseFechado.target * Math.pow(1 + taxaH3 / 100, n));
  approx(`Primeiro projetado = base × (1 + ${taxaH3}%)^${n}`, primeiroFuturo.target, esperado, 2);
}

// ── 3. Coerência do funil reverso ─────────────────────────────────────────
console.log("\n== Coerência do funil (H3, com realizado) ==");
const ramp = calcularRampUp(blocks, "H3", { realizadoHistorico: realizado });
check("Ramp-up tem 12 linhas", ramp.length === 12);
const pctProdH3 = INVESTIMENTO_MIDIA_DEFAULT.find((i) => i.h === "H3")!.pctProducao;
for (const l of ramp) {
  approx(
    `M ${l.mes} investTotal = target × ${pctProdH3}%`,
    l.investTotal,
    l.target * (pctProdH3 / 100),
    1,
  );
}
// Receita total ≥ target
for (const l of ramp) {
  check(`M ${l.mes} recTotal ≥ target`, l.recTotal >= l.target - 1);
}
// Saber+Ter+Exec ≈ recTotal
for (const l of ramp) {
  approx(`M ${l.mes} saber+ter+exec`, l.saber + l.ter + l.executar, l.recTotal, 2);
}
// BB ativo no H3 (splitBb=20, bbPiso=30k)
const algumBB = ramp.some((l) => l.investBb > 0);
check("BB ativo em H3", algumBB);
// MB inativo em H3 (Enterprise não está ativo)
check("MB inativo em H3", ramp.every((l) => l.investMb === 0));

// ── 4. MB só no H5 ────────────────────────────────────────────────────────
console.log("\n== MB no H5 (Enterprise ativo) ==");
const rampH5 = calcularRampUp(blocks, "H5");
const algumMB = rampH5.some((l) => l.investMb > 0);
check("MB ativo em H5", algumMB);
const pctProdH5 = INVESTIMENTO_MIDIA_DEFAULT.find((i) => i.h === "H5")!.pctProducao;
approx(
  "M1 H5 investTotal = target × pctProducao",
  rampH5[0]!.investTotal,
  rampH5[0]!.target * (pctProdH5 / 100),
  1,
);

// ── 5. Canal × Tier — quantidade de linhas (tiers ativos × 12 meses) ────
console.log("\n== Canal × Tier ==");
const ct = calcularCanalTier(blocks, "H3");
// H3 tem 3 tiers ativos (Tiny, Small, Medium) — 36 linhas
check("H3 Canal×Tier = 3 tiers × 12 meses = 36", ct.length === 36);
const ctH5 = calcularCanalTier(blocks, "H5");
check("H5 Canal×Tier = 5 tiers × 12 meses = 60", ctH5.length === 60);

// ── 5b. Por sub-canal: identidade vs Ramp-up ─────────────────────────────
console.log("\n== Por sub-canal — identidade com Ramp-up ==");
const sub = calcularPorSubCanal(blocks, "H3", { realizadoHistorico: realizado });
check("8 sub-canais × 12 meses = 96", sub.length === 96);
// Soma de receita por mês (todos os sub-canais) = recTotal do mês no Ramp-up
const porMesSub = new Map<string, number>();
for (const l of sub) porMesSub.set(l.mes, (porMesSub.get(l.mes) ?? 0) + l.receita);
for (const l of ramp) {
  approx(`${l.mes} Σ receita sub-canal = recTotal`, porMesSub.get(l.mes) ?? 0, l.recTotal, 2);
}
// Inbound (LB+BB+MB) por mês = recInbound do Ramp-up
const inboundKeys = new Set(SUB_CANAIS.filter((s) => s.canal === "inbound").map((s) => s.key));
const porMesIb = new Map<string, number>();
for (const l of sub) if (inboundKeys.has(l.subcanal)) porMesIb.set(l.mes, (porMesIb.get(l.mes) ?? 0) + l.receita);
for (const l of ramp) {
  approx(`${l.mes} Σ receita inbound sub = recInbound`, porMesIb.get(l.mes) ?? 0, l.recInbound, 2);
}

// ── 6. Matriz aggregator ──────────────────────────────────────────────────
console.log("\n== Agregação Matriz ==");
const u1 = calcularRampUp(blocks, "H2");
const u2 = calcularRampUp(blocks, "H3");
const u3 = calcularRampUp(blocks, "H5");
const matriz = agregarRampUpMatriz([u1, u2, u3]);
check("Matriz: 12 meses", matriz.length === 12);
// Soma de targets
for (let i = 0; i < 12; i++) {
  approx(
    `M${i + 1} target somado`,
    matriz[i]!.target,
    u1[i]!.target + u2[i]!.target + u3[i]!.target,
    1,
  );
}

// ── Amostra visual ────────────────────────────────────────────────────────
console.log("\n== Amostra H3 (com realizado) ==");
for (const l of ramp) {
  const flag = l.isFechado ? "fechado" : "futuro ";
  console.log(
    `  ${l.mes} [${flag}] target=${Math.round(l.target).toString().padStart(8)} inv=${Math.round(l.investTotal).toString().padStart(7)} (${l.pctInvest.toFixed(1)}%) ` +
      `recIB=${Math.round(l.recInbound).toString().padStart(7)} recOB=${Math.round(l.recOutbound).toString().padStart(7)} ` +
      `HC=${l.hcTotal}`,
  );
}

console.log(`\n${fail === 0 ? "✓ TODOS OK" : "✗ FALHAS"} — ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
