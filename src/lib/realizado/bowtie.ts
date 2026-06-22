/**
 * Agregação do bowtie de aquisição — pega o detalhe granular (mês × sub-canal
 * × tier) — projetado (`LinhaSubCanalTier` do funil-reverso) e realizado
 * (`RealizadoFunilCelula` do banco) — e produz um `BowtieAgg` com os estágios
 * Leads → MQL → SQL → SAL → Won → Faturamento + métricas derivadas (conversões,
 * hit rate, ticket médio) pra alimentar os cards e a gravata.
 *
 * Os filtros são interpretados de forma "default-allow": `undefined` ou array
 * vazio = sem restrição naquela dimensão.
 */

import type { LinhaSubCanalTier, SubCanalKey } from "@/lib/premissas/funil-reverso";
import { SUB_CANAIS } from "@/lib/premissas/funil-reverso";
import type { PremissasBlocks } from "@/db/repositories/premissas";
import type { Horizonte, Tier } from "@/lib/premissas/matriz-defaults";
import type { BaldeMes, RealizadoFunilCelula } from "@/db/repositories/realizado-funil";

export type CanalGrupo = "inbound" | "outbound";

export type BowtieFiltro = {
  meses?: string[];
  tiers?: Tier[];
  canais?: CanalGrupo[];
  subcanais?: SubCanalKey[];
};

/**
 * Resultado agregado do bowtie pra um conjunto filtrado. Conversões em %
 * (cr2/cr3/cr4) e hit rate (won ÷ mql) sempre derivadas dos números agregados —
 * nunca média de % por linha (evita simpson paradox).
 */
export type BowtieAgg = {
  leads: number;
  mql: number;
  sql: number;
  sal: number;
  won: number;
  faturamento: number;
  /** Investimento total (R$) — só projetado tem hoje; realizado fica 0. */
  invest: number;
  cr2: number;
  cr3: number;
  cr4: number;
  hitRate: number;
  ticketMedio: number;
  /** Custos por estágio (invest ÷ qtd). 0 quando invest ou qtd = 0. */
  custoPorLead: number;
  custoPorMql: number;
  custoPorSql: number;
  custoPorSal: number;
  /** CAC = invest ÷ won. */
  cac: number;
};

const ZERO_AGG: BowtieAgg = {
  leads: 0,
  mql: 0,
  sql: 0,
  sal: 0,
  won: 0,
  faturamento: 0,
  invest: 0,
  cr2: 0,
  cr3: 0,
  cr4: 0,
  hitRate: 0,
  ticketMedio: 0,
  custoPorLead: 0,
  custoPorMql: 0,
  custoPorSql: 0,
  custoPorSal: 0,
  cac: 0,
};

const CANAL_BY_SUBCANAL = new Map<SubCanalKey, CanalGrupo>(
  SUB_CANAIS.map((s) => [s.key, s.canal] as const),
);

function isEmpty<T>(arr: T[] | undefined): boolean {
  return !arr || arr.length === 0;
}

/**
 * Aplica o filtro a uma célula/linha (mes, subcanal, tier). Filtro vazio passa
 * tudo. Quando `canais` está setado, restringe pelo grupo do sub-canal.
 */
function passaFiltro(
  l: { mes: string; subcanal: SubCanalKey; tier: Tier },
  filtro: BowtieFiltro,
): boolean {
  if (!isEmpty(filtro.meses) && !filtro.meses!.includes(l.mes)) return false;
  if (!isEmpty(filtro.tiers) && !filtro.tiers!.includes(l.tier)) return false;
  if (!isEmpty(filtro.subcanais) && !filtro.subcanais!.includes(l.subcanal)) return false;
  if (!isEmpty(filtro.canais)) {
    const canal = CANAL_BY_SUBCANAL.get(l.subcanal);
    if (!canal || !filtro.canais!.includes(canal)) return false;
  }
  return true;
}

/** Soma estágios + calcula métricas derivadas. */
function finalize(
  acc: Omit<
    BowtieAgg,
    | "cr2"
    | "cr3"
    | "cr4"
    | "hitRate"
    | "ticketMedio"
    | "custoPorLead"
    | "custoPorMql"
    | "custoPorSql"
    | "custoPorSal"
    | "cac"
  >,
): BowtieAgg {
  const cr2 = acc.mql > 0 ? (acc.sql / acc.mql) * 100 : 0;
  const cr3 = acc.sql > 0 ? (acc.sal / acc.sql) * 100 : 0;
  const cr4 = acc.sal > 0 ? (acc.won / acc.sal) * 100 : 0;
  const hitRate = acc.mql > 0 ? (acc.won / acc.mql) * 100 : 0;
  const ticketMedio = acc.won > 0 ? acc.faturamento / acc.won : 0;
  const safe = (n: number, d: number) => (d > 0 ? n / d : 0);
  return {
    ...acc,
    cr2,
    cr3,
    cr4,
    hitRate,
    ticketMedio,
    custoPorLead: safe(acc.invest, acc.leads),
    custoPorMql: safe(acc.invest, acc.mql),
    custoPorSql: safe(acc.invest, acc.sql),
    custoPorSal: safe(acc.invest, acc.sal),
    cac: safe(acc.invest, acc.won),
  };
}

