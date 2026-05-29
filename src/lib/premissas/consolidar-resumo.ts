/**
 * Consolidação de resumos do funil 2026 — usado na visão matriz da rede.
 *
 * Estratégia: para cada unidade, calcula `ResumoCompleto` com as premissas,
 * horizonte e realizado dela; depois soma os absolutos mês a mês e recalcula
 * taxas/ROAS/CPL/TM a partir das somas (não da média das razões).
 *
 * `isFechado` por mês é determinado pelo calendário (mesmo `ULTIMO_MES_FECHADO`
 * pra toda a rede), então herda do primeiro resumo informado.
 */

import type {
  ResumoCompleto,
  ResumoMensalLinha,
  ResumoMetricas,
} from "./funil-reverso";

const safeDiv = (n: number, d: number) => (d > 0 ? n / d : 0);

/** Soma os campos absolutos de duas métricas (taxas/CPL/TM/ROAS são derivados). */
function somaAbsolutos(a: ResumoMetricas, b: ResumoMetricas): ResumoMetricas {
  return {
    investimentoTotal: a.investimentoTotal + b.investimentoTotal,
    mql: a.mql + b.mql,
    sql: a.sql + b.sql,
    sal: a.sal + b.sal,
    won: a.won + b.won,
    wonSaber: a.wonSaber + b.wonSaber,
    wonTer: a.wonTer + b.wonTer,
    wonExecutar: a.wonExecutar + b.wonExecutar,
    receitaTotal: a.receitaTotal + b.receitaTotal,
    receitaSaber: a.receitaSaber + b.receitaSaber,
    receitaTer: a.receitaTer + b.receitaTer,
    receitaExecutar: a.receitaExecutar + b.receitaExecutar,
    investInbound: a.investInbound + b.investInbound,
    leadsInbound: a.leadsInbound + b.leadsInbound,
    // Os campos derivados são recalculados em `finalizar` — aqui ficam zerados
    // pra não vazarem médias intermediárias.
    tmSaber: 0,
    tmTer: 0,
    tmExecutar: 0,
    taxaMqlSql: 0,
    taxaSqlSal: 0,
    taxaSalWon: 0,
    roas: 0,
    cpl: 0,
  };
}

/** Recalcula campos derivados (TM, taxas, ROAS, CPL) a partir dos absolutos. */
function finalizar(m: ResumoMetricas): ResumoMetricas {
  return {
    ...m,
    tmSaber: safeDiv(m.receitaSaber, m.wonSaber),
    tmTer: safeDiv(m.receitaTer, m.wonTer),
    tmExecutar: safeDiv(m.receitaExecutar, m.wonExecutar),
    taxaMqlSql: safeDiv(m.sql, m.mql),
    taxaSqlSal: safeDiv(m.sal, m.sql),
    taxaSalWon: safeDiv(m.won, m.sal),
    roas: safeDiv(m.receitaTotal, m.investimentoTotal),
    cpl: safeDiv(m.investInbound, m.leadsInbound),
  };
}

function zeradoMetricas(): ResumoMetricas {
  return {
    investimentoTotal: 0,
    mql: 0,
    sql: 0,
    sal: 0,
    won: 0,
    wonSaber: 0,
    wonTer: 0,
    wonExecutar: 0,
    receitaTotal: 0,
    receitaSaber: 0,
    receitaTer: 0,
    receitaExecutar: 0,
    tmSaber: 0,
    tmTer: 0,
    tmExecutar: 0,
    taxaMqlSql: 0,
    taxaSqlSal: 0,
    taxaSalWon: 0,
    roas: 0,
    cpl: 0,
    investInbound: 0,
    leadsInbound: 0,
  };
}

/**
 * Consolida vários resumos numa única visão da rede. Retorna `null` se a lista
 * for vazia (nada pra mostrar). Pressupõe que todos os resumos cobrem o mesmo
 * calendário (jan→dez/2026); o `isFechado` mensal é herdado do primeiro.
 */
export function consolidarResumos(resumos: ResumoCompleto[]): ResumoCompleto | null {
  if (resumos.length === 0) return null;

  const base = resumos[0]!;
  const mesesConsolidados: ResumoMensalLinha[] = base.meses.map((linha, idx) => {
    let agg: ResumoMetricas = zeradoMetricas();
    for (const r of resumos) {
      const m = r.meses[idx];
      if (m) agg = somaAbsolutos(agg, m);
    }
    return {
      mes: linha.mes,
      isFechado: linha.isFechado,
      ...finalizar(agg),
    };
  });

  let totalAgg: ResumoMetricas = zeradoMetricas();
  for (const r of resumos) {
    totalAgg = somaAbsolutos(totalAgg, r.total);
  }

  return {
    meses: mesesConsolidados,
    total: finalizar(totalAgg),
  };
}
