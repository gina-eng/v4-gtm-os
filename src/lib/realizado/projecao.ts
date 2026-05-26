import type {
  Horizonte,
  HorizonteCrescimento,
  RealizadoMensal,
} from "@/lib/premissas/matriz-defaults";

/**
 * Ano modelado pelo sistema. Todo o catálogo de meses, projeção e janela do
 * Realizado Histórico se referem a esse ano. Quando o sistema modelar mais de um
 * ano, trocar essa constante por uma lista ou um seletor.
 */
export const ANO_MODELADO = 2026;

/** Todos os meses do ano modelado — usado para gerar a tabela completa. */
export const MESES_ANO_2026 = [
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-08",
  "2026-09",
  "2026-10",
  "2026-11",
  "2026-12",
] as const;

const PRIMEIRO_MES_ANO = MESES_ANO_2026[0];
const ULTIMO_MES_ANO = MESES_ANO_2026[MESES_ANO_2026.length - 1];

function toMesIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Mês de referência usado pela projeção — deriva de `new Date()` mas clampa
 * dentro do ano modelado:
 * - antes de jan/2026: retorna "2026-01" (nada fechado ainda).
 * - depois de dez/2026: retorna "2026-12" (ano todo já fechou).
 *
 * Aceita uma data customizada para facilitar testes/seed.
 */
export function getMesReferenciaAtual(now: Date = new Date()): string {
  const iso = toMesIso(now);
  if (iso < PRIMEIRO_MES_ANO) return PRIMEIRO_MES_ANO;
  if (iso > ULTIMO_MES_ANO) return ULTIMO_MES_ANO;
  return iso;
}

/**
 * Último mês fechado = mês anterior ao de referência. Quando estamos no
 * primeiro mês do ano, não há mês fechado ainda — retorna "2025-12" (qualquer
 * comparação `mes <= ULTIMO_MES_FECHADO` resulta em "todos são futuros").
 */
export function getUltimoMesFechado(now: Date = new Date()): string {
  const ref = getMesReferenciaAtual(now);
  if (ref === PRIMEIRO_MES_ANO) return `${ANO_MODELADO - 1}-12`;
  const idx = (MESES_ANO_2026 as readonly string[]).indexOf(ref);
  return idx > 0 ? MESES_ANO_2026[idx - 1] : `${ANO_MODELADO - 1}-12`;
}

/**
 * Snapshot avaliado uma vez no carregamento do módulo. Para a maioria dos
 * componentes basta usar essa constante; código que precisa reagir à virada
 * de mês em tempo real deve chamar `getMesReferenciaAtual()` diretamente.
 */
export const MES_REFERENCIA_ATUAL = getMesReferenciaAtual();
export const ULTIMO_MES_FECHADO = getUltimoMesFechado();

const NOMES_MESES_PT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;

/** "2026-03" → "Mar 2026". */
export function formatMesPt(mes: string): string {
  const [ano, mm] = mes.split("-");
  const idx = Number(mm) - 1;
  if (idx < 0 || idx >= NOMES_MESES_PT.length) return mes;
  return `${NOMES_MESES_PT[idx]} ${ano}`;
}

export type LinhaRealizadoProjetado = {
  mes: string;
  /** Valor que a unidade digitou para este mês. Pode ser 0 (ainda não preenchido). */
  realizado: number;
  /**
   * Forecast mês-a-mês (rolling):
   * - meses **fechados**: igual ao realizado (o número efetivo é o próprio forecast).
   * - meses **futuros**: projetados a partir do mês-base (o fechado mais recente
   *   com faturamento) capitalizando à taxa fixa do horizonte atual —
   *   base × (1 + crescMensalPct/100)^n.
   * - 0 quando não há nenhum mês fechado preenchido (sem base pra projetar).
   */
  projetado: number;
  /** True para meses futuros (depois do último mês fechado). */
  isProjetado: boolean;
  /** Horizonte usado para projetar o mês futuro. Null em meses fechados ou sem base. */
  horizonteAplicado: Horizonte | null;
};

/**
 * Determina o mês-âncora da unidade dentro do ano modelado.
 *
 * - Sem `dataInicio` ou `dataInicio` anterior a jan/2026: âncora = jan/2026.
 * - `dataInicio` dentro de 2026: âncora = mês de `dataInicio` (ex.: unidade que
 *   abriu em jul/2026 ancora em jul/2026; meses anteriores ficam fora da curva).
 * - `dataInicio` posterior a dez/2026: âncora = dez/2026 (caso de borda — a
 *   unidade ainda não opera em 2026, então não há projetado pra exibir).
 */
export function getMesAncora(dataInicio: string | null | undefined): string {
  if (!dataInicio) return MESES_ANO_2026[0];
  // dataInicio vem como "YYYY-MM-DD"; o mês ISO "YYYY-MM" sai por slice.
  const mesInicio = dataInicio.slice(0, 7);
  if (mesInicio <= MESES_ANO_2026[0]) return MESES_ANO_2026[0];
  if (mesInicio >= MESES_ANO_2026[MESES_ANO_2026.length - 1]) {
    return MESES_ANO_2026[MESES_ANO_2026.length - 1];
  }
  return mesInicio;
}

type ProjecaoOpts = {
  /** Data de inauguração da unidade (YYYY-MM-DD). Usada para escolher a âncora. */
  dataInicio?: string | null;
};

/**
 * Determina o mês-base do forecast: o mês **fechado mais recente** (dentro da
 * operação da unidade) com faturamento preenchido. É a partir dele que a curva
 * futura é projetada. Retorna `null` quando nenhum mês fechado foi preenchido.
 */