/**
 * Agrega a projeção (LinhaSubCanalTier — saída de `calcularPorSubCanalPorTier`)
 * aplicando o filtro. Faturamento projetado = `receita` da linha (TCV).
 */
export function agregarProjetado(
  linhas: LinhaSubCanalTier[],
  filtro: BowtieFiltro,
): BowtieAgg {
  let leads = 0, sql = 0, sal = 0, won = 0, faturamento = 0, invest = 0;
  for (const l of linhas) {
    if (!passaFiltro(l, filtro)) continue;
    leads += l.leads;
    sql += l.sql;
    sal += l.sal;
    won += l.won;
    faturamento += l.receita;
    invest += l.invest;
  }
  // O funil do bowtie começa no MQL = topo (entrada de TODOS os canais): os leads
  // comprados (LB/BB) já entram como MQL e os canais de funil curto (MB/Eventos/
  // Outbound) entram direto no SQL. Por isso MQL = `leads` (volume de entrada),
  // não o `mql` parcial que só LB/BB produzem. Não há estágio LEAD separado.
  return finalize({ leads, mql: leads, sql, sal, won, faturamento, invest });
}

/** Mesma agregação, mas pra realizado (RealizadoFunilCelula). */
export function agregarRealizado(
  celulas: RealizadoFunilCelula[],
  filtro: BowtieFiltro,
): BowtieAgg {
  let leads = 0, sql = 0, sal = 0, won = 0, faturamento = 0, invest = 0;
  for (const c of celulas) {
    if (!passaFiltro(c, filtro)) continue;
    leads += c.leads;
    sql += c.sql;
    sal += c.sal;
    won += c.won;
    faturamento += c.faturamento;
    invest += c.invest;
  }
  // MQL = topo do funil = `leads` (entrada de todos os canais), igual ao projetado
  // (ver agregarProjetado). A coluna `mql` do realizado_funil não entra no funil do
  // bowtie. Investido realizado vem de `invest` (origem media_investment) — ⚠️ hoje
  // é da REDE e inflado, então CPMQL/CPSQL/CPSAL/CAC realizados saem absurdos até o
  // dado virar por unidade.
  return finalize({ leads, mql: leads, sql, sal, won, faturamento, invest });
}

/**
 * Igual a `agregarRealizado`, mas soma TAMBÉM o balde (não-classificado) no total.
 * O balde só tem `mes` (sem tier/subcanal), então só é somado quando o filtro NÃO
 * restringe tier/canal/subcanal — senão distorceria um recorte que o balde não tem.
 * O filtro de meses É aplicado ao balde (default-allow). Assim o TOTAL bate com a
 * fonte (grid + balde), enquanto as linhas por célula (que sempre têm dimensão
 * setada) seguem usando `agregarRealizado` puro (só grid). Ver docs/escopo-seletor-4-modos.md.
 *
 * `wonBancoPorMes` (opcional) é a contagem OFICIAL de WON da `realizado_won`, por
 * mês. Quando fornecida E não há recorte de tier/canal/subcanal, o WON do total
 * passa a ser esse número oficial (ignorando o WON do grid e do balde) — é o que
 * "bate com a realidade". Como `realizado_won` não tem tier/subcanal, num recorte
 * por dimensão caímos no WON do grid (a forma), igual ao balde. As demais métricas
 * (leads/sql/sal/faturamento) seguem do grid+balde. Ticket (fat÷won) e CAC
 * (invest÷won) passam a usar o WON oficial.
 */
export function agregarRealizadoComBalde(
  celulas: RealizadoFunilCelula[],
  balde: BaldeMes[],
  filtro: BowtieFiltro,
  wonBancoPorMes?: Map<string, number> | null,
): BowtieAgg {
  let leads = 0, sql = 0, sal = 0, won = 0, faturamento = 0, invest = 0;
  for (const c of celulas) {
    if (!passaFiltro(c, filtro)) continue;
    leads += c.leads;
    sql += c.sql;
    sal += c.sal;
    won += c.won;
    faturamento += c.faturamento;
    invest += c.invest;
  }
  // Balde só entra quando não há recorte por tier/canal/subcanal (dimensões que ele
  // não possui). O filtro de meses continua valendo (default-allow).
  const semRecorteDimensao =
    isEmpty(filtro.tiers) && isEmpty(filtro.canais) && isEmpty(filtro.subcanais);
  if (semRecorteDimensao) {
    for (const b of balde) {
      if (!isEmpty(filtro.meses) && !filtro.meses!.includes(b.mes)) continue;
      leads += b.leads;
      sql += b.sql;
      sal += b.sal;
      won += b.won;
      faturamento += b.faturamento;
      // invest do balde não existe (fica 0).
    }
  }
  // WON oficial (realizado_won): substitui o WON do grid+balde quando há a fonte e
  // o recorte permite (sem dimensão que o banco não tem). Respeita o filtro de meses.
  if (wonBancoPorMes && semRecorteDimensao) {
    won = 0;
    for (const [mes, w] of wonBancoPorMes) {
      if (!isEmpty(filtro.meses) && !filtro.meses!.includes(mes)) continue;
      won += w;
    }
  }
  return finalize({ leads, mql: leads, sql, sal, won, faturamento, invest });
}

