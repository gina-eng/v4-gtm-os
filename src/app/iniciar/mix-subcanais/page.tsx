import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/current-user";
import { getStepValues } from "@/db/repositories/unit-setup";
import { StepMixSubcanais } from "@/components/iniciar/step-mix-subcanais";
import type { MixOutboundHorizonte } from "@/lib/premissas/matriz-defaults";

export const dynamic = "force-dynamic";

export default async function MixSubcanaisPage() {
  const session = await requireAuth();
  if (!session.activeOrganization) redirect("/");

  const { values, matrizDefault, fromMatriz } = await getStepValues(
    session.activeOrganization.id,
    "mix-subcanais",
  );

  return (
    <StepMixSubcanais
      organizationId={session.activeOrganization.id}
      initial={values as MixOutboundHorizonte[]}
      matriz={matrizDefault as MixOutboundHorizonte[]}
      fromMatriz={fromMatriz}
    />
  );
}
