/**
 * One-off de validação (pente fino do bowtie): roda o MESMO forecast que a página
 * /bowtie usa (calcularPorSubCanalPorTier) e quebra o projetado POR SUBCANAL no mês
 * de referência, pra mostrar de onde vem (ou não vem) o MQL. Confirma a hipótese:
 * MB/Eventos/Outbound têm mql=0, então o mql agregado fica << leads e << sql.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getPremissas, matrizDefaultBlocks } from "@/db/repositories/premissas";
import { getUnitSetup } from "@/db/repositories/unit-setup";
import { getRealizadoFunil } from "@/db/repositories/realizado-funil";
import { REALIZADO_HISTORICO_DEFAULT } from "@/lib/premissas/matriz-defaults";
import { calcularPorSubCanalPorTier } from "@/lib/premissas/funil-reverso";
import { agregarProjetado, agregarRealizado } from "@/lib/realizado/bowtie";
import { getMesReferenciaAtual } from "@/lib/realizado/projecao";

async function main() {
  const mesRef = getMesReferenciaAtual();
  console.log("Mês de referência (default do filtro):", mesRef);

  const orgs = await db.select().from(organizations).where(eq(organizations.type, "unidade"));

  for (const org of orgs) {
    const realizadoCelulas = await getRealizadoFunil(org.id);
    if (realizadoCelulas.length === 0) continue; // só unidades com realizado importado

    const blocks = (await getPremissas(org.id)) ?? matrizDefaultBlocks();
    const setup = await getUnitSetup(org.id);
    const realizadoHistorico = setup.realizadoHistorico ?? REALIZADO_HISTORICO_DEFAULT;
    const linhas = calcularPorSubCanalPorTier(blocks, org.horizonteAtual, {
      realizadoHistorico,
      dataInicio: org.dataInicio ?? undefined,
    });

    console.log(`\n========== ${org.name} | horizonte ${org.horizonteAtual} ==========`);

    console.log("\n-- Projetado: totais por mês (pra achar o mês do print) --");
    const meses = [...new Set(linhas.map((l) => l.mes))].sort();
    for (const mes of meses) {
      const p = agregarProjetado(linhas, { meses: [mes] });
      console.log(
        `${mes}  leads=${p.leads.toFixed(0).padStart(5)}  mql=${p.mql.toFixed(0).padStart(5)}  sql=${p.sql.toFixed(0).padStart(5)}  sal=${p.sal.toFixed(0).padStart(5)}  won=${p.won.toFixed(0).padStart(4)}`,
      );
    }

    console.log(`\n-- Projetado POR SUBCANAL no mês ${mesRef} (de onde vem o mql) --`);
    const subcanais = [...new Set(linhas.map((l) => l.subcanal))];
    for (const sc of subcanais) {
      const p = agregarProjetado(linhas, { meses: [mesRef], subcanais: [sc] });
      if (p.leads < 0.05 && p.sql < 0.05 && p.won < 0.05) continue;
      console.log(
        `${sc.padEnd(16)} leads=${p.leads.toFixed(1).padStart(7)}  mql=${p.mql.toFixed(1).padStart(7)}  sql=${p.sql.toFixed(1).padStart(7)}  won=${p.won.toFixed(1).padStart(6)}`,
      );
    }
    const pTot = agregarProjetado(linhas, { meses: [mesRef] });
    console.log(
      `${"TOTAL".padEnd(16)} leads=${pTot.leads.toFixed(1).padStart(7)}  mql=${pTot.mql.toFixed(1).padStart(7)}  sql=${pTot.sql.toFixed(1).padStart(7)}  won=${pTot.won.toFixed(1).padStart(6)}`,
    );
    console.log(
      `  → Proj Leads→MQL = mql/leads = ${pTot.leads > 0 ? ((pTot.mql / pTot.leads) * 100).toFixed(1) : "—"}%  |  Proj MQL→SQL = sql/mql = ${pTot.mql > 0 ? ((pTot.sql / pTot.mql) * 100).toFixed(0) : "—"}%`,
    );

    const r = agregarRealizado(realizadoCelulas, { meses: [mesRef] });
    console.log(
      `\n-- Realizado no mês ${mesRef}: leads=${r.leads} mql=${r.mql} sql=${r.sql} sal=${r.sal} won=${r.won}  (leads=mql? ${r.leads === r.mql})`,
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
