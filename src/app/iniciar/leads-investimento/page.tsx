import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/current-user";
import { getStepValues } from "@/db/repositories/unit-setup";
import { StepLeadsInvestimento } from "@/components/iniciar/step-leads-investimento";
import type {
  DistMercado,
  InvestimentoMidia,
} from "@/lib/premissas/matriz-defaults";

export const dynamic = "force-dynamic";

export default async function LeadsInvestimentoPage() {
  const session = await requireAuth();
  if (!session.activeOrganization) redirect("/");

  const orgId = session.activeOrganization.id;
  const leadsInv = await getStepValues(orgId, "leads-investimento");

  const v = leadsInv.values as { distMercado: DistMercado[]; investimentoMidia: InvestimentoMidia[] };
  const m = leadsInv.matrizDefault as { distMercado: DistMercado[]; investimentoMidia: InvestimentoMidia[] };

  return (
    <StepLeadsInvestimento
      organizationId={orgId}
      horizonteAtual={session.activeOrganization.horizonteAtual}
      initialDist={v.distMercado}
      initialInvest={v.investimentoMidia}
      matrizDist={m.distMercado}
      matrizInvest={m.investimentoMidia}
      fromMatriz={leadsInv.fromMatriz}
    />
  );
}
