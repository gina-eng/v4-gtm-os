/**
 * One-off read-only: lista todas as organizações com o horizonte gravado no
 * banco (organizations.horizonte_atual) pra conferência manual ("pente fino").
 * Não escreve nada. Rodar: tsx --env-file=.env.local scripts/audit-horizontes.ts
 */
import { asc } from "drizzle-orm";
import { db } from "../src/db";
import { organizations } from "../src/db/schema";

async function main() {
  const orgs = await db
    .select({
      name: organizations.name,
      type: organizations.type,
      regional: organizations.regional,
      horizonte: organizations.horizonteAtual,
      status: organizations.status,
      dataInicio: organizations.dataInicio,
    })
    .from(organizations)
    .orderBy(asc(organizations.regional), asc(organizations.name));

  console.log(`\n${orgs.length} organizações:\n`);
  console.log(
    ["HORIZONTE", "TIPO", "REGIONAL", "STATUS", "INÍCIO", "NOME"].join("\t"),
  );
  for (const o of orgs) {
    console.log(
      [
        o.horizonte,
        o.type,
        o.regional ?? "-",
        o.status,
        o.dataInicio ?? "-",
        o.name,
      ].join("\t"),
    );
  }
  console.log("");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
