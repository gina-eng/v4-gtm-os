import { listOrganizations } from "@/db/repositories/organizations";
import { getUnitSetupsByOrgIds, SETUP_STEPS } from "@/db/repositories/unit-setup";
import { requireAuth } from "@/lib/auth/current-user";
import { UnidadesClient } from "@/components/unidades/unidades-client";

export const dynamic = "force-dynamic";

export default async function UnidadesPage() {
  const session = await requireAuth();
  const all = await listOrganizations();

  // Scoping por actingMode:
  // - matriz: vê todas as orgs (visibilidade total da rede)
  // - unidade: vê só a unidade ativa (inclui matriz "impersonando" uma franquia)
  let scoped;
  if (session.actingMode === "unidade" && session.activeOrganization) {
    const activeId = session.activeOrganization.id;
    scoped = all.filter((o) => o.id === activeId);
  } else if (session.isMatrizUser) {
    scoped = all;
  } else {
    scoped = all.filter((o) => session.memberships.some((m) => m.organizationId === o.id));
  }

  // % de preenchimento do modelo (wizard /iniciar): nº de steps concluídos
  // sobre total de SETUP_STEPS. Só faz sentido pra unidades — matriz mostra "—".
  const totalSteps = SETUP_STEPS.length;
  const unitIds = scoped.filter((o) => o.type === "unidade").map((o) => o.id);
  const setups = await getUnitSetupsByOrgIds(unitIds);
  const setupCompletionByOrgId = Object.fromEntries(
    setups.map((s) => [
      s.organizationId,
      Math.round((s.completedSteps.length / totalSteps) * 100),
    ]),
  );

  return (
    <UnidadesClient
      initialUnits={scoped}
      setupCompletionByOrgId={setupCompletionByOrgId}
    />
  );
}
