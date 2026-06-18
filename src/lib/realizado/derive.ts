/**
 * Deriva `realizado_funil` (grão diário) a partir das landings cruas
 * `realizado_import_lead` (+ `realizado_import_investimento`).
 *
 * Por linha do extrato, bucketiza CADA métrica no dia da SUA data de evento,
 * aplicando o de-para (de-para.ts) e mantendo só eventos de 2026:
 *   leads ← dt_cadastro_lead       (tier = tier_lead,  categoria = '')
 *   mql   ← dt_cadastro_lead       (SÓ funil longo: LB/BB — ver subcanalTemMql)
 *   sql (rm)  ← dt_rm              (tier = tier_lead,  categoria = '')
 *   sal (rr)  ← dt_rr              (tier = tier_lead,  categoria = '')
 *   won / faturamento ← dt_venda   (tier = tier_venda, categoria = produto)
 *
 * O investido (`invest`) vem da landing dedicada `realizado_import_investimento`
 * (investido por subcanal por dia, já por unidade) e é distribuído entre os tiers
 * do dia/subcanal proporcional aos leads. Unidade resolvida por id_tenant →
 * organizations.id_tenant.
 *
 * Idempotente: substitui todo o realizado de cada org (replaceRealizadoFunilDaily).
 *
 * Este módulo é a fonte única da derivação: chamado tanto pelo CLI
 * (scripts/derive-realizado-funil.ts) quanto pela rota de cron
 * (/api/realizado/derive).
 */
import { db } from "@/db";
import {
  organizations,
  realizadoImportInvestimento,
  realizadoImportLead,
} from "@/db/schema";
import {
  pruneRealizadoFunilExcept,
  replaceRealizadoFunilDaily,
  replaceRealizadoNaoClassificado,
  type MotivoNaoClassificado,
  type NaoClassificadoCelula,
  type RealizadoFunilDia,
} from "@/db/repositories/realizado-funil";
import {
  categoriaProduto,
  INVEST_COL_TO_SUBCANAL,
  mapCanal,
  normalizeTier,
  subcanalTemMql,
} from "@/lib/realizado/de-para";
import type { SubCanalKey } from "@/lib/premissas/funil-reverso";
import type { Tier } from "@/lib/premissas/matriz-defaults";

const inAno2026 = (dia: string | null): dia is string =>
  !!dia && /^2026-\d{2}-\d{2}$/.test(dia);

/** Os 5 tiers — usado no rateio do investido quando não há leads no dia/subcanal. */
const TIERS: readonly Tier[] = ["Tiny", "Small", "Medium", "Large", "Enterprise"] as const;

type Drops = {
  tenantSemOrg: number;
  canalNaoMapeado: number;
  tierTopo: number;
  tierVenda: number;
  dataAusente: number;
  dataForaDe2026: number;
};

/** Resumo estruturado da derivação — retornado pra log/CLI e pra resposta da rota. */
export type DeriveResult = {
  landingRows: number;
  investRows: number;
  orgs: number;
  celulas: number;
  contribuicoes: number;
  somaWon: number;
  somaFaturamento: number;
  somaInvestido: number;
  investFallback: number;
  orgsRemovidas: number;
  naoClassificado: {
    celulas: number;
    leads: number;
    mql: number;
    sql: number;
    sal: number;
    won: number;
    faturamento: number;
  };
  drops: Drops;
  investDrops: { semOrg: number; semData: number; foraDe2026: number };
};

function novaCelula(
  dia: string,
  subcanal: SubCanalKey,
  tier: Tier,
  categoria: string,
): RealizadoFunilDia {
  return { dia, subcanal, tier, categoria, leads: 0, mql: 0, sql: 0, sal: 0, won: 0, faturamento: 0, invest: 0 };
}