export function getMesBaseForecast(
  realizadoMensal: RealizadoMensal[],
  opts: ProjecaoOpts = {},
): string | null {
  const realizadoByMes = new Map<string, RealizadoMensal>();
  for (const r of realizadoMensal) realizadoByMes.set(r.mes, r);
  const mesAncora = getMesAncora(opts.dataInicio);
  const ultimoMesFechado = getUltimoMesFechado();
  let base: string | null = null;
  for (const mes of MESES_ANO_2026) {
    if (mes < mesAncora || mes > ultimoMesFechado) continue;
    if ((realizadoByMes.get(mes)?.faturamento ?? 0) > 0) base = mes;
  }
  return base;
}

/**
 * Monta a tabela mês-a-mês de forecast (rolling) para o ano modelado.
 *
 * Regra:
 * - **Mês-base** = mês fechado mais recente com faturamento (ver
 *   `getMesBaseForecast`). A projeção dos meses futuros parte dele.
 * - **Taxa** = `crescMensalPct` do horizonte atual da unidade (P1). Fixa o ano
 *   inteiro — não troca quando ultrapassa `faixaMax`.
 * - Meses **fechados** (≥ mês de início da unidade): `projetado = realizado`,
 *   pois o número efetivo é o próprio forecast realizado.
 * - Meses **futuros**: `projetado = base × (1 + taxa/100)^n`, onde n é a
 *   distância em meses até o mês-base.
 * - Meses **antes** do início da unidade ficam zerados.
 * - Sem nenhum mês fechado preenchido, não há base → tudo zerado.
 */
export function calcularRealizadoVsProjetado(
  realizadoMensal: RealizadoMensal[],
  horizontes: HorizonteCrescimento[],
  horizonteAtual: Horizonte,
  opts: ProjecaoOpts = {},
): LinhaRealizadoProjetado[] {
  const realizadoByMes = new Map<string, RealizadoMensal>();
  for (const r of realizadoMensal) realizadoByMes.set(r.mes, r);

  const mesAncora = getMesAncora(opts.dataInicio);
  const horizonte =
    horizontes.find((h) => h.h === horizonteAtual) ??
    horizontes[horizontes.length - 1];
  const taxa = horizonte?.crescMensalPct ?? 0;
  const ultimoMesFechado = getUltimoMesFechado();

  const mesBase = getMesBaseForecast(realizadoMensal, opts);
  const valorBase = mesBase
    ? realizadoByMes.get(mesBase)?.faturamento ?? 0
    : 0;
  const idxBase = mesBase
    ? (MESES_ANO_2026 as readonly string[]).indexOf(mesBase)
    : -1;

  const linhas: LinhaRealizadoProjetado[] = [];
  for (const mes of MESES_ANO_2026) {
    const realizado = realizadoByMes.get(mes)?.faturamento ?? 0;
    const isAntesDaAncora = mes < mesAncora;
    const isMesFechado = mes <= ultimoMesFechado;

    if (isAntesDaAncora) {
      linhas.push({
        mes,
        realizado: 0,
        projetado: 0,
        isProjetado: false,
        horizonteAplicado: null,
      });
      continue;
    }

    if (isMesFechado) {
      // Mês fechado: o forecast é o próprio realizado.
      linhas.push({
        mes,
        realizado,
        projetado: realizado,
        isProjetado: false,
        horizonteAplicado: null,
      });
      continue;
    }

    // Mês futuro: capitaliza a partir do mês-base pela taxa do horizonte.
    if (mesBase) {
      const n = (MESES_ANO_2026 as readonly string[]).indexOf(mes) - idxBase;
      linhas.push({
        mes,
        realizado,
        projetado: Math.round(valorBase * Math.pow(1 + taxa / 100, n)),
        isProjetado: true,
        horizonteAplicado: horizonteAtual,
      });
    } else {
      linhas.push({
        mes,
        realizado,
        projetado: 0,
        isProjetado: true,
        horizonteAplicado: null,
      });
    }
  }

  return linhas;
}

/**
 * Agrega linhas de várias unidades em uma proxy consolidada para a Matriz.
 * Soma realizado e projetado mês a mês. Cada unidade traz suas próprias linhas
 * já calculadas com seu próprio `horizonteAtual`.
 */
export function agregarLinhasMatriz(
  conjuntos: LinhaRealizadoProjetado[][],
): LinhaRealizadoProjetado[] {
  const acc = new Map<string, LinhaRealizadoProjetado>();
  for (const mes of MESES_ANO_2026) {
    acc.set(mes, {
      mes,
      realizado: 0,
      projetado: 0,
      isProjetado: mes > ULTIMO_MES_FECHADO,
      horizonteAplicado: null,
    });
  }
  for (const linhas of conjuntos) {
    for (const linha of linhas) {
      const cur = acc.get(linha.mes);
      if (!cur) continue;
      cur.realizado += linha.realizado;
      cur.projetado += linha.projetado;
    }
  }
  return Array.from(acc.values()).sort((a, b) => a.mes.localeCompare(b.mes));
}

/**
 * Aderência percentual: realizado ÷ projetado × 100. Retorna 0 quando faltar
 * qualquer um dos lados (evita reportar 0% como "abaixo da meta" quando na
 * verdade o dado ainda não chegou).
 */
export function aderenciaPercentual(
  realizado: number,
  projetado: number,
): number {
  if (projetado <= 0 || realizado <= 0) return 0;
  return (realizado / projetado) * 100;
}

/** Aderência de uma linha (mês a mês). Açúcar sobre `aderenciaPercentual`. */
export function aderencia(linha: LinhaRealizadoProjetado): number {
  return aderenciaPercentual(linha.realizado, linha.projetado);
}

/** CAC do mês: investido ÷ won. 0 quando won=0. */
export function cacMes(r: { investido: number; won: number }): number {
  if (r.won <= 0) return 0;
  return r.investido / r.won;
}
