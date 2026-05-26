import { requireAuth } from "@/lib/auth/current-user";
import { getOrganizationById } from "@/db/repositories/organizations";
import { getUnitSetup, getStepValues } from "@/db/repositories/unit-setup";
import {
  HORIZONTE_CRESCIMENTO_DEFAULT,
  REALIZADO_HISTORICO_DEFAULT,
  type HorizonteCrescimento,
  type RealizadoMensal,
} from "@/lib/premissas/matriz-defaults";
import {
  agregarLinhasMatriz,
  calcularRealizadoVsProjetado,
  type LinhaRealizadoProjetado,
} from "@/lib/realizado/projecao";
import { RealizadoClient } from "@/components/realizado/realizado-client";
import { RealizadoEmpty } from "@/components/realizado/realizado-empty";

export const metadata = {
  title: "Realizado vs Projetado · V4 GTM OS",
};

export const dynamic = "force-dynamic";

/**
 * Calcula a projeção de cada unidade visível pela Matriz usando o seu próprio
 * `horizonteAtual` e os horizontes (P1) salvos no setup. A soma mês a mês é
 * a proxy da Matriz — quando uma unidade ainda não preencheu o setup, ela
 * contribui com zeros.
 */
async function projetarLinhasDaMatriz(
  unitIds: string[],
): Promise<{ linhas: LinhaRealizadoProjetado[]; unitCount: number }> {
  const conjuntos: LinhaRealizadoProjetado[][] = [];
  for (const id of unitIds) {
    const org = await getOrganizationById(id);
    if (!org || org.type !== "unidade") continue;
    const setup = await getUnitSetup(id);
    const realizado = setup.realizadoHistorico ?? REALIZADO_HISTORICO_DEFAULT;
    const horizontes = setup.horizontes ?? HORIZONTE_CRESCIMENTO_DEFAULT;
    conjuntos.push(
      calcularRealizadoVsProjetado(realizado, horizontes, org.horizonteAtual, {
        dataInicio: org.dataInicio,
      }),
    );
  }
  return { linhas: agregarLinhasMatriz(conjuntos), unitCount: conjuntos.length };
}

export default async function RealizadoPage() {
  const session = await requireAuth();
  const actingAsMatriz = session.actingMode === "matriz";

  if (actingAsMatriz) {
    const unitIds = session.availableOrganizations
      .filter((o) => o.type === "unidade")
      .map((o) => o.id);
    if (unitIds.length === 0) {
      return <RealizadoEmpty mode="matriz-sem-unidades" />;
    }
    const { linhas, unitCount } = await projetarLinhasDaMatriz(unitIds);
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

  const [realizado, horizontes] = await Promise.all([
    getStepValues(unitOrg.id, "realizado-historico"),
    getStepValues(unitOrg.id, "horizontes"),
  ]);

  return (
    <RealizadoClient
      mode="unidade"
      organizationId={unitOrg.id}
      organizationName={unitOrg.name}
      initialValues={realizado.values as RealizadoMensal[]}
      horizontes={horizontes.values as HorizonteCrescimento[]}
      horizonteAtual={unitOrg.horizonteAtual}
      dataInicio={unitOrg.dataInicio}
    />
  );
}
