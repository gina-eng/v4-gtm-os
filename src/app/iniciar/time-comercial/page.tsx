import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/current-user";
import { getTimeCapacidadeSetup } from "@/db/repositories/unit-setup";
import { StepTimeCapacidade } from "@/components/iniciar/step-time-capacidade";

export const dynamic = "force-dynamic";

export default async function TimeCapacidadePage() {
  const session = await requireAuth();
  if (!session.activeOrganization) redirect("/");

  const orgId = session.activeOrganization.id;
  const tc = await getTimeCapacidadeSetup(orgId);

  return (
    <StepTimeCapacidade
      organizationId={orgId}
      initialTeam={tc.team}
      initialMetrics={tc.metrics}
      metricsMatriz={tc.metricsMatriz}
      fromMatriz={tc.teamFromMatriz && tc.metricsFromMatriz}
    />
  );
}
