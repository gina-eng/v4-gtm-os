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
   * - meses **futuros**: projetados mês a mês a partir do mês-base capitalizando
   *   à taxa do horizonte efetivo do mês anterior (promoção automática quando o
   *   patamar do mês ultrapassa `faixaMax`).
   * - 0 quando não há nenhum mês fechado preenchido (sem base pra projetar).
   */
  projetado: number;
  /** True para meses futuros (depois do último mês fechado). */
  isProjetado: boolean;
  /**
   * Horizonte efetivo do mês — o patamar em que o faturamento daquele mês cai
   * (`faixaMin ≤ valor ≤ faixaMax`), respeitando o piso `horizonteAtual`. Define
   * as premissas aplicáveis (splits, pcts, mix, taxa de crescimento). Null em
   * meses anteriores à âncora ou quando não há base pra calcular.
   */
  horizonteAplicado: Horizonte | null;
};

const HORIZONTE_ORDER = ["H1", "H2", "H3", "H4", "H5"] as const;

/**
 * Determina o horizonte efetivo de um patamar de faturamento.
 *
 * Regra: o menor horizonte H tal que `valor ≤ faixaMax(H)`, respeitando o piso
 * `minHorizonte` (a unidade nunca regride pra baixo do horizonte cadastrado).
 * Quando o valor passa do teto de H5 (`faixaMax = null`), continua em H5.
 *
 * Exemplo: minHorizonte=H1, valor=200_000 → H3 (porque 200k > faixaMax(H2)=150k
 * mas ≤ faixaMax(H3)=450k).
 */
export function horizonteEfetivo(
  valor: number,
  horizontes: HorizonteCrescimento[],
  minHorizonte: Horizonte,
): Horizonte {
  const byH = new Map(horizontes.map((h) => [h.h, h] as const));
  const minIdx = HORIZONTE_ORDER.indexOf(minHorizonte);
  for (let i = Math.max(0, minIdx); i < HORIZONTE_ORDER.length; i++) {
    const h = HORIZONTE_ORDER[i];
    const config = byH.get(h);
    if (!config) continue;
    // H5 tem faixaMax=null → topo, qualquer valor cabe.
    if (config.faixaMax === null) return h;
    if (valor <= config.faixaMax) return h;
  }
  return HORIZONTE_ORDER[HORIZONTE_ORDER.length - 1];
}

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
 * Regra de promoção (importante):
 * - O `horizonteAplicado` de um mês é o horizonte vivo no INÍCIO dele — ou
 *   seja, herdado do mês anterior. Quando um mês fechado ultrapassa
 *   `faixaMax`, a promoção vale a partir do mês SEGUINTE (não retroage no
 *   próprio mês que cruzou a faixa).
 * - Exemplo: unidade H1 (faixaMax 60k). Maio fecha em 61k → maio é exibido
 *   como H1 (a unidade viveu maio em H1); junho já entra em H2 e aplica as
 *   premissas de H2 (taxa, splits, mix, pct produção).
 *
 * Demais regras:
 * - **Mês-base** = mês fechado mais recente com faturamento. Projeções partem
 *   dele capitalizando mês a mês pela taxa do horizonte vivo no início de cada
 *   mês futuro.
 * - Meses **fechados** (≥ mês de início da unidade): `projetado = realizado`.
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
  const horizontesByH = new Map(horizontes.map((h) => [h.h, h] as const));
  const ultimoMesFechado = getUltimoMesFechado();

  const mesBase = getMesBaseForecast(realizadoMensal, opts);
  const valorBase = mesBase
    ? realizadoByMes.get(mesBase)?.faturamento ?? 0
    : 0;

  // `horizonteVivo` = patamar conquistado pela unidade, atualizado APÓS cada
  // mês que cruza `faixaMax`. Começa no horizonte cadastrado (piso); só sobe.
  let horizonteVivo: Horizonte = horizonteAtual;
  // `valor` = último faturamento vivo da curva interna; capitaliza mês a mês
  // mesmo quando o mês corrente é fechado-sem-dado (preserva a aritmética).
  let valor = 0;
  const promover = (v: number) => {
    if (v <= 0) return;
    const novoH = horizonteEfetivo(v, horizontes, horizonteAtual);
    if (idxHorizonte(novoH) > idxHorizonte(horizonteVivo)) horizonteVivo = novoH;
  };

  const linhas: LinhaRealizadoProjetado[] = [];
  for (const mes of MESES_ANO_2026) {
    const realizado = realizadoByMes.get(mes)?.faturamento ?? 0;
    const isAntesDaAncora = mes < mesAncora;
    const isMesFechado = mes <= ultimoMesFechado;

    if (isAntesDaAncora || !mesBase) {
      linhas.push({
        mes,
        realizado: 0,
        projetado: 0,
        isProjetado: false,
        horizonteAplicado: null,
      });
      continue;
    }

    if (mes < mesBase) {
      // Antes do mês-base: mostra realizado. O horizonte exibido é o vivo no
      // início do mês (=horizonteVivo antes da promoção causada por este mês).
      linhas.push({
        mes,
        realizado,
        projetado: realizado,
        isProjetado: false,
        horizonteAplicado: realizado > 0 ? horizonteVivo : null,
      });
      if (realizado > 0) {
        valor = realizado;
        promover(realizado); // promove pro próximo mês.
      }
      continue;
    }

    if (mes === mesBase) {
      valor = valorBase;
      linhas.push({
        mes,
        realizado: valorBase,
        projetado: valorBase,
        isProjetado: false,
        horizonteAplicado: horizonteVivo,
      });
      promover(valorBase);
      continue;
    }

    // mes > mesBase — capitaliza com a taxa do horizonte vivo no início do
    // mês. Se o mês ANTERIOR cruzou faixaMax, este mês já cresce na taxa nova.
    const taxa = horizontesByH.get(horizonteVivo)?.crescMensalPct ?? 0;
    valor = Math.round(valor * (1 + taxa / 100));

    if (isMesFechado) {
      // Fechado sem dado (post-base, fat=0). Mantém valor virtual silencioso.
      linhas.push({
        mes,
        realizado: 0,
        projetado: 0,
        isProjetado: false,
        horizonteAplicado: null,
      });
      continue;
    }

    // Futuro: o horizonte do mês é o vivo no início; promoção acontece DEPOIS.
    linhas.push({
      mes,
      realizado,
      projetado: valor,
      isProjetado: true,
      horizonteAplicado: horizonteVivo,
    });
    promover(valor);
  }

  return linhas;
}

function idxHorizonte(h: Horizonte): number {
  return HORIZONTE_ORDER.indexOf(h as (typeof HORIZONTE_ORDER)[number]);
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
