import { requireAuth } from "@/lib/auth/current-user";
import {
  getPremissas,
  getPremissasByEntityIds,
  matrizDefaultBlocks,
} from "@/db/repositories/premissas";
import { getUnitSetup, getUnitSetupsByOrgIds } from "@/db/repositories/unit-setup";
import { REALIZADO_HISTORICO_DEFAULT } from "@/lib/premissas/matriz-defaults";
import {
  agregarPorSubCanalMatriz,
  agregarPorSubCanalPorTierMatriz,
  agregarRampUpMatriz,
  calcularPorSubCanal,
  calcularPorSubCanalPorTier,
  calcularRampUp,
} from "@/lib/premissas/funil-reverso";
import { ForecastClient } from "@/components/realizado/realizado-client";
import { RealizadoEmpty } from "@/components/realizado/realizado-empty";

export const metadata = {
  title: "Forecast 2026 · V4 GTM OS",
};

export const dynamic = "force-dynamic";

export default async function RealizadoPage() {
  const session = await requireAuth();

  // Defaults da Matriz (linha de /premissas, ou hardcoded) — fallback para
  // unidades que ainda não personalizaram premissas.
  const matrizOrg = session.availableOrganizations.find((o) => o.type === "matriz");
  const matrizBlocks =
    (matrizOrg ? await getPremissas(matrizOrg.id) : null) ?? matrizDefaultBlocks();

  if (session.actingMode === "matriz") {
    const unidades = session.availableOrganizations.filter((o) => o.type === "unidade");
    if (unidades.length === 0) {
      return <RealizadoEmpty mode="matriz-sem-unidades" />;
    }
    const ids = unidades.map((o) => o.id);
    const [blocksById, setups] = await Promise.all([
      getPremissasByEntityIds(ids),
      getUnitSetupsByOrgIds(ids),
    ]);
    const setupByOrgId = new Map(setups.map((s) => [s.organizationId, s] as const));
    const rampUpUnidades = unidades.map((u) => {
      const blocks = blocksById.get(u.id) ?? matrizBlocks;
      const realizado = setupByOrgId.get(u.id)?.realizadoHistorico ?? REALIZADO_HISTORICO_DEFAULT;
      return calcularRampUp(blocks, u.horizonteAtual, { realizadoHistorico: realizado, dataInicio: u.dataInicio });
    });
    const subCanalUnidades = unidades.map((u) => {
      const blocks = blocksById.get(u.id) ?? matrizBlocks;
      const realizado = setupByOrgId.get(u.id)?.realizadoHistorico ?? REALIZADO_HISTORICO_DEFAULT;
      return calcularPorSubCanal(blocks, u.horizonteAtual, { realizadoHistorico: realizado, dataInicio: u.dataInicio });
    });
    const subCanalTierUnidades = unidades.map((u) => {
      const blocks = blocksById.get(u.id) ?? matrizBlocks;
      const realizado = setupByOrgId.get(u.id)?.realizadoHistorico ?? REALIZADO_HISTORICO_DEFAULT;
      return calcularPorSubCanalPorTier(blocks, u.horizonteAtual, { realizadoHistorico: realizado, dataInicio: u.dataInicio });
    });
    return (
      <ForecastClient
        mode="matriz"
        organizationName="Consolidado da rede"
        unitCount={unidades.length}
        linhasRampUp={agregarRampUpMatriz(rampUpUnidades)}
        linhasSubCanal={agregarPorSubCanalMatriz(subCanalUnidades)}
        linhasSubCanalTier={agregarPorSubCanalPorTierMatriz(subCanalTierUnidades)}
      />
    );
  }

  const unitOrg =
    session.activeOrganization ??
    session.availableOrganizations.find((o) => o.type === "unidade") ??
    null;
  if (!unitOrg) return <RealizadoEmpty mode="unidade-sem-org" />;

  const [blocks, setup] = await Promise.all([
    getPremissas(unitOrg.id).then((b) => b ?? matrizBlocks),
    getUnitSetup(unitOrg.id),
  ]);
  const realizado = setup.realizadoHistorico ?? REALIZADO_HISTORICO_DEFAULT;
  const curvaOpts = { realizadoHistorico: realizado, dataInicio: unitOrg.dataInicio };

  return (
    <ForecastClient
      mode="unidade"
      organizationId={unitOrg.id}
      organizationName={unitOrg.name}
      horizonteAtual={unitOrg.horizonteAtual}
      linhasRampUp={calcularRampUp(blocks, unitOrg.horizonteAtual, curvaOpts)}
      linhasSubCanal={calcularPorSubCanal(blocks, unitOrg.horizonteAtual, curvaOpts)}
      linhasSubCanalTier={calcularPorSubCanalPorTier(blocks, unitOrg.horizonteAtual, curvaOpts)}
      investimentoMidia={blocks.investimentoMidia}
      investimentoMensal={blocks.investimentoMensal}
      matrizInvestimentoMidia={matrizBlocks.investimentoMidia}
      realizadoHistorico={realizado}
      dataInicio={unitOrg.dataInicio}
    />
  );
}
