import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/current-user";
import { getStepValues } from "@/db/repositories/unit-setup";
import { StepLeadsInvestimento } from "@/components/iniciar/step-leads-investimento";
import type {
  DistMercado,
  InvestimentoMidia,
  ReceitaProduto,
  TierCliente,
} from "@/lib/premissas/matriz-defaults";

export const dynamic = "force-dynamic";

export default async function LeadsInvestimentoPage() {
  const session = await requireAuth();
  if (!session.activeOrganization) redirect("/");

  const orgId = session.activeOrganization.id;
  const [leadsInv, tiersReceita] = await Promise.all([
    getStepValues(orgId, "leads-investimento"),
    getStepValues(orgId, "tiers-receita"),
  ]);

  const v = leadsInv.values as { distMercado: DistMercado[]; investimentoMidia: InvestimentoMidia[] };
  const m = leadsInv.matrizDefault as { distMercado: DistMercado[]; investimentoMidia: InvestimentoMidia[] };
  const tr = tiersReceita.values as { tiers: TierCliente[]; produtos: ReceitaProduto[] };

  return (
    <StepLeadsInvestimento
      organizationId={orgId}
      horizonteAtual={session.activeOrganization.horizonteAtual}
      initialDist={v.distMercado}
      initialInvest={v.investimentoMidia}
      matrizDist={m.distMercado}
      matrizInvest={m.investimentoMidia}
      tiers={tr.tiers}
      fromMatriz={leadsInv.fromMatriz}
    />
  );
}
