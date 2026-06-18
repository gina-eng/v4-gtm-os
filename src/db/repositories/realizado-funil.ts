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

import { eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { realizadoFunil, realizadoNaoClassificado } from "@/db/schema";
import type { SubCanalKey } from "@/lib/premissas/funil-reverso";
import type { RealizadoMensal, Tier } from "@/lib/premissas/matriz-defaults";

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
  invest: number;
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
  invest: number;
};

// Colunas agregadas (soma) reusadas nas leituras mensais.
const aggCols = {
  leads: sql<number>`coalesce(sum(${realizadoFunil.leads}), 0)::float8`,
  mql: sql<number>`coalesce(sum(${realizadoFunil.mql}), 0)::float8`,
  sql: sql<number>`coalesce(sum(${realizadoFunil.sql}), 0)::float8`,
  sal: sql<number>`coalesce(sum(${realizadoFunil.sal}), 0)::float8`,
  won: sql<number>`coalesce(sum(${realizadoFunil.won}), 0)::float8`,
  faturamento: sql<number>`coalesce(sum(${realizadoFunil.faturamento}), 0)::float8`,
  invest: sql<number>`coalesce(sum(${realizadoFunil.invest}), 0)::float8`,
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
  invest: number;
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
    invest: r.invest,
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
      c.faturamento !== 0 ||
      c.invest !== 0,
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
          invest: c.invest,
        })),
      );
    }
  });
}

/**
 * Remove o realizado de unidades que NÃO estão no conjunto derivado agora — ou
 * seja, unidades que sumiram do extrato (ex.: dados de teste antigos). Mantém a
 * `realizado_funil` espelhando exatamente a landing.
 *
 * ⚠️ Guarda crítica: se `orgIds` vier VAZIO, NÃO apaga nada. Isso evita zerar a
 * tabela inteira numa derivação sem dados (landing vazia / falha de carga).
 * Retorna quantas unidades órfãs foram limpas.
 */
export async function pruneRealizadoFunilExcept(orgIds: string[]): Promise<number> {
  if (orgIds.length === 0) return 0;
  const deleted = await db
    .delete(realizadoFunil)
    .where(notInArray(realizadoFunil.organizationId, orgIds))
    .returning({ orgId: realizadoFunil.organizationId });
  return new Set(deleted.map((d) => d.orgId)).size;
}

export type MotivoNaoClassificado =
  | "tenant_nao_cadastrado"
  | "canal_nao_mapeado"
  | "tier_lead_invalido"
  | "venda_sem_tier";

/** Célula do balde não-classificado (grão: idTenant × mês × motivo × rótulo cru). */
export type NaoClassificadoCelula = {
  organizationId: string | null;
  idTenant: string | null;
  mes: string;
  motivo: MotivoNaoClassificado;
  rotuloCru: string;
  leads: number;
  mql: number;
  sql: number;
  sal: number;
  won: number;
  faturamento: number;
};

/**
 * Substitui TODO o balde `realizado_nao_classificado` (delete + insert). Chamado
 * pela derivação. Pula células zeradas. Idempotente.
 *
 * É replace GLOBAL (não por org) porque o balde tem linhas sem unidade (tenant não
 * cadastrado). A guarda contra zerar tudo numa landing vazia fica no derive: só é
 * chamado quando houve linhas pra processar.
 */