/** Quociente realizado ÷ projetado × 100. 0 quando faltar lado. */
export function aderencia(realizado: number, projetado: number): number {
  if (projetado <= 0 || realizado <= 0) return 0;
  return (realizado / projetado) * 100;
}

export { ZERO_AGG };

/**
 * Concatena conjuntos de células de várias unidades (matriz) em uma lista
 * única — a agregação subsequente já trata como se fosse uma org só.
 */
export function concatRealizadoMatriz(
  conjuntos: Iterable<RealizadoFunilCelula[]>,
): RealizadoFunilCelula[] {
  const out: RealizadoFunilCelula[] = [];
  for (const arr of conjuntos) {
    for (const c of arr) out.push(c);
  }
  return out;
}

// ============================================================
// Atuação por horizonte — usado pela UX do editor pra colapsar
// canais/sub-canais/tiers que não fazem parte do plano da unidade.
// ============================================================

const SUBCANAIS_OUTBOUND_KEYS = [
  "out_indicacao",
  "out_recovery",
  "out_recomendacao",
  "out_prospeccao",
] as const;

type MixOutboundField =
  | "indicacao"
  | "recovery"
  | "recomendacao"
  | "prospeccao";

const SUBCANAL_OUTBOUND_TO_MIX: Record<
  (typeof SUBCANAIS_OUTBOUND_KEYS)[number],
  MixOutboundField
> = {
  out_indicacao: "indicacao",
  out_recovery: "recovery",
  out_recomendacao: "recomendacao",
  out_prospeccao: "prospeccao",
};

export type Atuacao = {
  /** Tiers com pct > 0 no distSplit (P4) do horizonte atual. */
  tiersAtivos: Set<Tier>;
  /**
   * Sub-canais "ligados" pra esse horizonte:
   * - lead_broker se splitLb > 0
   * - black_box se splitBb > 0 E bbPiso > 0 (mesma regra do funil-reverso)
   * - meeting_broker se Enterprise está no distSplit (MB é Enterprise-only)
   * - out_* se o respectivo peso no mix outbound > 0
   */
  subcanaisAtivos: Set<SubCanalKey>;
};

/**
 * Calcula que tiers/sub-canais a unidade *atua* dado um horizonte. Espelha as
 * mesmas regras que `calcularCanalTier`/`calcularPorSubCanalPorTier` usam pra
 * zerar branches do funil — assim o editor só destaca células que de fato
 * receberiam projetado.
 */
export function calcularAtuacao(
  blocks: PremissasBlocks,
  horizonte: Horizonte,
): Atuacao {
  const tiersAtivos = new Set<Tier>();
  const distSplit = blocks.distSplit.find((s) => s.h === horizonte);
  if (distSplit) {
    for (const [tier, pct] of Object.entries(distSplit.pcts) as Array<[Tier, number | undefined]>) {
      if ((pct ?? 0) > 0) tiersAtivos.add(tier);
    }
  }

  const subcanaisAtivos = new Set<SubCanalKey>();
  const p6 = blocks.investimentoMidia.find((i) => i.h === horizonte);
  if ((p6?.splitLb ?? 0) > 0) subcanaisAtivos.add("lead_broker");
  if ((p6?.splitBb ?? 0) > 0 && (p6?.bbPiso ?? 0) > 0) {
    subcanaisAtivos.add("black_box");
  }
  if (tiersAtivos.has("Enterprise")) subcanaisAtivos.add("meeting_broker");
  if ((p6?.splitEv ?? 0) > 0) subcanaisAtivos.add("eventos");

  const mix = blocks.mixSubcanais.find((m) => m.h === horizonte);
  for (const key of SUBCANAIS_OUTBOUND_KEYS) {
    const peso = mix?.[SUBCANAL_OUTBOUND_TO_MIX[key]] ?? 0;
    if (peso > 0) subcanaisAtivos.add(key);
  }

  return { tiersAtivos, subcanaisAtivos };
}
