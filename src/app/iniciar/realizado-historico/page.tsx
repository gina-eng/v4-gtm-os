import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/current-user";
import { getStepValues } from "@/db/repositories/unit-setup";
import { StepRealizadoHistorico } from "@/components/iniciar/step-realizado-historico";
import type {
  HorizonteCrescimento,
  RealizadoMensal,
} from "@/lib/premissas/matriz-defaults";

export const dynamic = "force-dynamic";

export default async function RealizadoHistoricoPage() {
  const session = await requireAuth();
  if (!session.activeOrganization) redirect("/");

  const orgId = session.activeOrganization.id;
  const [realizado, horizontes] = await Promise.all([
    getStepValues(orgId, "realizado-historico"),
    getStepValues(orgId, "horizontes"),
  ]);

  return (
    <StepRealizadoHistorico
      organizationId={orgId}
      initialValues={realizado.values as RealizadoMensal[]}
      horizontes={horizontes.values as HorizonteCrescimento[]}
      horizonteAtual={session.activeOrganization.horizonteAtual}
      dataInicio={session.activeOrganization.dataInicio}
    />
  );
}