export async function replaceRealizadoNaoClassificado(
  celulas: NaoClassificadoCelula[],
): Promise<number> {
  const naoZeradas = celulas.filter(
    (c) => c.leads || c.mql || c.sql || c.sal || c.won || c.faturamento,
  );
  await db.transaction(async (tx) => {
    await tx.delete(realizadoNaoClassificado);
    const CHUNK = 500;
    for (let i = 0; i < naoZeradas.length; i += CHUNK) {
      await tx.insert(realizadoNaoClassificado).values(
        naoZeradas.slice(i, i + CHUNK).map((c) => ({
          organizationId: c.organizationId,
          idTenant: c.idTenant,
          mes: c.mes,
          motivo: c.motivo,
          rotuloCru: c.rotuloCru,
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
  return naoZeradas.length;
}

/** Balde agregado por mês (sem tier/subcanal — o balde não tem). NÃO traz `mql`
 *  (convenção do bowtie: mql=leads) nem `invest` (balde não tem). */
export type BaldeMes = {
  mes: string;
  leads: number;
  sql: number;
  sal: number;
  won: number;
  faturamento: number;
};

/**
 * Lê o balde (realizado_nao_classificado) agregado por mês, pra somar no TOTAL do
 * bowtie por escopo. `orgIds` = unidades/matriz do escopo; `incluiNulos` soma também
 * as linhas sem unidade (tenant não cadastrado) — só no escopo "Resultado geral".
 * Sem orgIds e sem nulos → [] (não lê nada).
 */
export async function getNaoClassificadoPorMes(
  orgIds: string[],
  incluiNulos: boolean,
): Promise<BaldeMes[]> {
  const conds = [];
  if (orgIds.length > 0) conds.push(inArray(realizadoNaoClassificado.organizationId, orgIds));
  if (incluiNulos) conds.push(isNull(realizadoNaoClassificado.organizationId));
  if (conds.length === 0) return [];

  const rows = await db
    .select({
      mes: realizadoNaoClassificado.mes,
      leads: sql<number>`coalesce(sum(${realizadoNaoClassificado.leads}), 0)::float8`,
      sqlStage: sql<number>`coalesce(sum(${realizadoNaoClassificado.sql}), 0)::float8`,
      sal: sql<number>`coalesce(sum(${realizadoNaoClassificado.sal}), 0)::float8`,
      won: sql<number>`coalesce(sum(${realizadoNaoClassificado.won}), 0)::float8`,
      faturamento: sql<number>`coalesce(sum(${realizadoNaoClassificado.faturamento}), 0)::float8`,
    })
    .from(realizadoNaoClassificado)
    .where(or(...conds))
    .groupBy(realizadoNaoClassificado.mes);

  return rows.map((r) => ({
    mes: r.mes,
    leads: r.leads,
    sql: r.sqlStage,
    sal: r.sal,
    won: r.won,
    faturamento: r.faturamento,
  }));
}

/** Balde por ORG × mês (Map). Exclui linhas sem unidade (org null) — essas só
 *  entram no "Resultado geral", não no realizado de uma unidade específica. */
export async function getNaoClassificadoMesByOrgIds(
  orgIds: string[],
): Promise<Map<string, BaldeMes[]>> {
  const out = new Map<string, BaldeMes[]>();
  if (orgIds.length === 0) return out;
  const rows = await db
    .select({
      org: realizadoNaoClassificado.organizationId,
      mes: realizadoNaoClassificado.mes,
      leads: sql<number>`coalesce(sum(${realizadoNaoClassificado.leads}), 0)::float8`,
      sqlStage: sql<number>`coalesce(sum(${realizadoNaoClassificado.sql}), 0)::float8`,
      sal: sql<number>`coalesce(sum(${realizadoNaoClassificado.sal}), 0)::float8`,
      won: sql<number>`coalesce(sum(${realizadoNaoClassificado.won}), 0)::float8`,
      faturamento: sql<number>`coalesce(sum(${realizadoNaoClassificado.faturamento}), 0)::float8`,
    })
    .from(realizadoNaoClassificado)
    .where(inArray(realizadoNaoClassificado.organizationId, orgIds))
    .groupBy(realizadoNaoClassificado.organizationId, realizadoNaoClassificado.mes);
  for (const r of rows) {
    if (!r.org) continue;
    const arr = out.get(r.org) ?? [];
    arr.push({ mes: r.mes, leads: r.leads, sql: r.sqlStage, sal: r.sal, won: r.won, faturamento: r.faturamento });
    out.set(r.org, arr);
  }
  return out;
}

// ============================================================
// Adaptador: realizado_funil (+ balde) → RealizadoMensal[] (o que o forecast espera)
//
// Colapsa o grão subcanal×tier somando por MÊS, no shape RealizadoMensal:
//  - faturamento: Σ won classificado + Σ balde (âncora "cheia" — decisão Gina).
//  - won: idem (classificado + balde) — usado só pra display; o motor recalcula.
//  - leadsIb: SÓ lead_broker + black_box (meeting_broker/eventos contam SQL, não
//    lead de topo, então ficam de fora pra não inflar o override de meses fechados).
//  - leadsOb: os 4 out_*.
//  - investido: 0 — o invest do funil é da REDE e inflado (schema), e o realizado
//    por unidade ainda não existe; mapear 0 faz o motor cair no investido planejado.
// ============================================================

const SUBCANAIS_LEADS_IB: ReadonlySet<SubCanalKey> = new Set<SubCanalKey>(["lead_broker", "black_box"]);
const SUBCANAIS_LEADS_OB: ReadonlySet<SubCanalKey> = new Set<SubCanalKey>([
  "out_indicacao",
  "out_recovery",
  "out_recomendacao",
  "out_prospeccao",
]);

export function celulasParaRealizadoMensal(
  celulas: RealizadoFunilCelula[],
  balde: BaldeMes[] = [],
): RealizadoMensal[] {
  const byMes = new Map<string, RealizadoMensal>();
  const get = (mes: string): RealizadoMensal => {
    let m = byMes.get(mes);
    if (!m) {
      m = { mes, faturamento: 0, investido: 0, leadsIb: 0, leadsOb: 0, won: 0 };
      byMes.set(mes, m);
    }
    return m;
  };
  for (const c of celulas) {
    const m = get(c.mes);
    m.faturamento += c.faturamento;
    m.won += c.won;
    if (SUBCANAIS_LEADS_IB.has(c.subcanal)) m.leadsIb += c.leads;
    else if (SUBCANAIS_LEADS_OB.has(c.subcanal)) m.leadsOb += c.leads;
    // meeting_broker/eventos: leads = SQL-first, fora de leadsIb/Ob. investido: 0.
  }
  for (const b of balde) {
    const m = get(b.mes);
    m.faturamento += b.faturamento; // âncora cheia (classificado + não-classificado)
    m.won += b.won;
    // balde sem subcanal → não entra em leadsIb/Ob; investido 0
  }
  return Array.from(byMes.values()).sort((a, b) => a.mes.localeCompare(b.mes));
}

/** Realizado mensal de UMA org, derivado do realizado_funil (+ balde). */
export async function getRealizadoMensalFunil(orgId: string): Promise<RealizadoMensal[]> {
  const [celulas, balde] = await Promise.all([
    getRealizadoFunil(orgId),
    getNaoClassificadoPorMes([orgId], false),
  ]);
  return celulasParaRealizadoMensal(celulas, balde);
}

/** Batch: realizado mensal por org (Map), derivado do realizado_funil (+ balde). */
export async function getRealizadoMensalFunilByOrgIds(
  ids: string[],
): Promise<Map<string, RealizadoMensal[]>> {
  const out = new Map<string, RealizadoMensal[]>();
  if (ids.length === 0) return out;
  const [gridByOrg, baldeByOrg] = await Promise.all([
    getRealizadoFunilByOrgIds(ids),
    getNaoClassificadoMesByOrgIds(ids),
  ]);
  for (const id of ids) {
    out.set(id, celulasParaRealizadoMensal(gridByOrg.get(id) ?? [], baldeByOrg.get(id) ?? []));
  }
  return out;
}
