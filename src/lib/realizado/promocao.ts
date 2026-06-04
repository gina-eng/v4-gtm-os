/**
 * Detector de status de horizonte — promoção / rebaixamento a partir do
 * **realizado fechado**.
 *
 * Diferente de `calcularRealizadoVsProjetado` (que promove o `horizonteVivo`
 * varrendo meses fechados E projetados, só para exibir o forecast), aqui
 * avaliamos **apenas meses fechados** dentro da operação da unidade e
 * devolvemos o horizonte que o realizado de fato sustenta — incluindo uma
 * promoção disparada pelo último mês fechado. É o sinal que a matriz aprova na
 * tela /validacao-crescimento para gravar o novo `organizations.horizonteAtual`.
 *
 * Regra de promoção: mesma do motor (`MESES_PARA_PROMOVER` meses consecutivos
 * com faturamento acima do `faixaMax` do horizonte vivo — sobe um degrau).
 * Regra de rebaixamento (nova, simétrica): `MESES_PARA_REBAIXAR` meses
 * consecutivos com faturamento abaixo do `faixaMin` do `horizonteAtual` →
 * sugere o horizonte natural do patamar recente.
 *
 * Exemplos:
 * - H1 (faixaMax 60k), meses fechados 70k/80k/90k → promover H2.
 * - H3 (faixaMin 150k), meses fechados 100k/90k/80k → rebaixar (sugere o
 *   horizonte onde 80k cai, ex. H2).
 */

import type { Horizonte, HorizonteCrescimento, RealizadoMensal } from "@/lib/premissas/matriz-defaults";
import {
  getMesAncora,
  getUltimoMesFechado,
  horizonteEfetivo,
  HORIZONTE_ORDER,
  idxHorizonte,
  MESES_ANO_2026,
  MESES_PARA_PROMOVER,
} from "@/lib/realizado/projecao";

/** Nº de meses fechados consecutivos abaixo do faixaMin pra sugerir rebaixamento. */
export const MESES_PARA_REBAIXAR = 3;

export type StatusHorizonte = {
  /** Piso comprometido (organizations.horizonteAtual). */
  horizonteAtual: Horizonte;
  /** Horizonte que o realizado fechado sustenta hoje. */
  horizonteRealizado: Horizonte;
  status: "estavel" | "promover" | "rebaixar";
  /** Alvo da aprovação. null quando estável. */
  horizonteSugerido: Horizonte | null;
  /** Meses fechados consecutivos sustentando o sinal (acima do teto / abaixo do piso). */
  mesesConsecutivos: number;
  /** Último mês fechado com faturamento > 0 considerado. null se não houver. */
  ultimoMesFechadoComDado: string | null;
};

type DetectarOpts = {
  /** Data de inauguração da unidade (YYYY-MM-DD). Define o mês-âncora dentro de 2026. */
  dataInicio?: string | null;
};

/**
 * Avalia o realizado fechado de uma unidade e devolve se ela deveria promover,
 * rebaixar ou está estável em relação ao `horizonteAtual` comprometido.
 */
export function detectarStatusHorizonte(
  realizadoMensal: RealizadoMensal[],
  horizontes: HorizonteCrescimento[],
  horizonteAtual: Horizonte,
  opts: DetectarOpts = {},
): StatusHorizonte {
  const estavel: StatusHorizonte = {
    horizonteAtual,
    horizonteRealizado: horizonteAtual,
    status: "estavel",
    horizonteSugerido: null,
    mesesConsecutivos: 0,
    ultimoMesFechadoComDado: null,
  };

  const byMes = new Map<string, RealizadoMensal>();
  for (const r of realizadoMensal) byMes.set(r.mes, r);
  const byH = new Map(horizontes.map((h) => [h.h, h] as const));

  const mesAncora = getMesAncora(opts.dataInicio);
  const ultimoMesFechado = getUltimoMesFechado();

  // Meses fechados, dentro da operação da unidade, com faturamento preenchido.
  const fechadosComDado: { mes: string; faturamento: number }[] = [];
  for (const mes of MESES_ANO_2026) {
    if (mes < mesAncora || mes > ultimoMesFechado) continue;
    const faturamento = byMes.get(mes)?.faturamento ?? 0;
    if (faturamento > 0) fechadosComDado.push({ mes, faturamento });
  }
  if (fechadosComDado.length === 0) return estavel;

  const ultimoMesFechadoComDado = fechadosComDado[fechadosComDado.length - 1].mes;
  const ultimoValor = fechadosComDado[fechadosComDado.length - 1].faturamento;

  // ---- Promoção: replica o motor (avalia só meses fechados com dado). ----
  let horizonteVivo: Horizonte = horizonteAtual;
  let acimaConsec = 0;
  for (const { faturamento } of fechadosComDado) {
    const config = byH.get(horizonteVivo);
    if (!config) continue;
    if (config.faixaMax === null) {
      acimaConsec = 0; // H5 é teto.
      continue;
    }
    if (faturamento > config.faixaMax) {
      acimaConsec += 1;
      if (acimaConsec >= MESES_PARA_PROMOVER) {
        const prox = idxHorizonte(horizonteVivo) + 1;
        if (prox < HORIZONTE_ORDER.length) horizonteVivo = HORIZONTE_ORDER[prox];
        acimaConsec = 0;
      }
    } else {
      acimaConsec = 0;
    }
  }

  if (idxHorizonte(horizonteVivo) > idxHorizonte(horizonteAtual)) {
    return {
      horizonteAtual,
      horizonteRealizado: horizonteVivo,
      status: "promover",
      horizonteSugerido: horizonteVivo,
      mesesConsecutivos: contarConsecutivosAcima(fechadosComDado, byH, horizonteAtual),
      ultimoMesFechadoComDado,
    };
  }

  // ---- Rebaixamento: meses consecutivos abaixo do faixaMin do piso atual. ----
  const pisoConfig = byH.get(horizonteAtual);
  const faixaMinAtual = pisoConfig?.faixaMin ?? 0;
  let abaixoConsec = 0;
  for (const { faturamento } of fechadosComDado) {
    if (faturamento < faixaMinAtual) abaixoConsec += 1;
    else abaixoConsec = 0;
  }

  if (faixaMinAtual > 0 && abaixoConsec >= MESES_PARA_REBAIXAR) {
    // Horizonte natural do patamar recente, sem clamp no piso atual.
    const sugerido = horizonteEfetivo(ultimoValor, horizontes, "H1");
    if (idxHorizonte(sugerido) < idxHorizonte(horizonteAtual)) {
      return {
        horizonteAtual,
        horizonteRealizado: sugerido,
        status: "rebaixar",
        horizonteSugerido: sugerido,
        mesesConsecutivos: abaixoConsec,
        ultimoMesFechadoComDado,
      };
    }
  }

  return { ...estavel, ultimoMesFechadoComDado };
}

/**
 * Conta quantos dos últimos meses fechados (em sequência, do fim pro começo)
 * ficaram acima do faixaMax do `horizonteAtual` — usado só pra exibir "X meses
 * acima do teto" no card. Aproximação para UX, não para a decisão.
 */
function contarConsecutivosAcima(
  fechados: { mes: string; faturamento: number }[],
  byH: Map<Horizonte, HorizonteCrescimento>,
  horizonteAtual: Horizonte,
): number {
  const faixaMax = byH.get(horizonteAtual)?.faixaMax;
  if (faixaMax == null) return 0;
  let count = 0;
  for (let i = fechados.length - 1; i >= 0; i--) {
    if (fechados[i].faturamento > faixaMax) count += 1;
    else break;
  }
  return count;
}
