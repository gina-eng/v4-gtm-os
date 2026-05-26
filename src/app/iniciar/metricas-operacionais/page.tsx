import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/current-user";
import { getStepValues } from "@/db/repositories/unit-setup";
import { StepMetricasOperacionais } from "@/components/iniciar/step-metricas-operacionais";
import type { MetricaOperacional } from "@/lib/premissas/matriz-defaults";

export const dynamic = "force-dynamic";

export default async function MetricasOperacionaisPage() {
  const session = await requireAuth();
  if (!session.activeOrganization) redirect("/");

  const { values, matrizDefault, fromMatriz } = await getStepValues(
    session.activeOrganization.id,
    "metricas-operacionais",
  );

  return (
    <StepMetricasOperacionais
      organizationId={session.activeOrganization.id}
      initialValues={values as MetricaOperacional[]}
      matrizDefault={matrizDefault as MetricaOperacional[]}
      fromMatriz={fromMatriz}
    />
  );
}
