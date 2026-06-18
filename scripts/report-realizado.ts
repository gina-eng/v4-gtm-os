/**
 * READ-ONLY: relatório de diagnóstico do realizado a partir da landing
 * `realizado_import_lead`. Aplica o MESMO de-para do derive e quebra:
 *  - funil bruto + conversões
 *  - closing/won: pra onde foram as vendas (data, canal, tier)
 *  - descartes detalhados com rótulos crus (dado recuperável)
 * Não escreve nada.
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { realizadoImportLead, organizations } from "../src/db/schema";
import { mapCanal, normalizeTier } from "../src/lib/realizado/de-para";

const inAno2026 = (d: string | null) => !!d && /^2026-\d{2}-\d{2}$/.test(d);
const ano = (d: string | null) => (d ? d.slice(0, 4) : "(nula)");
const n = (s: string | null | undefined) => (s ?? "").trim() || "(vazio)";
const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
const pct = (a: number, b: number) => (b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "—");

async function main() {
  const orgRows = await db
    .select({ id: organizations.id, idTenant: organizations.idTenant })
    .from(organizations);
  const orgTenants = new Set<string>();
  for (const o of orgRows) if (o.idTenant) orgTenants.add(o.idTenant);

  const rows = await db
    .select({
      idTenant: realizadoImportLead.idTenant,
      franqueado: realizadoImportLead.franqueado,
      canal: realizadoImportLead.canalAquisicao,
      tierLead: realizadoImportLead.tierLead,
      tierVenda: realizadoImportLead.tierVenda,
      dtVenda: realizadoImportLead.dtVenda,
      leads: realizadoImportLead.leads,
      mql: realizadoImportLead.mql,
      rm: realizadoImportLead.rm,
      rr: realizadoImportLead.rr,
      won: realizadoImportLead.won,
      revenueWon: realizadoImportLead.revenueWon,
    })
    .from(realizadoImportLead);

  // ── Funil bruto (todas as linhas, todas as datas) ──
  const bruto = { leads: 0, mql: 0, rm: 0, rr: 0, won: 0, rev: 0 };
  for (const r of rows) {
    bruto.leads += r.leads; bruto.mql += r.mql; bruto.rm += r.rm;
    bruto.rr += r.rr; bruto.won += r.won; bruto.rev += r.revenueWon;
  }

  // ── Closing/won: por destino ──
  const wonPorAno = new Map<string, { won: number; rev: number }>();
  let wonTotal = 0, revTotal = 0;
  let won2026 = 0, rev2026 = 0;
  let wonPerdidoCanal = 0, revPerdidoCanal = 0;
  let wonPerdidoTier = 0, revPerdidoTier = 0;
  let wonSobrevive = 0, revSobrevive = 0;
  const won2026Mes = new Map<string, { won: number; rev: number }>();
  const won2026Sub = new Map<string, { won: number; rev: number }>();

  // ── Descartes detalhados ──
  const tenantSemOrg = new Map<string, { linhas: number; leads: number; won: number; rev: number; franq: string }>();
  const canalNaoMap = new Map<string, { linhas: number; leads: number; won: number; rev: number }>();
  const tierLeadInval = new Map<string, number>();
  const tierVendaInval = new Map<string, { won: number; rev: number }>();

  for (const r of rows) {
    // closing por ano (toda venda, antes de qualquer filtro)
    if (r.won || r.revenueWon) {
      wonTotal += r.won; revTotal += r.revenueWon;
      const a = ano(r.dtVenda);
      const wa = wonPorAno.get(a) ?? { won: 0, rev: 0 };
      wa.won += r.won; wa.rev += r.revenueWon; wonPorAno.set(a, wa);
    }

    // tenant sem unidade
    const temOrg = !!r.idTenant && orgTenants.has(r.idTenant);
    if (!temOrg) {
      if (r.leads || r.mql || r.rm || r.rr || r.won) {
        const k = r.idTenant ?? "(sem id_tenant)";
        const cur = tenantSemOrg.get(k) ?? { linhas: 0, leads: 0, won: 0, rev: 0, franq: n(r.franqueado) };
        cur.linhas++; cur.leads += r.leads; cur.won += r.won; cur.rev += r.revenueWon;
        tenantSemOrg.set(k, cur);
      }
      continue; // sem org, nada entra (closing analisado abaixo só pra orgs válidas)
    }

    const subcanal = mapCanal(r.canal);
    if (!subcanal) {
      if (r.leads || r.mql || r.rm || r.rr || r.won) {
        const k = n(r.canal);
        const cur = canalNaoMap.get(k) ?? { linhas: 0, leads: 0, won: 0, rev: 0 };
        cur.linhas++; cur.leads += r.leads; cur.won += r.won; cur.rev += r.revenueWon;
        canalNaoMap.set(k, cur);
      }
      if (r.won || r.revenueWon) { wonPerdidoCanal += r.won; revPerdidoCanal += r.revenueWon; }
      continue;
    }

    if (normalizeTier(r.tierLead) === null && (r.leads || r.mql || r.rm || r.rr)) {
      tierLeadInval.set(n(r.tierLead), (tierLeadInval.get(n(r.tierLead)) ?? 0) + r.leads);
    }

    // closing: só venda com org+canal válidos
    if (r.won || r.revenueWon) {
      const tierVenda = normalizeTier(r.tierVenda);
      if (!tierVenda) {
        wonPerdidoTier += r.won; revPerdidoTier += r.revenueWon;
        const cur = tierVendaInval.get(n(r.tierVenda)) ?? { won: 0, rev: 0 };
        cur.won += r.won; cur.rev += r.revenueWon; tierVendaInval.set(n(r.tierVenda), cur);
      } else if (!inAno2026(r.dtVenda)) {
        // venda válida mas fora de 2026 → não entra no funil 2026
      } else {
        wonSobrevive += r.won; revSobrevive += r.revenueWon;
        won2026 += r.won; rev2026 += r.revenueWon;
        const m = r.dtVenda!.slice(0, 7);
        const wm = won2026Mes.get(m) ?? { won: 0, rev: 0 };
        wm.won += r.won; wm.rev += r.revenueWon; won2026Mes.set(m, wm);
        const ws = won2026Sub.get(subcanal) ?? { won: 0, rev: 0 };
        ws.won += r.won; ws.rev += r.revenueWon; won2026Sub.set(subcanal, ws);
      }
    }
  }

  const linha = (s: string) => console.log(s);
  linha("\n══════════ RELATÓRIO REALIZADO (landing realizado_import_lead) ══════════");
  linha(`linhas: ${rows.length.toLocaleString("pt-BR")} | unidades(org) cadastradas com tenant: ${orgTenants.size}`);

  linha("\n── [1] FUNIL BRUTO (soma das colunas, TODAS as datas/tiers) ──");
  linha(`leads: ${bruto.leads.toLocaleString("pt-BR")}`);
  linha(`mql:   ${bruto.mql.toLocaleString("pt-BR")}   (lead→mql ${pct(bruto.mql, bruto.leads)})`);
  linha(`SQL:   ${bruto.rm.toLocaleString("pt-BR")}   (mql→sql ${pct(bruto.rm, bruto.mql)})`);
  linha(`SAL:   ${bruto.rr.toLocaleString("pt-BR")}   (sql→sal ${pct(bruto.rr, bruto.rm)})`);
  linha(`WON:   ${bruto.won.toLocaleString("pt-BR")}   (sal→won ${pct(bruto.won, bruto.rr)})`);
  linha(`revenue: ${brl(bruto.rev)}  | ticket médio: ${bruto.won > 0 ? brl(bruto.rev / bruto.won) : "—"}`);

  linha("\n── [2] CLOSING / WON — pra onde foram as vendas ──");
  linha(`won total na landing: ${wonTotal} | ${brl(revTotal)}`);
  linha("  por ANO da dt_venda:");
  Array.from(wonPorAno.entries()).sort().forEach(([a, v]) =>
    linha(`    ${a}: ${v.won} won | ${brl(v.rev)}`));
  linha("  filtrando p/ o funil 2026 (precisa: org válida + canal mapeado + tier_venda válido + dt_venda em 2026):");
  linha(`    perdido por canal não mapeado: ${wonPerdidoCanal} won | ${brl(revPerdidoCanal)}`);
  linha(`    perdido por tier_venda inválido: ${wonPerdidoTier} won | ${brl(revPerdidoTier)}`);
  linha(`    >>> SOBREVIVE no funil 2026: ${wonSobrevive} won | ${brl(revSobrevive)}`);
  linha("  won 2026 por MÊS:");
  Array.from(won2026Mes.entries()).sort().forEach(([m, v]) =>
    linha(`    ${m}: ${v.won} won | ${brl(v.rev)}`));
  linha("  won 2026 por SUBCANAL:");
  Array.from(won2026Sub.entries()).sort((a, b) => b[1].won - a[1].won).forEach(([s, v]) =>
    linha(`    ${s}: ${v.won} won | ${brl(v.rev)}`));

  linha("\n── [3a] DESCARTE: id_tenant sem unidade cadastrada (top 20 por leads) ──");
  Array.from(tenantSemOrg.entries()).sort((a, b) => b[1].leads - a[1].leads).slice(0, 20)
    .forEach(([t, v]) => linha(`  ${t}  [${v.franq}]  ${v.linhas} linhas | ${v.leads} leads | ${v.won} won | ${brl(v.rev)}`));
  const totSemOrg = Array.from(tenantSemOrg.values()).reduce((a, v) => ({ l: a.l + v.leads, w: a.w + v.won, r: a.r + v.rev }), { l: 0, w: 0, r: 0 });
  linha(`  TOTAL sem unidade: ${tenantSemOrg.size} tenants | ${totSemOrg.l} leads | ${totSemOrg.w} won | ${brl(totSemOrg.r)}`);

  linha("\n── [3b] DESCARTE: canal_aquisicao não mapeado (estender CANAL_BI_TO_SUBCANAL) ──");
  Array.from(canalNaoMap.entries()).sort((a, b) => b[1].leads - a[1].leads)
    .forEach(([c, v]) => linha(`  "${c}"  ${v.linhas} linhas | ${v.leads} leads | ${v.won} won | ${brl(v.rev)}`));

  linha("\n── [3c] DESCARTE: tier_lead inválido (topo do funil) ──");
  Array.from(tierLeadInval.entries()).sort((a, b) => b[1] - a[1])
    .forEach(([t, leads]) => linha(`  "${t}"  ${leads} leads`));

  linha("\n── [3d] DESCARTE: tier_venda inválido (closing) ──");
  Array.from(tierVendaInval.entries()).sort((a, b) => b[1].rev - a[1].rev)
    .forEach(([t, v]) => linha(`  "${t}"  ${v.won} won | ${brl(v.rev)}`));

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
