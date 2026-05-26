import { requireAuth } from "@/lib/auth/current-user";
import { getUnitSetup, getUnitSetupsByOrgIds } from "@/db/repositories/unit-setup";
import type { Organization } from "@/db/schema";
import {
  HORIZONTE_CRESCIMENTO_DEFAULT,
  REALIZADO_HISTORICO_DEFAULT,
} from "@/lib/premissas/matriz-defaults";
import {
  agregarLinhasMatriz,
  calcularRealizadoVsProjetado,
  type LinhaRealizadoProjetado,
} from "@/lib/realizado/projecao";
import { RealizadoClient } from "@/components/realizado/realizado-client";
import { RealizadoEmpty } from "@/components/realizado/realizado-empty";

export const metadata = {
  title: "Forecast · V4 GTM OS",
};

export const dynamic = "force-dynamic";

/**
 * Calcula a projeção de cada unidade visível pela Matriz usando o seu próprio
 * `horizonteAtual` e os horizontes (P1) salvos no setup. A soma mês a mês é
 * a proxy da Matriz — quando uma unidade ainda não preencheu o setup, ela
 * contribui com zeros.
 */
async function projetarLinhasDaMatriz(
  unidades: Organization[],
): Promise<{ linhas: LinhaRealizadoProjetado[]; unitCount: number }> {
  const setups = await getUnitSetupsByOrgIds(unidades.map((o) => o.id));
  const conjuntos = unidades.map((org, i) => {
    const setup = setups[i]!;
    const realizado = setup.realizadoHistorico ?? REALIZADO_HISTORICO_DEFAULT;
    const horizontes = setup.horizontes ?? HORIZONTE_CRESCIMENTO_DEFAULT;
    return calcularRealizadoVsProjetado(realizado, horizontes, org.horizonteAtual, {
      dataInicio: org.dataInicio,
    });
  });
  return { linhas: agregarLinhasMatriz(conjuntos), unitCount: conjuntos.length };
}

export default async function RealizadoPage() {
  const session = await requireAuth();
  const actingAsMatriz = session.actingMode === "matriz";

  if (actingAsMatriz) {
    const unidades = session.availableOrganizations.filter(
      (o) => o.type === "unidade",
    );
    if (unidades.length === 0) {
      return <RealizadoEmpty mode="matriz-sem-unidades" />;
    }
    const { linhas, unitCount } = await projetarLinhasDaMatriz(unidades);
    return (
      <RealizadoClient
        mode="matriz"
        organizationName="Consolidado da rede"
        linhasMatriz={linhas}
        unitCount={unitCount}
      />
    );
  }

  const unitOrg =
    session.activeOrganization ??
    session.availableOrganizations.find((o) => o.type === "unidade") ??
    null;
  if (!unitOrg) {
    return <RealizadoEmpty mode="unidade-sem-org" />;
  }

  const setup = await getUnitSetup(unitOrg.id);
  const realizado = setup.realizadoHistorico ?? REALIZADO_HISTORICO_DEFAULT;
  const horizontes = setup.horizontes ?? HORIZONTE_CRESCIMENTO_DEFAULT;

  return (
    <RealizadoClient
      mode="unidade"
      organizationId={unitOrg.id}
      organizationName={unitOrg.name}
      initialValues={realizado}
      horizontes={horizontes}
      horizonteAtual={unitOrg.horizonteAtual}
      dataInicio={unitOrg.dataInicio}
    />
  );
}
