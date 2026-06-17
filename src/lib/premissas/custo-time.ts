import type { LinhaRampUp } from "@/lib/premissas/funil-reverso";
import type { TimeComercialMembro } from "@/lib/premissas/matriz-defaults";
import { getMesAncora, MESES_ANO_2026 } from "@/lib/realizado/projecao";

const MESES = MESES_ANO_2026 as readonly string[];

/**
 * Fonte única do custo mensal do time comercial.
 *
 * Regra de negócio: a comissão de cada pessoa incide sobre o RESULTADO que ela
 * ajuda a gerar (a receita), não sobre o salário. A receita do mês é atribuída
 * por cargo e rateada entre as pessoas do mesmo cargo pela capacidade de cada
 * uma — ex.: o SDR ganha comissão sobre as vendas que ajuda a gerar; LDR/BDR
 * idem. Usada tanto pelo /time-comercial quanto pela aba Time & Capacidade das
 * /premissas-unidade, pra que as duas telas sempre batam.
 */

/** Soma da capacidade (capacidadePct/100) das pessoas de cada cargo. */
export function disponivelPorCargoDe(team: readonly TimeComercialMembro[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of team) {
    if (!r.cargo) continue;
    m.set(r.cargo, (m.get(r.cargo) ?? 0) + (r.capacidadePct ?? 0) / 100);
  }
  return m;
}

/**
 * Mês de referência da comissão: onde a unidade está agora (mês corrente), com
 * piso no início de operação (mês-âncora) e teto no fim do horizonte do forecast.
 */
export function mesReferenciaComissao(dataInicio: string | null): string {
  const ancora = getMesAncora(dataInicio);
  const hoje = new Date();
  const atual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  let mes = atual < ancora ? ancora : atual;
  if (mes < MESES[0]) mes = MESES[0];
  const ultimo = MESES[MESES.length - 1];
  if (mes > ultimo) mes = ultimo;
  return mes;
}

/**
 * Receita projetada (forecast) do mês de referência — base da comissão por
 * produção. Sem ramp-up disponível (ex.: forecast ainda não calculado no setup),
 * retorna 0, o que zera a comissão e faz o custo cair pro salário base.
 */
export function receitaMesReferencia(
  linhasRampUp: readonly LinhaRampUp[] | undefined,
  dataInicio: string | null,
): number {
  if (!linhasRampUp || linhasRampUp.length === 0) return 0;
  const mesRef = mesReferenciaComissao(dataInicio);
  return linhasRampUp.find((l) => l.mes === mesRef)?.recTotal ?? 0;
}

/**
 * Produção atribuída a uma pessoa: a receita do mês incide por cargo e é rateada
 * entre as pessoas do mesmo cargo pela capacidade atual de cada uma.
 */
export function producaoPessoa(
  m: TimeComercialMembro,
  receitaMesRef: number,
  disponivelPorCargo: Map<string, number>,
): number {
  const capCargo = disponivelPorCargo.get(m.cargo) ?? 0;
  if (capCargo <= 0) return 0;
  return receitaMesRef * ((m.capacidadePct / 100) / capCargo);
}

/** Comissão da pessoa = % sobre a produção (resultado) que ela ajuda a gerar. */
export function comissaoPessoa(
  m: TimeComercialMembro,
  receitaMesRef: number,
  disponivelPorCargo: Map<string, number>,
): number {
  return producaoPessoa(m, receitaMesRef, disponivelPorCargo) * (m.comissaoPct / 100);
}

/**
 * Custo mensal da pessoa = salário base + comissão sobre a produção gerada (NÃO
 * sobre o salário). Sem receita de referência, a comissão é zero e o custo cai
 * pro salário.
 */
export function custoLinhaMes(
  m: TimeComercialMembro,
  receitaMesRef: number,
  disponivelPorCargo: Map<string, number>,
): number {
  return m.salario + comissaoPessoa(m, receitaMesRef, disponivelPorCargo);
}