export async function deriveRealizadoFunil(): Promise<DeriveResult> {
  // de-para id_tenant → organizationId. A unidade é resolvida AQUI (não pelo
  // organization_id da landing): assim o derive funciona mesmo quando o time de
  // dados grava direto na landing sem preencher organization_id — basta o
  // id_tenant casar com organizations.id_tenant. Mesma resolução usada no investido.
  const orgRows = await db
    .select({ id: organizations.id, idTenant: organizations.idTenant })
    .from(organizations);
  // Resolução tolerante a espaço/quebra de linha no id_tenant (erro comum ao colar
  // o valor no banco — ex.: "uuid\n" não casaria com o extrato sem o trim).
  const tkey = (s: string | null | undefined) => (s ?? "").trim();
  const orgByTenant = new Map<string, string>();
  for (const o of orgRows) { const t = tkey(o.idTenant); if (t) orgByTenant.set(t, o.id); }

  const rows = await db
    .select({
      idTenant: realizadoImportLead.idTenant,
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
    .from(realizadoImportLead);

  // org → (chave dia|subcanal|tier|categoria → célula)
  const byOrg = new Map<string, Map<string, RealizadoFunilDia>>();
  const drops: Drops = { tenantSemOrg: 0, canalNaoMapeado: 0, tierTopo: 0, tierVenda: 0, dataAusente: 0, dataForaDe2026: 0 };
  let emitidas = 0;

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

  // ── Balde não-classificado: tudo que NÃO entra no grid mas aconteceu em 2026.
  // Grão idTenant × mês × motivo × rótulo cru. Mesmo escopo 2026 do grid.
  const residual = new Map<string, NaoClassificadoCelula>();
  const norm = (s: string | null | undefined) => ((s ?? "").trim() || "(vazio)").slice(0, 120);
  function addResidual(
    orgId: string | null,
    idTenant: string | null,
    dia: string | null,
    motivo: MotivoNaoClassificado,
    rotulo: string,
    field: "leads" | "mql" | "sql" | "sal" | "won" | "faturamento",
    valor: number,
  ) {
    if (valor <= 0) return;
    if (!inAno2026(dia)) return; // fora de 2026 / sem data: fora do escopo (igual ao grid)
    const mes = dia.slice(0, 7);
    const k = `${idTenant ?? ""}|${mes}|${motivo}|${rotulo}`;
    let cell = residual.get(k);
    if (!cell) {
      cell = { organizationId: orgId, idTenant, mes, motivo, rotuloCru: rotulo, leads: 0, mql: 0, sql: 0, sal: 0, won: 0, faturamento: 0 };
      residual.set(k, cell);
    }
    cell[field] += valor;
  }
  /** Joga as 6 métricas da linha no balde, cada uma na sua data de evento. */
  function residualLinhaInteira(orgId: string | null, idTenant: string | null, motivo: MotivoNaoClassificado, rotulo: string, r: (typeof rows)[number]) {
    addResidual(orgId, idTenant, r.dtCadastro, motivo, rotulo, "leads", r.leads);
    addResidual(orgId, idTenant, r.dtCadastro, motivo, rotulo, "mql", r.mql);
    addResidual(orgId, idTenant, r.dtRm, motivo, rotulo, "sql", r.rm);
    addResidual(orgId, idTenant, r.dtRr, motivo, rotulo, "sal", r.rr);
    addResidual(orgId, idTenant, r.dtVenda, motivo, rotulo, "won", r.won);
    addResidual(orgId, idTenant, r.dtVenda, motivo, rotulo, "faturamento", r.revenueWon);
  }

  for (const r of rows) {
    const orgId = orgByTenant.get(tkey(r.idTenant));
    if (!orgId) {
      if (r.leads || r.mql || r.rm || r.rr || r.won) drops.tenantSemOrg += 1;
      residualLinhaInteira(null, r.idTenant, "tenant_nao_cadastrado", norm(r.idTenant), r);
      continue;
    }
    const subcanal = mapCanal(r.canal);
    if (!subcanal) {
      if (r.leads || r.mql || r.rm || r.rr || r.won) drops.canalNaoMapeado += 1;
      residualLinhaInteira(orgId, r.idTenant, "canal_nao_mapeado", norm(r.canal), r);
      continue;
    }
    // Topo do funil — tier_lead, sem categoria.
    const tierLead = normalizeTier(r.tierLead);
    if (tierLead) {
      add(orgId, r.dtCadastro, subcanal, tierLead, "", "leads", r.leads);
      // MQL só em funil longo (LB/BB) — espelha o projetado, onde MB/Eventos/
      // Outbound têm mql=0. Mantém o estágio EDUCATION comparável.
      if (subcanalTemMql(subcanal)) {
        add(orgId, r.dtCadastro, subcanal, tierLead, "", "mql", r.mql);
      }
      add(orgId, r.dtRm, subcanal, tierLead, "", "sql", r.rm);
      add(orgId, r.dtRr, subcanal, tierLead, "", "sal", r.rr);
    } else if (r.leads || r.mql || r.rm || r.rr) {
      drops.tierTopo += 1;
      const rot = norm(r.tierLead);
      addResidual(orgId, r.idTenant, r.dtCadastro, "tier_lead_invalido", rot, "leads", r.leads);
      addResidual(orgId, r.idTenant, r.dtCadastro, "tier_lead_invalido", rot, "mql", r.mql);
      addResidual(orgId, r.idTenant, r.dtRm, "tier_lead_invalido", rot, "sql", r.rm);
      addResidual(orgId, r.idTenant, r.dtRr, "tier_lead_invalido", rot, "sal", r.rr);
    }
    // Venda — tier_venda, com categoria do produto.
    const tierVenda = normalizeTier(r.tierVenda);
    if (tierVenda) {
      const cat = categoriaProduto(r.categoria);
      add(orgId, r.dtVenda, subcanal, tierVenda, cat, "won", r.won);
      add(orgId, r.dtVenda, subcanal, tierVenda, cat, "faturamento", r.revenueWon);
    } else if (r.won || r.revenueWon) {
      drops.tierVenda += 1;
      const rot = norm(r.tierVenda);
      addResidual(orgId, r.idTenant, r.dtVenda, "venda_sem_tier", rot, "won", r.won);
      addResidual(orgId, r.idTenant, r.dtVenda, "venda_sem_tier", rot, "faturamento", r.revenueWon);
    }
  }

  // ── Investido por subcanal (fonte: realizado_import_investimento) ──────────
  // Distribui o investido de cada dia/subcanal entre os tiers proporcional aos
  // leads daquele dia/subcanal. Sem leads no dia/subcanal → rateio igual entre os
  // 5 tiers. (orgByTenant já foi montado no topo da função.)

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

  for (const r of investRows) {
    const orgId = orgByTenant.get(tkey(r.idTenant));
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

  // Limpa unidades órfãs (existiam no realizado_funil mas sumiram do extrato).
  // Guarda: não apaga nada se byOrg vier vazio (landing vazia → não zera tudo).
  const orgsRemovidas = await pruneRealizadoFunilExcept([...byOrg.keys()]);

  // Grava o balde não-classificado (replace global). Guarda: só toca se houve
  // landing pra processar — landing vazia não zera o balde existente.
  const naoClassif = { celulas: 0, leads: 0, mql: 0, sql: 0, sal: 0, won: 0, faturamento: 0 };
  for (const c of residual.values()) {
    naoClassif.leads += c.leads; naoClassif.mql += c.mql; naoClassif.sql += c.sql;
    naoClassif.sal += c.sal; naoClassif.won += c.won; naoClassif.faturamento += c.faturamento;
  }
  if (rows.length > 0) {
    naoClassif.celulas = await replaceRealizadoNaoClassificado([...residual.values()]);
  }

  return {
    landingRows: rows.length,
    investRows: investRows.length,
    orgs: byOrg.size,
    celulas: totalCelulas,
    contribuicoes: emitidas,
    somaWon: totalWon,
    somaFaturamento: totalFat,
    somaInvestido: investTotal,
    investFallback,
    orgsRemovidas,
    naoClassificado: naoClassif,
    drops,
    investDrops,
  };
}
