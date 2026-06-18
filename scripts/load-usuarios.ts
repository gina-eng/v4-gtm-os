/**
 * Carrega usuários de um CSV e os vincula à unidade pelo id_tenant — num passo só.
 * Robusto onde o importador do Supabase falha: ignora colunas vazias de UUID
 * (id/active_organization_id), trata NULL, e conserta mojibake nos nomes.
 *
 * CSV: precisa ter cabeçalho com (no mínimo) `email`, `name`, `id_tenant`. Colunas
 * extras (id, active_organization_id, status, timestamps, tokens…) são IGNORADAS.
 * Sem senha — o usuário cria no primeiro acesso. Upsert por email (não duplica).
 *
 * Rodar:
 *   npm run load:usuarios -- /caminho/users.csv
 *   npm run load:usuarios -- /caminho/users.csv --role=gerente
 */
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { vincularUsuariosPorTenant, type RoleVinculo } from "../src/lib/usuarios/vincular-tenant";

// ── CSV RFC-4180 mínimo (aspas com vírgula/quebra escapadas) ──
function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM
  const rows: string[][] = [];
  let field = "", row: string[] = [], q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* ignora */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// Mojibake = UTF-8 lido como Latin-1 (ex.: "JoÃ£o" no lugar de "João"). Assinatura:
// byte-líder 0xC2/0xC3 seguido de continuação 0x80–0xBF. Detecção por charCode pra
// não depender de caracteres literais no fonte. Re-decodifica latin1→utf8.
function temMojibake(s: string): boolean {
  for (let i = 0; i < s.length - 1; i++) {
    const a = s.charCodeAt(i), b = s.charCodeAt(i + 1);
    if ((a === 0xc2 || a === 0xc3) && b >= 0x80 && b <= 0xbf) return true;
  }
  return false;
}
function fixMojibake(s: string): string {
  if (!temMojibake(s)) return s;
  try { return Buffer.from(s, "latin1").toString("utf8"); } catch { return s; }
}

const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith("--"));
const ROLES: RoleVinculo[] = ["admin", "gerente", "coordenador"];
const roleArg = args.find((a) => a.startsWith("--role="))?.split("=")[1] as RoleVinculo | undefined;
const role: RoleVinculo = roleArg && ROLES.includes(roleArg) ? roleArg : "coordenador";

async function main() {
  if (!csvPath) {
    console.error("Uso: npm run load:usuarios -- /caminho/users.csv [--role=gerente]");
    process.exit(1);
  }
  const grid = parseCsv(readFileSync(csvPath, "utf8"));
  if (grid.length < 2) { console.error("CSV vazio ou só cabeçalho."); process.exit(1); }

  const header = grid[0].map((h) => h.trim().toLowerCase());
  const iEmail = header.indexOf("email");
  const iName = header.indexOf("name");
  const iTenant = header.indexOf("id_tenant");
  if (iEmail < 0 || iName < 0 || iTenant < 0) {
    console.error(`Cabeçalho precisa ter email, name e id_tenant. Achei: ${header.join(", ")}`);
    process.exit(1);
  }

  // existentes por email (lower) → não duplicar (email é unique case-insensitive)
  const existentes = await db.select({ id: users.id, email: users.email }).from(users);
  const byEmail = new Map(existentes.map((u) => [u.email.trim().toLowerCase(), u.id]));

  let inseridos = 0, atualizados = 0, semEmail = 0;
  for (let r = 1; r < grid.length; r++) {
    const email = (grid[r][iEmail] ?? "").trim().toLowerCase();
    const name = fixMojibake((grid[r][iName] ?? "").trim());
    const idTenant = (grid[r][iTenant] ?? "").trim() || null;
    if (!email) { semEmail++; continue; }

    const existingId = byEmail.get(email);
    if (existingId) {
      await db.update(users).set({ name, idTenant, updatedAt: new Date() }).where(sql`${users.id} = ${existingId}`);
      atualizados++;
    } else {
      await db.insert(users).values({ email, name, status: "active", idTenant });
      inseridos++;
    }
  }

  console.log("── carga de usuários ──");
  console.log(`linhas no CSV:        ${grid.length - 1}`);
  console.log(`inseridos:            ${inseridos}`);
  console.log(`atualizados (email já existia): ${atualizados}`);
  if (semEmail) console.log(`ignorados (sem email): ${semEmail}`);

  // vínculo por id_tenant (num passo só)
  const v = await vincularUsuariosPorTenant(role);
  console.log("\n── vínculo por id_tenant ──");
  console.log(`role p/ novos memberships:      ${role}`);
  console.log(`vinculados (active_org setado): ${v.vinculados}`);
  console.log(`novos memberships criados:      ${v.novosMemberships}`);
  console.log(`id_tenant SEM unidade:          ${v.naoCasaram.length}`);
  v.naoCasaram.slice(0, 50).forEach((x) => console.log(`   • ${x.email} → "${x.idTenant}"`));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
