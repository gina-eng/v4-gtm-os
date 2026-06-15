/**
 * Repository do realizado do funil — tabela `realizado_funil` (grão DIÁRIO:
 * organizationId × dia × subcanal × tier × categoria).
 *
 * A tabela é derivada da landing `realizado_import_lead` por
 * `scripts/derive-realizado-funil.ts` (de-para + bucket por data). O input manual
 * antigo (tela /bowtie) virou read-only — a fonte é o import.
 *
 * O `/bowtie` consome **mensal**: as leituras aqui **agregam dia→mês** (somando
 * sobre `dia` e `categoria`), devolvendo uma célula por `mes × subcanal × tier`,
 * que casa 1-pra-1 com a projeção de `calcularPorSubCanalPorTier`.
 */

import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { realizadoFunil } from "@/db/schema";
import type { SubCanalKey } from "@/lib/premissas/funil-reverso";
import type { Tier } from "@/lib/premissas/matriz-defaults";

/**
 * Célula MENSAL agregada (consumo do /bowtie). Mantém a forma histórica — sem
 * `dia`/`categoria` — pra projetado e realizado agregarem pelo mesmo eixo.
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

/** Célula DIÁRIA crua (escrita pela derivação). */
export type RealizadoFunilDia = {
  dia: string; // YYYY-MM-DD
  subcanal: SubCanalKey;
  tier: Tier;
  categoria: string; // '' no funil; Saber/Ter/Executar no won
  leads: number;
  mql: number;
  sql: number;
  sal: number;
  won: number;
  faturamento: number;
};

// Colunas agregadas (soma) reusadas nas leituras mensais.
const aggCols = {
  leads: sql<number>`coalesce(sum(${realizadoFunil.leads}), 0)::float8`,
  mql: sql<number>`coalesce(sum(${realizadoFunil.mql}), 0)::float8`,
  sql: sql<number>`coalesce(sum(${realizadoFunil.sql}), 0)::float8`,
  sal: sql<number>`coalesce(sum(${realizadoFunil.sal}), 0)::float8`,
  won: sql<number>`coalesce(sum(${realizadoFunil.won}), 0)::float8`,
  faturamento: sql<number>`coalesce(sum(${realizadoFunil.faturamento}), 0)::float8`,
} as const;

function toCelula(r: {
  mes: string;
  subcanal: string;
  tier: string;
  leads: number;
  mql: number;
  sql: number;
  sal: number;
  won: number;
  faturamento: number;
}): RealizadoFunilCelula {
  return {
    mes: r.mes,
    subcanal: r.subcanal as SubCanalKey,
    tier: r.tier as Tier,
    leads: r.leads,
    mql: r.mql,
    sql: r.sql,
    sal: r.sal,
    won: r.won,
    faturamento: r.faturamento,
  };
}

/** Realizado de uma org, agregado por mês × subcanal × tier. */
export async function getRealizadoFunil(
  organizationId: string,
): Promise<RealizadoFunilCelula[]> {
  const rows = await db
    .select({
      mes: realizadoFunil.mes,
      subcanal: realizadoFunil.subcanal,
      tier: realizadoFunil.tier,
      ...aggCols,
    })
    .from(realizadoFunil)
    .where(eq(realizadoFunil.organizationId, organizationId))
    .groupBy(realizadoFunil.mes, realizadoFunil.subcanal, realizadoFunil.tier);
  return rows.map(toCelula);
}

/**
 * Realizado de várias orgs (visão consolidada da Matriz), agregado por mês ×
 * subcanal × tier. Retorna `Map<organizationId, celulas[]>` com chave para
 * **todas** as orgs solicitadas (orgs sem células ficam com array vazio).
 */
export async function getRealizadoFunilByOrgIds(
  organizationIds: string[],
): Promise<Map<string, RealizadoFunilCelula[]>> {
  const acc = new Map<string, RealizadoFunilCelula[]>();
  for (const id of organizationIds) acc.set(id, []);
  if (organizationIds.length === 0) return acc;
  const rows = await db
    .select({
      organizationId: realizadoFunil.organizationId,
      mes: realizadoFunil.mes,
      subcanal: realizadoFunil.subcanal,
      tier: realizadoFunil.tier,
      ...aggCols,
    })
    .from(realizadoFunil)
    .where(inArray(realizadoFunil.organizationId, organizationIds))
    .groupBy(
      realizadoFunil.organizationId,
      realizadoFunil.mes,
      realizadoFunil.subcanal,
      realizadoFunil.tier,
    );
  for (const row of rows) {
    acc.get(row.organizationId)?.push(toCelula(row));
  }
  return acc;
}

/**
 * Substitui TODO o realizado diário de uma org (delete + insert em lote). Usado
 * pela derivação — idempotente. Pula células totalmente zeradas.
 */
export async function replaceRealizadoFunilDaily(
  organizationId: string,
  celulas: RealizadoFunilDia[],
): Promise<void> {
  const naoZeradas = celulas.filter(
    (c) =>
      c.leads !== 0 ||
      c.mql !== 0 ||
      c.sql !== 0 ||
      c.sal !== 0 ||
      c.won !== 0 ||
      c.faturamento !== 0,
  );

  await db.transaction(async (tx) => {
    await tx.delete(realizadoFunil).where(eq(realizadoFunil.organizationId, organizationId));
    const CHUNK = 500;
    for (let i = 0; i < naoZeradas.length; i += CHUNK) {
      await tx.insert(realizadoFunil).values(
        naoZeradas.slice(i, i + CHUNK).map((c) => ({
          organizationId,
          dia: c.dia,
          mes: c.dia.slice(0, 7), // derivado de dia (YYYY-MM)
          subcanal: c.subcanal,
          tier: c.tier,
          categoria: c.categoria,
          leads: c.leads,
          mql: c.mql,
          sql: c.sql,
          sal: c.sal,
          won: c.won,
          faturamento: c.faturamento,
        })),
      );
    }
  });
}
