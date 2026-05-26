import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/current-user";
import { getStepValues } from "@/db/repositories/unit-setup";
import { StepTimeComercial } from "@/components/iniciar/step-time-comercial";
import type {
  MetricaOperacional,
  TimeComercialMembro,
} from "@/lib/premissas/matriz-defaults";

export const dynamic = "force-dynamic";

export default async function TimeComercialPage() {
  const session = await requireAuth();
  if (!session.activeOrganization) redirect("/");

  const orgId = session.activeOrganization.id;
  const [time, metricas] = await Promise.all([
    getStepValues(orgId, "time-comercial"),
    getStepValues(orgId, "metricas-operacionais"),
  ]);

  return (
    <StepTimeComercial
      organizationId={orgId}
      initialValues={time.values as TimeComercialMembro[]}
      fromMatriz={time.fromMatriz}
      metricasOperacionais={metricas.values as MetricaOperacional[]}
    />
  );
}
