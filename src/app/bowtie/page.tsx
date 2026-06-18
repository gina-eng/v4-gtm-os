import { requireAuth } from "@/lib/auth/current-user";
import {
  getPremissas,
  getPremissasByEntityIds,
  matrizDefaultBlocks,
} from "@/db/repositories/premissas";
import { getUnitSetup, getUnitSetupsByOrgIds } from "@/db/repositories/unit-setup";
import {
  getRealizadoFunil,
  getRealizadoFunilByOrgIds,
  getNaoClassificadoPorMes,
} from "@/db/repositories/realizado-funil";
import { REALIZADO_HISTORICO_DEFAULT } from "@/lib/premissas/matriz-defaults";
import {
  agregarPorSubCanalPorTierMatriz,
  calcularPorSubCanalPorTier,
} from "@/lib/premissas/funil-reverso";
import { calcularAtuacao, concatRealizadoMatriz } from "@/lib/realizado/bowtie";
import { resolveScopeOrgs } from "@/lib/realizado/scope";
import { BowtieClient } from "@/components/bowtie/bowtie-client";
import { BowtieEmpty } from "@/components/bowtie/bowtie-empty";

export const metadata = {
  title: "Funil Bowtie 2026 · V4 GTM OS",
};

export const dynamic = "force-dynamic";

/**
 * /bowtie — visualização do funil bowtie (aquisição) com filtros de mês × tier
 * × canal × sub-canal. Mesma estrutura de carregamento de /realizado: projetado
 * vem do `calcularPorSubCanalPorTier` (que já considera realizado histórico do
 * setup pra meses fechados); realizado bowtie vem da tabela `realizado_funil`
 * (grão diário, derivado do import) e é exibido read-only, agregado por mês.
 */
export default async function BowtiePage() {
  const session = await requireAuth();

  const matrizOrg = session.availableOrganizations.find((o) => o.type === "matriz");
  const matrizBlocks =
    (matrizOrg ? await getPremissas(matrizOrg.id) : null) ?? matrizDefaultBlocks();

  // Escopo (geral / todas_unidades / matriz_propria / unidade) → conjuntos de orgs.
  const scope = resolveScopeOrgs(session);

  // ── Visão de unidade (única org, com editor) ──────────────────────────────
  if (scope.display === "unidade") {
    const unitOrg = scope.unidadeOrg;
    if (!unitOrg) return <BowtieEmpty mode="unidade-sem-org" />;

    const [blocks, setup, realizado, balde] = await Promise.all([
      getPremissas(unitOrg.id).then((b) => b ?? matrizBlocks),
      getUnitSetup(unitOrg.id),
      getRealizadoFunil(unitOrg.id),
      getNaoClassificadoPorMes([unitOrg.id], false),
    ]);
    const realizadoHistorico = setup.realizadoHistorico ?? REALIZADO_HISTORICO_DEFAULT;
    const atuacao = calcularAtuacao(blocks, unitOrg.horizonteAtual);

    return (
      <BowtieClient
        mode="unidade"
        organizationName={unitOrg.name}
        horizonteAtual={unitOrg.horizonteAtual}
        linhasSubCanalTier={calcularPorSubCanalPorTier(blocks, unitOrg.horizonteAtual, {
          realizadoHistorico,
          dataInicio: unitOrg.dataInicio,
        })}
        realizadoCelulas={realizado}
        baldeRealizado={balde}
        tiersAtivos={Array.from(atuacao.tiersAtivos)}
        subcanaisAtivos={Array.from(atuacao.subcanaisAtivos)}
      />
    );
  }

  // ── Visões consolidadas (geral / todas_unidades / matriz_propria) ─────────
  if (scope.projetadoOrgs.length === 0) {
    return <BowtieEmpty mode="matriz-sem-unidades" />;
  }
  const projIds = scope.projetadoOrgs.map((o) => o.id);
  const [blocksById, setups, realizadoByOrg, balde] = await Promise.all([
    getPremissasByEntityIds(projIds),
    getUnitSetupsByOrgIds(projIds),
    getRealizadoFunilByOrgIds(scope.gridOrgIds),
    getNaoClassificadoPorMes(scope.baldeOrgIds, scope.baldeIncluiNulos),
  ]);
  const setupByOrgId = new Map(setups.map((s) => [s.organizationId, s] as const));
  const projetadoUnidades = scope.projetadoOrgs.map((u) => {
    const blocks = blocksById.get(u.id) ?? matrizBlocks;
    const realizado = setupByOrgId.get(u.id)?.realizadoHistorico ?? REALIZADO_HISTORICO_DEFAULT;
    return calcularPorSubCanalPorTier(blocks, u.horizonteAtual, {
      realizadoHistorico: realizado,
      dataInicio: u.dataInicio,
    });
  });

  return (
    <BowtieClient
      mode="matriz"
      organizationName={scope.label}
      unitCount={scope.projetadoOrgs.length}
      linhasSubCanalTier={agregarPorSubCanalPorTierMatriz(projetadoUnidades)}
      realizadoCelulas={concatRealizadoMatriz(realizadoByOrg.values())}
      baldeRealizado={balde}
    />
  );
}
