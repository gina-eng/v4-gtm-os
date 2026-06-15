/**
 * One-off: carrega o extrato CRU de realizado (grão lead/cohort, do BI/Metabase)
 * na tabela de landing `realizado_import_lead`. Espelha o template 1-pra-1,
 * preservando os rótulos do BI (canal/tier sem de-para) e as 4 datas de evento.
 *
 * - Idempotente por `loadBatch`: apaga as linhas do mesmo batch e reinsere.
 * - Resolve `organization_id` via id_tenant → organizations.id_tenant (NULL se
 *   não casar com nenhuma unidade).
 * - NÃO transforma: a derivação pra realizado_funil/diário (de-para + bucket por
 *   data) é um passo seguinte.
 *
 * Rodar:
 *   npm run load:realizado
 *   # ou com caminho/batch custom:
 *   tsx --env-file=.env.local scripts/load-realizado-import.ts <csv> <batch>
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../src/db";
import { organizations, realizadoImportLead } from "../src/db/schema";
import type { NewRealizadoImportLeadRow } from "../src/db/schema";

const DEFAULT_CSV =
  "/Users/rafaelcorazza/Downloads/download60fae129-4a1d-4bd5-8749-aa462842133b-v3.csv";
const DEFAULT_BATCH = "extrato-v3";
const CHUNK = 500;

// ── CSV parsing (RFC-4180 mínimo: aspas duplas com vírgula/quebra escapadas) ──
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  // remove BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // ignora; o \n cuida da quebra
    } else field += c;
  }
  // último campo/linha (arquivo sem \n final)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function toDate(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return DATE_RE.test(s) ? s : null;
}
function toInt(v: string | undefined): number {
  const n = Number.parseFloat((v ?? "").trim());
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}
function toNum(v: string | undefined): number {
  const n = Number.parseFloat((v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}
function toStr(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}

async function main() {
  const csvPath = process.argv[2] || DEFAULT_CSV;
  const batch = process.argv[3] || DEFAULT_BATCH;

  const raw = readFileSync(csvPath, "utf-8");
  const matrix = parseCsv(raw).filter((r) => r.some((c) => c.trim() !== ""));
  const header = matrix[0].map((h) => h.trim());
  const idx = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Coluna ausente no CSV: ${name}`);
    return i;
  };
  const col = {
    tierLead: idx("tier_lead"),
    tierVenda: idx("tier_venda"),
    canalAquisicao: idx("canal_aquisicao"),
    canalOrigem: idx("canal_origem"),
    idTenant: idx("id_tenant"),
    franqueado: idx("franqueado"),
    categoriaProduto: idx("categoria_produto"),
    dtCadastroLead: idx("dt_cadastro_lead"),
    dtRm: idx("dt_rm"),
    dtRr: idx("dt_rr"),
    dtVenda: idx("dt_venda"),
    mediaInvestment: idx("media_investment"),
    leads: idx("leads"),
    mql: idx("mql"),
    rm: idx("rm"),
    rr: idx("rr"),
    won: idx("won"),
    revenueWon: idx("revenue_won"),
  };

  const body = matrix.slice(1);
  console.log(`CSV: ${basename(csvPath)} — ${body.length} linhas de dados`);

  // de-para id_tenant → organizations.id
  const tenants = Array.from(
    new Set(body.map((r) => (r[col.idTenant] ?? "").trim()).filter(Boolean)),
  );
  const orgRows = tenants.length
    ? await db
        .select({ id: organizations.id, idTenant: organizations.idTenant })
        .from(organizations)
        .where(inArray(organizations.idTenant, tenants))
    : [];
  const orgByTenant = new Map(orgRows.map((o) => [o.idTenant ?? "", o.id]));
  console.log(
    `tenants no extrato: ${tenants.length} | resolvidos p/ unidade: ${orgByTenant.size}`,
  );
  for (const t of tenants) {
    console.log(`  ${orgByTenant.has(t) ? "✓" : "✗ (organization_id = NULL)"}  ${t}`);
  }

  const values: NewRealizadoImportLeadRow[] = body.map((r) => ({
    organizationId: orgByTenant.get((r[col.idTenant] ?? "").trim()) ?? null,
    idTenant: toStr(r[col.idTenant]),
    franqueado: toStr(r[col.franqueado]),
    tierLead: toStr(r[col.tierLead]),
    tierVenda: toStr(r[col.tierVenda]),
    canalAquisicao: toStr(r[col.canalAquisicao]),
    canalOrigem: toStr(r[col.canalOrigem]),
    categoriaProduto: toStr(r[col.categoriaProduto]),
    dtCadastroLead: toDate(r[col.dtCadastroLead]),
    dtRm: toDate(r[col.dtRm]),
    dtRr: toDate(r[col.dtRr]),
    dtVenda: toDate(r[col.dtVenda]),
    leads: toInt(r[col.leads]),
    mql: toInt(r[col.mql]),
    rm: toInt(r[col.rm]),
    rr: toInt(r[col.rr]),
    won: toInt(r[col.won]),
    revenueWon: toNum(r[col.revenueWon]),
    mediaInvestment: toNum(r[col.mediaInvestment]),
    loadBatch: batch,
  }));

  // recarga idempotente do batch
  await db.delete(realizadoImportLead).where(eq(realizadoImportLead.loadBatch, batch));
  for (let i = 0; i < values.length; i += CHUNK) {
    await db.insert(realizadoImportLead).values(values.slice(i, i + CHUNK));
  }

  // conferência
  const [agg] = await db
    .select({
      n: sql<number>`count(*)::int`,
      leads: sql<number>`coalesce(sum(${realizadoImportLead.leads}),0)::int`,
      won: sql<number>`coalesce(sum(${realizadoImportLead.won}),0)::int`,
      revenue: sql<number>`coalesce(sum(${realizadoImportLead.revenueWon}),0)::float8`,
      semOrg: sql<number>`count(*) filter (where ${realizadoImportLead.organizationId} is null)::int`,
    })
    .from(realizadoImportLead)
    .where(eq(realizadoImportLead.loadBatch, batch));

  console.log("\n── carregado ──");
  console.log(`batch:            ${batch}`);
  console.log(`linhas inseridas: ${agg.n}`);
  console.log(`organization_id NULL: ${agg.semOrg}`);
  console.log(`Σ leads:    ${agg.leads}`);
  console.log(`Σ won:      ${agg.won}`);
  console.log(`Σ revenue:  ${agg.revenue.toLocaleString("pt-BR")}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
