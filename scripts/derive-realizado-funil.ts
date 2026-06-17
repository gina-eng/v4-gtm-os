/**
 * One-off / recarregável: deriva `realizado_funil` (grão diário) a partir da
 * landing crua `realizado_import_lead`.
 *
 * Por linha do extrato, bucketiza CADA métrica no dia da SUA data de evento,
 * aplicando o de-para (src/lib/realizado/de-para.ts) e mantendo só eventos de 2026:
 *   leads ← dt_cadastro_lead       (tier = tier_lead,  categoria = '')
 *   mql   ← dt_cadastro_lead       (SÓ funil longo: LB/BB — ver subcanalTemMql)
 *   sql (rm)  ← dt_rm              (tier = tier_lead,  categoria = '')
 *   sal (rr)  ← dt_rr              (tier = tier_lead,  categoria = '')
 *   won / faturamento ← dt_venda   (tier = tier_venda, categoria = produto)
 *
 * O investido (`invest`) NÃO sai mais do funil de leads (media_investment, que era
 * da REDE e inflado): é carregado da landing dedicada `realizado_import_investimento`
 * (investido por subcanal por dia, já por unidade — colunas LB/MB/BB, ver
 * INVEST_COL_TO_SUBCANAL) e distribuído entre os tiers do dia/subcanal proporcional
 * aos leads. A unidade é resolvida por id_tenant → organizations.id_tenant.
 *
 * Contribuições com canal não mapeado, tier inválido, data ausente ou fora de
 * 2026 são descartadas e contadas no relatório (não derrubam a linha toda).
 * Idempotente: substitui todo o realizado de cada org.
 *
 * Rodar: npm run derive:realizado
 */
import { isNotNull } from "drizzle-orm";
import { db } from "../src/db";
import {
  organizations,
  realizadoImportInvestimento,
  realizadoImportLead,
} from "../src/db/schema";
import {
  replaceRealizadoFunilDaily,
  type RealizadoFunilDia,
} from "../src/db/repositories/realizado-funil";
import {
  categoriaProduto,
  INVEST_COL_TO_SUBCANAL,
  mapCanal,
  normalizeTier,
  subcanalTemMql,
} from "../src/lib/realizado/de-para";
import type { SubCanalKey } from "../src/lib/premissas/funil-reverso";
import type { Tier } from "../src/lib/premissas/matriz-defaults";

const inAno2026 = (dia: string | null): dia is string =>
  !!dia && /^2026-\d{2}-\d{2}$/.test(dia);

