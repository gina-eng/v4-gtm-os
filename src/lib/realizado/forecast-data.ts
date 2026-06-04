/**
 * Camada de dados cacheada do Forecast (/realizado).
 *
 * Carrega premissas + realizado e roda o motor (`calcularForecastBundle`) por
 * trás de `unstable_cache`, de modo que requisições repetidas não toquem o banco
 * nem recalculem. A frescura é garantida por **tags**: toda mutação que afeta o
 * forecast de uma unidade invalida a tag correspondente (ver `forecast-tags.ts`
 * e o wiring nas rotas de API).
 *
 * Tags por entrada:
 * - consolidado da Matriz → `forecast:matriz` + `forecast:all`
 * - visão de uma unidade   → `unit:<id>` + `forecast:all`
 *
 * Invalidação (ver `revalidateForecastUnidade` / `revalidateForecastTudo`):
 * - edição de uma unidade → `unit:<id>` (visão dela) + `forecast:matriz` (consolidado)
 * - edição da Matriz       → `forecast:all` (tudo, pois unidades sem premissa própria herdam a Matriz)
 *
 * O mês de referência (`mesRef`, YYYY-MM) entra na chave para a virada de mês
 * invalidar naturalmente (o motor decide meses fechados por `new Date()`).
 */
import { revalidateTag, unstable_cache } from "next/cache";
import {
  getPremissas,
  getPremissasByEntityIds,
  matrizDefaultBlocks,
} from "@/db/repositories/premissas";
import { getRealizado, getRealizadoByOrgIds } from "@/db/repositories/unit-setup";
import {
  REALIZADO_HISTORICO_DEFAULT,
  type DistSplitHorizonte,
  type Horizonte,
  type InvestimentoMes,
  type InvestimentoMidia,
  type MixOutboundHorizonte,
  type OverrideSubcanalMes,
  type RealizadoMensal,
} from "@/lib/premissas/matriz-defaults";
import {
  agregarPorSubCanalMatriz,
  agregarPorSubCanalPorTierMatriz,
  agregarRampUpMatriz,
  calcularForecastBundle,
  type LinhaRampUp,
  type LinhaSubCanal,
  type LinhaSubCanalTier,
} from "@/lib/premissas/funil-reverso";

export const FORECAST_TAG_ALL = "forecast:all";
export const FORECAST_TAG_MATRIZ = "forecast:matriz";
export const forecastTagUnidade = (orgId: string) => `unit:${orgId}`;

/**
 * Invalida o cache do forecast após uma edição que afeta UMA unidade
 * (premissas próprias, investimento/subcanal mensal, realizado, horizonte).
 * Limpa a visão da unidade e o consolidado da Matriz.
 */
export function revalidateForecastUnidade(orgId: string): void {
  // Next 16: o 2º arg ("max") faz purge imediato da tag (route handler).
  revalidateTag(forecastTagUnidade(orgId), "max");
  revalidateTag(FORECAST_TAG_MATRIZ, "max");
}

/**
 * Invalida TUDO — usar quando a edição é nas premissas da Matriz, pois unidades
 * sem premissa própria herdam esses defaults.
 */
export function revalidateForecastTudo(): void {
  revalidateTag(FORECAST_TAG_ALL, "max");
  revalidateTag(FORECAST_TAG_MATRIZ, "max");
}

export type UnitDescriptor = {
  id: string;
  horizonteAtual: Horizonte;
  dataInicio: string | null;
};

export type MatrizForecast = {
  linhasRampUp: LinhaRampUp[];
  linhasSubCanal: LinhaSubCanal[];
  linhasSubCanalTier: LinhaSubCanalTier[];
};

export type UnidadeForecast = MatrizForecast & {
  investimentoMidia: InvestimentoMidia[];
  investimentoMensal: InvestimentoMes[];
  overridesSubcanalMes: OverrideSubcanalMes[];
  matrizInvestimentoMidia: InvestimentoMidia[];
  matrizDistSplit: DistSplitHorizonte[];
  matrizMixSubcanais: MixOutboundHorizonte[];
  realizadoHistorico: RealizadoMensal[];
};

// ── Consolidado da Matriz ────────────────────────────────────────────────

