/**
 * Leitura da fonte autoritativa de WON — tabela `realizado_won` (grão id_tenant ×
 * dt_venda × won), entregue pelo time de dados. É a contagem OFICIAL de vendas.
 *
 * Diferente do `realizado_funil` (derivado do import e quebrado por tier×subcanal),
 * a `realizado_won` é lida AO VIVO aqui — não passa pela derivação nem é cacheada
 * em tabela. O bowtie usa este total como o número de WON exibido, mantendo o grid
 * do funil só como a FORMA (distribuição por tier×subcanal). A `realizado_won` NÃO
 * está no schema Drizzle de propósito (é gerida externamente); por isso a query é
 * crua via `db.execute`.
 *
 * O vínculo com a unidade é por `id_tenant` → `unidades.id_tenant`, com a mesma
 * tolerância a espaço/quebra de linha usada na derivação. Só eventos de 2026 —
 * mesmo escopo do grid.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";

const tkey = (s: string | null | undefined) => (s ?? "").trim();

/**
 * Soma o WON oficial (`realizado_won`, 2026) por mês, no recorte de orgs do escopo.
 * Segue a MESMA inclusão do balde: orgs casadas por `id_tenant` + (quando
 * `incluiNulos`) os tenants do banco SEM unidade cadastrada — esses só entram no
 * "Resultado geral". Retorna `Map<mes('YYYY-MM'), won>`.
 */
export async function getWonBancoPorMes(
  orgIds: string[],
  incluiNulos: boolean,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (orgIds.length === 0 && !incluiNulos) return out;

  // id_tenant das unidades: todos (p/ detectar "não cadastrado") + os do escopo.
  const orgRows = await db
    .select({ id: organizations.id, idTenant: organizations.idTenant })
    .from(organizations);
  const orgIdSet = new Set(orgIds);
  const todosTenants = new Set<string>();
  const tenantsDoEscopo = new Set<string>();
  for (const o of orgRows) {
    const t = tkey(o.idTenant);
    if (!t) continue;
    todosTenants.add(t);
    if (orgIdSet.has(o.id)) tenantsDoEscopo.add(t);
  }

  const rows = await db.execute<{ id_tenant: string | null; mes: string; won: number | null }>(
    sql`SELECT id_tenant, to_char(dt_venda, 'YYYY-MM') AS mes, sum(won)::int AS won
        FROM realizado_won
        WHERE dt_venda >= '2026-01-01' AND dt_venda < '2027-01-01'
        GROUP BY id_tenant, to_char(dt_venda, 'YYYY-MM')`,
  );

  for (const r of rows) {
    const won = Number(r.won ?? 0);
    if (won === 0) continue;
    const t = tkey(r.id_tenant);
    const casado = tenantsDoEscopo.has(t);
    const naoCadastrado = incluiNulos && !todosTenants.has(t);
    if (!casado && !naoCadastrado) continue;
    out.set(r.mes, (out.get(r.mes) ?? 0) + won);
  }
  return out;
}
