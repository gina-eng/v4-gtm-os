import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, ArrowRight } from "lucide-react";
import { requireAuth } from "@/lib/auth/current-user";
import { getUnitSetup, SETUP_STEPS } from "@/db/repositories/unit-setup";

export const dynamic = "force-dynamic";

export default async function ResumoPage() {
  const session = await requireAuth();
  if (!session.activeOrganization) redirect("/");

  const setup = await getUnitSetup(session.activeOrganization.id);
  const completed = new Set(setup.completedSteps);
  const allDone = SETUP_STEPS.every((s) => completed.has(s));

  return (
    <>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">Resumo do setup</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {allDone
            ? "Tudo pronto! Use a lista ao lado para revisar qualquer passo ou siga pra usar o sistema."
            : "Você ainda tem passos pendentes. Use a lista ao lado para terminar o setup inicial."}
        </p>
      </div>

      {allDone && (
        <div className="rounded border border-success/40 bg-success/5 px-4 py-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-success/15 text-success flex items-center justify-center">
            <Check className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-foreground">Setup concluído!</div>
            <div className="text-xs text-muted-foreground">
              Concluído em{" "}
              {setup.completedAt
                ? new Date(setup.completedAt).toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                  })
                : "—"}
              . Você pode continuar editando seus valores a qualquer momento.
            </div>
          </div>
          <Link
            href="/premissas"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded text-sm font-medium bg-accent text-accent-foreground hover:opacity-90"
          >
            Ir para Premissas
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </>
  );
}
