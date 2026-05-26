import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/current-user";
import { HORIZONTE_CRESCIMENTO_DEFAULT } from "@/lib/premissas/matriz-defaults";
import { StepHorizontes } from "@/components/iniciar/step-horizontes";

export const dynamic = "force-dynamic";

export default async function HorizontesPage() {
  const session = await requireAuth();
  if (!session.activeOrganization) redirect("/");

  // Step 1 é puramente informativo — sempre exibe os valores da Matriz.
  // Não chamamos getStepValues porque a unidade não personaliza este passo.
  return (
    <StepHorizontes
      organizationId={session.activeOrganization.id}
      matrizDefault={HORIZONTE_CRESCIMENTO_DEFAULT}
      horizonteAtual={session.activeOrganization.horizonteAtual}
    />
  );
}
