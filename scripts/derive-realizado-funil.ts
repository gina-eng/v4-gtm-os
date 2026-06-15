/**
 * One-off / recarregável: deriva `realizado_funil` (grão diário) a partir da
 * landing crua `realizado_import_lead`.
 *
 * Por linha do extrato, bucketiza CADA métrica no dia da SUA data de evento,
 * aplicando o de-para (src/lib/realizado/de-para.ts) e mantendo só eventos de 2026:
 *   leads/mql ← dt_cadastro_lead   (tier = tier_lead,  categoria = '')
 *   sql (rm)  ← dt_rm              (tier = tier_lead,  categoria = '')
 *   sal (rr)  ← dt_rr              (tier = tier_lead,  categoria = '')
 *   won / faturamento ← dt_venda   (tier = tier_venda, categoria = produto)
 *
 * Contribuições com canal não mapeado, tier inválido, data ausente ou fora de
 * 2026 são descartadas e contadas no relatório (não derrubam a linha toda).
 * Idempotente: substitui todo o realizado de cada org.
 *
 * Rodar: npm run derive:realizado
 */
import { isNotNull } from "drizzle-orm";
import { db } from "../src/db";
import { realizadoImportLead } from "../src/db/schema";
import {
  replaceRealizadoFunilDaily,
  type RealizadoFunilDia,
} from "../src/db/repositories/realizado-funil";
import { categoriaProduto, mapCanal, normalizeTier } from "../src/lib/realizado/de-para";
import type { SubCanalKey } from "../src/lib/premissas/funil-reverso";
import type { Tier } from "../src/lib/premissas/matriz-defaults";

const inAno2026 = (dia: string | null): dia is string =>
  !!dia && /^2026-\d{2}-\d{2}$/.test(dia);

type Drops = {
  canalNaoMapeado: number;
  tierTopo: number;
  tierVenda: number;
  dataAusente: number;
  dataForaDe2026: number;
};

function novaCelula(
  dia: string,
  subcanal: SubCanalKey,
  tier: Tier,
  categoria: string,
): RealizadoFunilDia {
  return { dia, subcanal, tier, categoria, leads: 0, mql: 0, sql: 0, sal: 0, won: 0, faturamento: 0 };
}

async function main() {
  const rows = await db
    .select({
      organizationId: realizadoImportLead.organizationId,
      canal: realizadoImportLead.canalAquisicao,
      tierLead: realizadoImportLead.tierLead,
      tierVenda: realizadoImportLead.tierVenda,
      categoria: realizadoImportLead.categoriaProduto,
      dtCadastro: realizadoImportLead.dtCadastroLead,
      dtRm: realizadoImportLead.dtRm,
      dtRr: realizadoImportLead.dtRr,
      dtVenda: realizadoImportLead.dtVenda,
      leads: realizadoImportLead.leads,
      mql: realizadoImportLead.mql,
      rm: realizadoImportLead.rm,
      rr: realizadoImportLead.rr,
      won: realizadoImportLead.won,
      revenueWon: realizadoImportLead.revenueWon,
    })
    .from(realizadoImportLead)
    .where(isNotNull(realizadoImportLead.organizationId));

  console.log(`landing: ${rows.length} linhas com unidade`);

  // org → (chave dia|subcanal|tier|categoria → célula)
  const byOrg = new Map<string, Map<string, RealizadoFunilDia>>();
  const drops: Drops = { canalNaoMapeado: 0, tierTopo: 0, tierVenda: 0, dataAusente: 0, dataForaDe2026: 0 };
  let emitidas = 0;

  function add(
    orgId: string,
    dia: string | null,
    subcanal: SubCanalKey,
    tier: Tier,
    categoria: string,
    field: "leads" | "mql" | "sql" | "sal" | "won" | "faturamento",
    valor: number,
  ) {
    if (valor <= 0) return;
    if (!dia) { drops.dataAusente += 1; return; }
    if (!inAno2026(dia)) { drops.dataForaDe2026 += 1; return; }
    let cells = byOrg.get(orgId);
    if (!cells) { cells = new Map(); byOrg.set(orgId, cells); }
    const k = `${dia}|${subcanal}|${tier}|${categoria}`;
    let cell = cells.get(k);
    if (!cell) { cell = novaCelula(dia, subcanal, tier, categoria); cells.set(k, cell); }
    cell[field] += valor;
    emitidas += 1;
  }

  for (const r of rows) {
    const orgId = r.organizationId as string;
    const subcanal = mapCanal(r.canal);
    if (!subcanal) {
      if (r.leads || r.mql || r.rm || r.rr || r.won) drops.canalNaoMapeado += 1;
      continue;
    }
    // Topo do funil — tier_lead, sem categoria.
    const tierLead = normalizeTier(r.tierLead);
    if (tierLead) {
      add(orgId, r.dtCadastro, subcanal, tierLead, "", "leads", r.leads);
      add(orgId, r.dtCadastro, subcanal, tierLead, "", "mql", r.mql);
      add(orgId, r.dtRm, subcanal, tierLead, "", "sql", r.rm);
      add(orgId, r.dtRr, subcanal, tierLead, "", "sal", r.rr);
    } else if (r.leads || r.mql || r.rm || r.rr) {
      drops.tierTopo += 1;
    }
    // Venda — tier_venda, com categoria do produto.
    const tierVenda = normalizeTier(r.tierVenda);
    if (tierVenda) {
      const cat = categoriaProduto(r.categoria);
      add(orgId, r.dtVenda, subcanal, tierVenda, cat, "won", r.won);
      add(orgId, r.dtVenda, subcanal, tierVenda, cat, "faturamento", r.revenueWon);
    } else if (r.won || r.revenueWon) {
      drops.tierVenda += 1;
    }
  }

  // grava por org
  let totalCelulas = 0;
  let totalWon = 0;
  let totalFat = 0;
  for (const [orgId, cells] of byOrg) {
    const arr = Array.from(cells.values());
    totalCelulas += arr.length;
    for (const c of arr) { totalWon += c.won; totalFat += c.faturamento; }
    await replaceRealizadoFunilDaily(orgId, arr);
  }

  console.log("\n── derivado ──");
  console.log(`orgs:               ${byOrg.size}`);
  console.log(`células gravadas:   ${totalCelulas}`);
  console.log(`contribuições:      ${emitidas}`);
  console.log(`Σ won (2026):       ${totalWon}`);
  console.log(`Σ faturamento:      ${totalFat.toLocaleString("pt-BR")}`);
  console.log("descartes:", JSON.stringify(drops));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
