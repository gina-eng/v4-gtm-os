import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/current-user";
import { getStepValues } from "@/db/repositories/unit-setup";
import { StepTiersReceita } from "@/components/iniciar/step-tiers-receita";
import type { ReceitaProduto, TierCliente } from "@/lib/premissas/matriz-defaults";

export const dynamic = "force-dynamic";

export default async function TiersReceitaPage() {
  const session = await requireAuth();
  if (!session.activeOrganization) redirect("/");

  const { values, matrizDefault, fromMatriz } = await getStepValues(
    session.activeOrganization.id,
    "tiers-receita",
  );
  const v = values as { tiers: TierCliente[]; produtos: ReceitaProduto[] };
  const m = matrizDefault as { tiers: TierCliente[]; produtos: ReceitaProduto[] };

  return (
    <StepTiersReceita
      organizationId={session.activeOrganization.id}
      initialProdutos={v.produtos}
      matrizTiers={m.tiers}
      matrizProdutos={m.produtos}
      fromMatriz={fromMatriz}
    />
  );
}
