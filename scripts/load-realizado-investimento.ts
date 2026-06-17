/**
 * One-off: carrega o extrato de INVESTIDO de mídia (entrega "wide" do time de dados,
 * grão data × id_tenant) na landing `realizado_import_investimento`. É a fonte do
 * `realizado_funil.invest` — sem este load a landing fica vazia e o invest derivado
 * (e portanto CPMQL/CPSQL/CPSAL/CAC do /bowtie) sai 0.
 *
 * Formato esperado do CSV (uma coluna de investido em R$ por subcanal, por dia):
 *   id_tenant , data (YYYY-MM-DD) , lb , mb , bb , db
 *     lb → Lead Broker | mb → Meeting Broker | bb → Black Box
 *     db → guardado cru, ainda SEM subcanal (não entra no funil — ver de-para.ts)
 *   Eventos (EV) não vem nesta entrega.
 * Os nomes de coluna acima seguem os códigos documentados em src/db/schema.ts
 * (realizado_import_investimento). Se a planilha do time de dados usar outros
 * rótulos, ajuste o mapa `col` abaixo — `idx()` falha alto se um nome não existir.
 *
 * Idempotência: SUBSTITUIÇÃO TOTAL da landing (delete-all + insert). A tabela é de
 * uso exclusivo deste loader e a entrega é o extrato completo do investido — recarregar
 * o mesmo arquivo reproduz a tabela. (Se um dia a carga virar incremental por mês,
 * adicionar uma coluna `load_batch` como em `realizado_import_lead` e filtrar por ela.)
 *
 * Rodar:
 *   npm run load:investimento
 *   # ou com caminho custom:
 *   tsx --env-file=.env.local scripts/load-realizado-investimento.ts <csv>
 *
 * Depois, re-derivar o funil para preencher o invest:
 *   npm run derive:realizado
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { inArray, sql } from "drizzle-orm";
import { db } from "../src/db";
import { organizations, realizadoImportInvestimento } from "../src/db/schema";
import type { NewRealizadoImportInvestimentoRow } from "../src/db/schema";

const DEFAULT_CSV =
  "/Users/rafaelcorazza/Downloads/realizado-investimento.csv";
const CHUNK = 500;

// ── CSV parsing (RFC-4180 mínimo: aspas duplas com vírgula/quebra escapadas) ──
// Mesmo parser do load-realizado-import.ts.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // remove BOM
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

  const raw = readFileSync(csvPath, "utf-8");
  const matrix = parseCsv(raw).filter((r) => r.some((c) => c.trim() !== ""));
  if (matrix.length === 0) throw new Error(`CSV vazio: ${csvPath}`);
  const header = matrix[0].map((h) => h.trim());
  const idx = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Coluna ausente no CSV: ${name}`);
    return i;
  };
  const col = {
    idTenant: idx("id_tenant"),
    data: idx("data"),
    lb: idx("lb"),
    mb: idx("mb"),
    bb: idx("bb"),
    db: idx("db"),
  };

  const body = matrix.slice(1);
  if (body.length === 0) throw new Error("CSV sem linhas de dados — abortando para não esvaziar a landing.");
  console.log(`CSV: ${basename(csvPath)} — ${body.length} linhas de dados`);

  const values: NewRealizadoImportInvestimentoRow[] = body.map((r) => ({
    idTenant: toStr(r[col.idTenant]),
    data: toDate(r[col.data]),
    lb: toNum(r[col.lb]),
    mb: toNum(r[col.mb]),
    bb: toNum(r[col.bb]),
    db: toNum(r[col.db]),
  }));

  // Diagnóstico de de-para id_tenant → unidade (mesma resolução do derive).
  const tenants = Array.from(
    new Set(values.map((v) => v.idTenant ?? "").filter(Boolean)),
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
    console.log(`  ${orgByTenant.has(t) ? "✓" : "✗ (não casa com nenhuma unidade)"}  ${t}`);
  }

  // Substituição total idempotente: a landing é de uso exclusivo deste loader.
  const [{ n: existentes }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(realizadoImportInvestimento);
  await db.delete(realizadoImportInvestimento);
  for (let i = 0; i < values.length; i += CHUNK) {
    await db.insert(realizadoImportInvestimento).values(values.slice(i, i + CHUNK));
  }

  // Conferência.
  const [agg] = await db
    .select({
      n: sql<number>`count(*)::int`,
      lb: sql<number>`coalesce(sum(${realizadoImportInvestimento.lb}),0)::float8`,
      mb: sql<number>`coalesce(sum(${realizadoImportInvestimento.mb}),0)::float8`,
      bb: sql<number>`coalesce(sum(${realizadoImportInvestimento.bb}),0)::float8`,
      db: sql<number>`coalesce(sum(${realizadoImportInvestimento.db}),0)::float8`,
      semData: sql<number>`count(*) filter (where ${realizadoImportInvestimento.data} is null)::int`,
      semTenant: sql<number>`count(*) filter (where ${realizadoImportInvestimento.idTenant} is null)::int`,
    })
    .from(realizadoImportInvestimento);

  const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  console.log("\n── carregado (substituição total) ──");
  console.log(`linhas substituídas: ${existentes} → inseridas: ${agg.n}`);
  console.log(`linhas sem data:     ${agg.semData}`);
  console.log(`linhas sem id_tenant:${agg.semTenant}`);
  console.log(`Σ lead_broker (lb):  R$ ${brl(agg.lb)}`);
  console.log(`Σ meeting_broker(mb):R$ ${brl(agg.mb)}`);
  console.log(`Σ black_box (bb):    R$ ${brl(agg.bb)}`);
  console.log(`Σ db (parado):       R$ ${brl(agg.db)} (não entra no funil — ver de-para.ts)`);
  console.log("\nPróximo passo: npm run derive:realizado");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