/** Os 5 tiers — usado no rateio do investido quando não há leads no dia/subcanal. */
const TIERS: readonly Tier[] = ["Tiny", "Small", "Medium", "Large", "Enterprise"] as const;

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
  return { dia, subcanal, tier, categoria, leads: 0, mql: 0, sql: 0, sal: 0, won: 0, faturamento: 0, invest: 0 };
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

  // Magnitude e rótulos crus de cada descarte — pra NÃO perder dado em silêncio:
  // mostra QUANTO (leads/won/receita) e QUAIS rótulos crus (canal/tier) ficaram de
  // fora, para o operador estender o de-para e recuperar, em vez de só ver um total.
  const dropMag = {
    canalNaoMapeado: { leads: 0, won: 0, revenue: 0 },
    tierTopo: { leads: 0 },
    tierVenda: { won: 0, revenue: 0 },
  };
  const canalNaoMapeadoLabels = new Map<string, { n: number; leads: number; won: number }>();
  const tierTopoLabels = new Map<string, number>(); // tier_lead cru → leads descartados
  const tierVendaLabels = new Map<string, { won: number; revenue: number }>();
  const norm = (s: string | null | undefined) => (s ?? "").trim() || "(vazio)";

  function add(
    orgId: string,
    dia: string | null,
    subcanal: SubCanalKey,
    tier: Tier,
    categoria: string,
    field: "leads" | "mql" | "sql" | "sal" | "won" | "faturamento" | "invest",
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
      if (r.leads || r.mql || r.rm || r.rr || r.won) {
        drops.canalNaoMapeado += 1;
        dropMag.canalNaoMapeado.leads += r.leads;
        dropMag.canalNaoMapeado.won += r.won;
        dropMag.canalNaoMapeado.revenue += r.revenueWon;
        const label = norm(r.canal);
        const cur = canalNaoMapeadoLabels.get(label) ?? { n: 0, leads: 0, won: 0 };
        cur.n += 1;
        cur.leads += r.leads;
        cur.won += r.won;
        canalNaoMapeadoLabels.set(label, cur);
      }
      continue;
    }
    // Topo do funil — tier_lead, sem categoria.
    const tierLead = normalizeTier(r.tierLead);
    if (tierLead) {
      add(orgId, r.dtCadastro, subcanal, tierLead, "", "leads", r.leads);
      // O investido (invest) é carregado depois, da landing dedicada
      // realizado_import_investimento (ver bloco abaixo do loop principal).
      // MQL só em funil longo (LB/BB) — espelha o projetado, onde MB/Eventos/
      // Outbound têm mql=0. Mantém o estágio EDUCATION comparável.
      if (subcanalTemMql(subcanal)) {
        add(orgId, r.dtCadastro, subcanal, tierLead, "", "mql", r.mql);
      }
      add(orgId, r.dtRm, subcanal, tierLead, "", "sql", r.rm);
      add(orgId, r.dtRr, subcanal, tierLead, "", "sal", r.rr);
    } else if (r.leads || r.mql || r.rm || r.rr) {
      drops.tierTopo += 1;
      dropMag.tierTopo.leads += r.leads;
      tierTopoLabels.set(norm(r.tierLead), (tierTopoLabels.get(norm(r.tierLead)) ?? 0) + r.leads);
    }
    // Venda — tier_venda, com categoria do produto.
    const tierVenda = normalizeTier(r.tierVenda);
    if (tierVenda) {
      const cat = categoriaProduto(r.categoria);
      add(orgId, r.dtVenda, subcanal, tierVenda, cat, "won", r.won);
      add(orgId, r.dtVenda, subcanal, tierVenda, cat, "faturamento", r.revenueWon);
    } else if (r.won || r.revenueWon) {
      drops.tierVenda += 1;
      dropMag.tierVenda.won += r.won;
      dropMag.tierVenda.revenue += r.revenueWon;
      const label = norm(r.tierVenda);
      const cur = tierVendaLabels.get(label) ?? { won: 0, revenue: 0 };
      cur.won += r.won;
      cur.revenue += r.revenueWon;
      tierVendaLabels.set(label, cur);
    }
  }

  // ── Investido por subcanal (fonte: realizado_import_investimento) ──────────
  // Substitui o antigo media_investment. Resolve a unidade por id_tenant →
  // organizations.id_tenant (mesmo de-para do load) e distribui o investido de
  // cada dia/subcanal entre os tiers proporcional aos leads daquele dia/subcanal
  // (total exato e comparável ao projetado por tier). Sem leads no dia/subcanal →
  // rateio igual entre os 5 tiers (preserva o total; contado em investFallback).
  const orgRows = await db
    .select({ id: organizations.id, idTenant: organizations.idTenant })
    .from(organizations);
  const orgByTenant = new Map<string, string>();
  for (const o of orgRows) if (o.idTenant) orgByTenant.set(o.idTenant, o.id);

  // Índice de leads por (org → `dia|subcanal` → tier → leads), só células de topo.
  const leadsIndex = new Map<string, Map<string, Map<Tier, number>>>();
  for (const [orgId, cells] of byOrg) {
    for (const c of cells.values()) {
      if (c.categoria !== "" || c.leads <= 0) continue;
      let byKey = leadsIndex.get(orgId);
      if (!byKey) { byKey = new Map(); leadsIndex.set(orgId, byKey); }
      const k = `${c.dia}|${c.subcanal}`;
      let byTier = byKey.get(k);
      if (!byTier) { byTier = new Map(); byKey.set(k, byTier); }
      byTier.set(c.tier, (byTier.get(c.tier) ?? 0) + c.leads);
    }
  }

  let investTotal = 0;
  let investFallback = 0;
  const investDrops = { semOrg: 0, semData: 0, foraDe2026: 0 };

  function addInvestido(orgId: string, dia: string, subcanal: SubCanalKey, valor: number) {
    if (valor <= 0) return;
    investTotal += valor;
    const byTier = leadsIndex.get(orgId)?.get(`${dia}|${subcanal}`);
    const totalLeads = byTier
      ? Array.from(byTier.values()).reduce((a, b) => a + b, 0)
      : 0;
    if (byTier && totalLeads > 0) {
      for (const [tier, leads] of byTier) {
        add(orgId, dia, subcanal, tier, "", "invest", valor * (leads / totalLeads));
      }
    } else {
      investFallback += valor;
      for (const tier of TIERS) {
        add(orgId, dia, subcanal, tier, "", "invest", valor / TIERS.length);
      }
    }
  }

  const investRows = await db
    .select({
      idTenant: realizadoImportInvestimento.idTenant,
      data: realizadoImportInvestimento.data,
      lb: realizadoImportInvestimento.lb,
      mb: realizadoImportInvestimento.mb,
      bb: realizadoImportInvestimento.bb,
    })
    .from(realizadoImportInvestimento);

  console.log(`investido: ${investRows.length} linhas na landing`);

  for (const r of investRows) {
    const orgId = r.idTenant ? orgByTenant.get(r.idTenant) : undefined;
    if (!orgId) { investDrops.semOrg += 1; continue; }
    if (!r.data) { investDrops.semData += 1; continue; }
    if (!inAno2026(r.data)) { investDrops.foraDe2026 += 1; continue; }
    for (const [col, subcanal] of Object.entries(INVEST_COL_TO_SUBCANAL) as Array<
      [keyof typeof INVEST_COL_TO_SUBCANAL, SubCanalKey]
    >) {
      addInvestido(orgId, r.data, subcanal, r[col]);
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
  console.log(`Σ investido:        ${investTotal.toLocaleString("pt-BR")}`);
  console.log(`  ↳ sem leads (rateio igual): ${investFallback.toLocaleString("pt-BR")}`);

  // ── Descartes detalhados (NÃO entraram no funil) ─────────────────────────────
  // Visíveis e quantificados de propósito: se algo aqui for inesperado, é dado
  // recuperável estendendo o de-para (de-para.ts: CANAL_BI_TO_SUBCANAL / TIER_BY_UPPER).
  const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  console.log("\n── descartes (revise o de-para se algo for inesperado) ──");
  console.log(
    `canal não mapeado:  ${drops.canalNaoMapeado} linhas | ` +
      `${dropMag.canalNaoMapeado.leads} leads, ${dropMag.canalNaoMapeado.won} won, R$ ${brl(dropMag.canalNaoMapeado.revenue)}`,
  );
  Array.from(canalNaoMapeadoLabels.entries())
    .sort((a, b) => b[1].leads - a[1].leads)
    .slice(0, 15)
    .forEach(([label, v]) =>
      console.log(`      • "${label}": ${v.n} linhas, ${v.leads} leads, ${v.won} won`),
    );
  console.log(
    `tier (topo) inválido: ${drops.tierTopo} linhas | ${dropMag.tierTopo.leads} leads descartados`,
  );
  Array.from(tierTopoLabels.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([label, leads]) => console.log(`      • "${label}": ${leads} leads`));
  console.log(
    `tier (venda) inválido: ${drops.tierVenda} linhas | ${dropMag.tierVenda.won} won, R$ ${brl(dropMag.tierVenda.revenue)}`,
  );
  Array.from(tierVendaLabels.entries())
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 15)
    .forEach(([label, v]) => console.log(`      • "${label}": ${v.won} won, R$ ${brl(v.revenue)}`));
  console.log(`data ausente:        ${drops.dataAusente} contribuições`);
  console.log(`data fora de 2026:   ${drops.dataForaDe2026} contribuições`);
  console.log(
    `invest:  semOrg=${investDrops.semOrg}  semData=${investDrops.semData}  foraDe2026=${investDrops.foraDe2026}`,
  );
  console.log(
    "nota: a derivação chaveia o canal por `canal_aquisicao`; `canal_origem` fica\n" +
      "      preservado na landing (referência), mas não entra no funil por ora.",
  );
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
