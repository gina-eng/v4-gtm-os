import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/current-user";
import { getStepValues, type ConversoesOutboundData } from "@/db/repositories/unit-setup";
import { StepConversoesOutbound } from "@/components/iniciar/step-conversoes-outbound";

export const dynamic = "force-dynamic";

export default async function ConversoesOutboundPage() {
  const session = await requireAuth();
  if (!session.activeOrganization) redirect("/");

  const { values, matrizDefault, fromMatriz } = await getStepValues(
    session.activeOrganization.id,
    "conversoes-outbound",
  );

  return (
    <StepConversoesOutbound
      organizationId={session.activeOrganization.id}
      initial={values as ConversoesOutboundData}
      matriz={matrizDefault as ConversoesOutboundData}
      fromMatriz={fromMatriz}
    />
  );
}
