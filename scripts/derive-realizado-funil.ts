/**
 * One-off / recarregável: deriva `realizado_funil` (grão diário) a partir das
 * landings cruas `realizado_import_lead` (+ `realizado_import_investimento`).
 *
 * A lógica vive em src/lib/realizado/derive.ts (fonte única, compartilhada com a
 * rota de cron /api/realizado/derive). Este arquivo é só o wrapper de CLI.
 *
 * Rodar: npm run derive:realizado
 */
import { deriveRealizadoFunil } from "../src/lib/realizado/derive";

async function main() {
  const r = await deriveRealizadoFunil();

  console.log(`landing: ${r.landingRows} linhas com unidade`);
  console.log(`investido: ${r.investRows} linhas na landing`);
  console.log("\n── derivado ──");
  console.log(`orgs:               ${r.orgs}`);
  console.log(`células gravadas:   ${r.celulas}`);
  console.log(`contribuições:      ${r.contribuicoes}`);
  console.log(`Σ won (2026):       ${r.somaWon}`);
  console.log(`Σ faturamento:      ${r.somaFaturamento.toLocaleString("pt-BR")}`);
  console.log(`Σ investido:        ${r.somaInvestido.toLocaleString("pt-BR")}`);
  console.log(`  ↳ sem leads (rateio igual): ${r.investFallback.toLocaleString("pt-BR")}`);
  console.log(`unidades órfãs removidas: ${r.orgsRemovidas}`);

  const nc = r.naoClassificado;
  console.log("\n── não-classificado (balde — fora do grid, mas contabilizado) ──");
  console.log(`células: ${nc.celulas}`);
  console.log(`leads: ${nc.leads.toLocaleString("pt-BR")} | sql: ${nc.sql} | sal: ${nc.sal}`);
  console.log(`won: ${nc.won} | faturamento: ${nc.faturamento.toLocaleString("pt-BR")}`);

  console.log("\n── descartes (revise o de-para se algo for inesperado) ──");
  console.log(`tenant sem unidade:  ${r.drops.tenantSemOrg} linhas (id_tenant não casa com organizations)`);
  console.log(`canal não mapeado:   ${r.drops.canalNaoMapeado} linhas`);
  console.log(`tier (topo) inválido: ${r.drops.tierTopo} linhas`);
  console.log(`tier (venda) inválido: ${r.drops.tierVenda} linhas`);
  console.log(`data ausente:        ${r.drops.dataAusente} contribuições`);
  console.log(`data fora de 2026:   ${r.drops.dataForaDe2026} contribuições`);
  console.log(
    `invest:  semOrg=${r.investDrops.semOrg}  semData=${r.investDrops.semData}  foraDe2026=${r.investDrops.foraDe2026}`,
  );
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