async function computeMatriz(
  descriptors: UnitDescriptor[],
  matrizOrgId: string | null,
): Promise<MatrizForecast> {
  const ids = descriptors.map((d) => d.id);
  const [matrizBlocksRaw, blocksById, realizadoById] = await Promise.all([
    matrizOrgId ? getPremissas(matrizOrgId) : Promise.resolve(null),
    getPremissasByEntityIds(ids),
    getRealizadoByOrgIds(ids),
  ]);
  const matrizBlocks = matrizBlocksRaw ?? matrizDefaultBlocks();

  const rampUp: LinhaRampUp[][] = [];
  const sub: LinhaSubCanal[][] = [];
  const subTier: LinhaSubCanalTier[][] = [];
  for (const u of descriptors) {
    const blocks = blocksById.get(u.id) ?? matrizBlocks;
    const realizado = realizadoById.get(u.id) ?? REALIZADO_HISTORICO_DEFAULT;
    const b = calcularForecastBundle(blocks, u.horizonteAtual, {
      realizadoHistorico: realizado,
      dataInicio: u.dataInicio,
    });
    rampUp.push(b.rampUp);
    sub.push(b.subCanal);
    subTier.push(b.subCanalTier);
  }
  return {
    linhasRampUp: agregarRampUpMatriz(rampUp),
    linhasSubCanal: agregarPorSubCanalMatriz(sub),
    linhasSubCanalTier: agregarPorSubCanalPorTierMatriz(subTier),
  };
}

/** Forecast consolidado da rede — cacheado, invalidado por `forecast:matriz`/`forecast:all`. */
export function getMatrizForecast(
  descriptors: UnitDescriptor[],
  matrizOrgId: string | null,
  mesRef: string,
): Promise<MatrizForecast> {
  // Chave normalizada (ordenada por id) — independe da ordem em que as orgs
  // chegam da sessão. Muda quando entra/sai unidade ou quando horizonte/dataInicio
  // de alguma mudam. O agregado em si é comutativo (somas), então a ordem do
  // cálculo não importa.
  const chave = [...descriptors]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((d) => `${d.id}:${d.horizonteAtual}:${d.dataInicio ?? ""}`)
    .join(",");
  return unstable_cache(
    () => computeMatriz(descriptors, matrizOrgId),
    ["forecast-matriz", mesRef, matrizOrgId ?? "none", chave],
    { tags: [FORECAST_TAG_ALL, FORECAST_TAG_MATRIZ] },
  )();
}

// ── Visão de uma unidade ─────────────────────────────────────────────────

async function computeUnidade(
  unitId: string,
  horizonteAtual: Horizonte,
  dataInicio: string | null,
  matrizOrgId: string | null,
): Promise<UnidadeForecast> {
  const [blocksRaw, realizado, matrizBlocksRaw] = await Promise.all([
    getPremissas(unitId),
    getRealizado(unitId),
    matrizOrgId ? getPremissas(matrizOrgId) : Promise.resolve(null),
  ]);
  const matrizBlocks = matrizBlocksRaw ?? matrizDefaultBlocks();
  const blocks = blocksRaw ?? matrizBlocks;
  const realizadoHistorico = realizado ?? REALIZADO_HISTORICO_DEFAULT;
  const bundle = calcularForecastBundle(blocks, horizonteAtual, {
    realizadoHistorico,
    dataInicio,
  });
  return {
    linhasRampUp: bundle.rampUp,
    linhasSubCanal: bundle.subCanal,
    linhasSubCanalTier: bundle.subCanalTier,
    investimentoMidia: blocks.investimentoMidia,
    investimentoMensal: blocks.investimentoMensal,
    overridesSubcanalMes: blocks.overridesSubcanalMes,
    matrizInvestimentoMidia: matrizBlocks.investimentoMidia,
    matrizDistSplit: matrizBlocks.distSplit,
    matrizMixSubcanais: matrizBlocks.mixSubcanais,
    realizadoHistorico,
  };
}

/** Forecast de uma unidade — cacheado, invalidado por `unit:<id>`/`forecast:all`. */
export function getUnidadeForecast(
  unitId: string,
  horizonteAtual: Horizonte,
  dataInicio: string | null,
  matrizOrgId: string | null,
  mesRef: string,
): Promise<UnidadeForecast> {
  return unstable_cache(
    () => computeUnidade(unitId, horizonteAtual, dataInicio, matrizOrgId),
    ["forecast-unidade", unitId, horizonteAtual, dataInicio ?? "null", matrizOrgId ?? "none", mesRef],
    { tags: [FORECAST_TAG_ALL, forecastTagUnidade(unitId)] },
  )();
}
