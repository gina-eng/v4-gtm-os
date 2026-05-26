import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/current-user";
import { getUnitSetup } from "@/db/repositories/unit-setup";
import { WizardShell } from "@/components/iniciar/wizard-shell";

export const dynamic = "force-dynamic";

/**
 * Layout do wizard /iniciar.
 *
 * Regras de acesso:
 * - Usuário precisa estar atuando como unidade (actingMode = "unidade")
 *   E ter uma organização ativa do tipo "unidade".
 * - Matriz "consolidado" (sem org ativa ou ativa=matriz) é redirecionada pra Home.
 */
export default async function IniciarLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();

  if (session.actingMode !== "unidade" || !session.activeOrganization) {
    // Matriz sem unidade ativa não tem o que fazer aqui.
    redirect("/");
  }

  if (session.activeOrganization.type !== "unidade") {
    notFound();
  }

  const setup = await getUnitSetup(session.activeOrganization.id);

  return (
    <WizardShell
      unitName={session.activeOrganization.name}
      completedSteps={setup.completedSteps}
    >
      {children}
    </WizardShell>
  );
}
