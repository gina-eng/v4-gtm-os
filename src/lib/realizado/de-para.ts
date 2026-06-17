/**
 * De-para dos rótulos crus do BI (landing `realizado_import_lead`) para o domínio
 * do sistema (8 subcanais, 5 tiers, 3 categorias de produto). Fonte única usada
 * pela derivação `scripts/derive-realizado-funil.ts`.
 *
 * Decisões (ver docs/realizado-extract-spec.md e o plano de derivação):
 * - Canais "óbvios" mapeiam direto; especiais: Reativação→out_recovery,
 *   Networking→out_indicacao, LP Matriz/LP Franquia/Inside Box→black_box.
 * - `Sem preenchimento` e qualquer rótulo desconhecido → null (fica fora do funil).
 * - Tier: normaliza caixa (MEDIUM→Medium); fora dos 5 (Non-ICP, Sem mapeamento,
 *   Sem Lead, etc.) → null.
 * - Categoria: Saber/Ter/Executar; qualquer outro → '' (sem produto).
 */

import type { SubCanalKey } from "@/lib/premissas/funil-reverso";
import type { Tier } from "@/lib/premissas/matriz-defaults";

/** Rótulo de `canal_aquisicao` (BI) → chave de subcanal, ou null (fora do funil). */
export const CANAL_BI_TO_SUBCANAL: Record<string, SubCanalKey | null> = {
  Blackbox: "black_box",
  Leadbroker: "lead_broker",
  Recovery: "out_recovery",
  Indicação: "out_indicacao",
  "Prospecção Fria": "out_prospeccao",
  Recomendação: "out_recomendacao",
  Eventos: "eventos",
  Meetingbroker: "meeting_broker",
  // Especiais (de-para aprovado):
  Reativação: "out_recovery",
  Networking: "out_indicacao",
  "LP Matriz": "black_box",
  "LP Franquia": "black_box",
  "Inside Box": "black_box",
  // Fora do funil:
  "Sem preenchimento": null,
};

/** Mapeia `canal_aquisicao` cru → SubCanalKey (null se desconhecido/excluído). */
export function mapCanal(raw: string | null | undefined): SubCanalKey | null {
  const key = (raw ?? "").trim();
  if (key in CANAL_BI_TO_SUBCANAL) return CANAL_BI_TO_SUBCANAL[key];
  return null;
}

/**
 * De-para das colunas de investido da landing `realizado_import_investimento`
 * (entrega "wide" do time de dados) para os subcanais do sistema.
 *
 * Fechado hoje: lb→Lead Broker, mb→Meeting Broker, bb→Black Box. A coluna `db`
 * fica DE FORA por ora (subcanal ainda indefinido) — é guardada crua na landing,
 * mas não entra no funil/bowtie até o de-para ser definido. Eventos (EV) não vem
 * nesta entrega, então não recebe investido por esta fonte.
 *
 * Ao definir `db` (e/ou eventos), basta acrescentar a chave aqui — a derivação e o
 * bowtie já consomem o mapa, sem outras mudanças.
 */
export const INVEST_COL_TO_SUBCANAL = {
  lb: "lead_broker",
  mb: "meeting_broker",
  bb: "black_box",
} as const satisfies Record<string, SubCanalKey>;

const TIER_BY_UPPER: Record<string, Tier> = {
  TINY: "Tiny",
  SMALL: "Small",
  MEDIUM: "Medium",
  LARGE: "Large",
  ENTERPRISE: "Enterprise",
};

/** Normaliza tier cru (caixa-alta/título) → Tier; null se fora dos 5. */
export function normalizeTier(raw: string | null | undefined): Tier | null {
  return TIER_BY_UPPER[(raw ?? "").trim().toUpperCase()] ?? null;
}

const CATEGORIAS = new Set(["Saber", "Ter", "Executar"]);

/** Categoria de produto válida (Saber/Ter/Executar) ou '' (sem produto). */
export function categoriaProduto(raw: string | null | undefined): string {
  const c = (raw ?? "").trim();
  return CATEGORIAS.has(c) ? c : "";
}

/**
 * Subcanais com estágio MQL (funil longo: Leads→MQL→SQL→SAL→Won). Espelha o
 * forecast (`calcularPorSubCanalPorTier`): só Lead Broker e Black Box têm MQL.
 * Meeting Broker, Eventos e os 4 Outbound são funil curto (começam no SQL, com
 * `mql = 0`). A derivação do realizado NÃO conta MQL fora desses canais, pra que
 * o estágio EDUCATION fique comparável dos dois lados (projetado vs realizado) —
 * senão o realizado contaria todo lead como MQL e o projetado só LB/BB.
 */
export const SUBCANAIS_COM_MQL: ReadonlySet<SubCanalKey> = new Set<SubCanalKey>([
  "lead_broker",
  "black_box",
]);

/** True se o subcanal tem estágio MQL (funil longo). */
export function subcanalTemMql(sc: SubCanalKey): boolean {
  return SUBCANAIS_COM_MQL.has(sc);
}
