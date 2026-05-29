/**
 * Repository do realizado do funil bowtie — grão (organizationId × mes × subcanal × tier).
 *
 * O input é manual hoje (tela /bowtie) e amanhã virá de um sistema externo. Tanto
 * o consumo (visualização) quanto a escrita (editor inline) passam por aqui.
 *
 * Granularidade casa 1-pra-1 com `calcularPorSubCanalPorTier` em
 * `src/lib/premissas/funil-reverso.ts` — assim os filtros do /bowtie agregam
 * projetado e realizado pelo mesmo eixo.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { realizadoFunil } from "@/db/schema";
import type { SubCanalKey } from "@/lib/premissas/funil-reverso";
import { SUB_CANAIS } from "@/lib/premissas/funil-reverso";
import type { Tier } from "@/lib/premissas/matriz-defaults";
import { MESES_ANO_2026 } from "@/lib/realizado/projecao";

/**
 * Uma célula do realizado bowtie. Todos os campos numéricos vêm como `number`
 * (drizzle converte `double precision` automaticamente).
 */
export type RealizadoFunilCelula = {
  mes: string;
  subcanal: SubCanalKey;
  tier: Tier;
  leads: number;
  mql: number;
  sql: number;
  sal: number;
  won: number;
  faturamento: number;
};

const SUBCANAL_KEYS = new Set<string>(SUB_CANAIS.map((s) => s.key));
const TIER_KEYS = new Set<string>(["Tiny", "Small", "Medium", "Large", "Enterprise"]);
const MES_KEYS = new Set<string>(MESES_ANO_2026 as readonly string[]);

/** Valida que `mes`/`subcanal`/`tier` estão no domínio antes de gravar. */
export function isCelulaValida(input: {
  mes: string;
  subcanal: string;
  tier: string;
}): input is { mes: string; subcanal: SubCanalKey; tier: Tier } {
  return MES_KEYS.has(input.mes) && SUBCANAL_KEYS.has(input.subcanal) && TIER_KEYS.has(input.tier);
}

function rowToCelula(row: typeof realizadoFunil.$inferSelect): RealizadoFunilCelula {
  return {
    mes: row.mes,
    subcanal: row.subcanal as SubCanalKey,
    tier: row.tier as Tier,
    leads: row.leads,
    mql: row.mql,
    sql: row.sql,
    sal: row.sal,
    won: row.won,
    faturamento: row.faturamento,
  };
}

/** Lê todas as células do realizado bowtie de uma org. */
export async function getRealizadoFunil(
  organizationId: string,
): Promise<RealizadoFunilCelula[]> {
  const rows = await db
    .select()
    .from(realizadoFunil)
    .where(eq(realizadoFunil.organizationId, organizationId));
  return rows.map(rowToCelula);
}

/**
 * Lê o realizado bowtie de várias orgs em uma única query — usado pela visão
 * consolidada da Matriz. Retorna `Map<organizationId, celulas[]>` com chave para
 * **todas** as orgs solicitadas (orgs sem células ficam com array vazio).
 */
export async function getRealizadoFunilByOrgIds(
  organizationIds: string[],
): Promise<Map<string, RealizadoFunilCelula[]>> {
  const acc = new Map<string, RealizadoFunilCelula[]>();
  for (const id of organizationIds) acc.set(id, []);
  if (organizationIds.length === 0) return acc;
  const rows = await db
    .select()
    .from(realizadoFunil)
    .where(inArray(realizadoFunil.organizationId, organizationIds));
  for (const row of rows) {
    const arr = acc.get(row.organizationId);
    if (!arr) continue;
    arr.push(rowToCelula(row));
  }
  return acc;
}

/**
 * Upsert de uma célula. Se todos os valores forem 0, deleta a linha (mantém a
 * tabela enxuta — célula "vazia" é a ausência de linha).
 */
export async function upsertRealizadoFunilCelula(
  organizationId: string,
  celula: RealizadoFunilCelula,
): Promise<void> {
  const zerada =
    celula.leads === 0 &&
    celula.mql === 0 &&
    celula.sql === 0 &&
    celula.sal === 0 &&
    celula.won === 0 &&
    celula.faturamento === 0;

  if (zerada) {
    await db
      .delete(realizadoFunil)
      .where(
        and(
          eq(realizadoFunil.organizationId, organizationId),
          eq(realizadoFunil.mes, celula.mes),
          eq(realizadoFunil.subcanal, celula.subcanal),
          eq(realizadoFunil.tier, celula.tier),
        ),
      );
    return;
  }

  await db
    .insert(realizadoFunil)
    .values({
      organizationId,
      mes: celula.mes,
      subcanal: celula.subcanal,
      tier: celula.tier,
      leads: celula.leads,
      mql: celula.mql,
      sql: celula.sql,
      sal: celula.sal,
      won: celula.won,
      faturamento: celula.faturamento,
    })
    .onConflictDoUpdate({
      target: [
        realizadoFunil.organizationId,
        realizadoFunil.mes,
        realizadoFunil.subcanal,
        realizadoFunil.tier,
      ],
      set: {
        leads: celula.leads,
        mql: celula.mql,
        sql: celula.sql,
        sal: celula.sal,
        won: celula.won,
        faturamento: celula.faturamento,
        updatedAt: new Date(),
      },
    });
}
