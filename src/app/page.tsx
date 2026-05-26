import Link from "next/link";
import { ArrowRight, Check, Info, Rocket } from "lucide-react";
import { requireAuth } from "@/lib/auth/current-user";
import {
  getUnitSetup,
  SETUP_STEPS,
  SETUP_STEP_LABEL,
} from "@/db/repositories/unit-setup";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await requireAuth();

  // Apenas usuário atuando como unidade vê o hero do wizard. Matriz consolidada
  // continua vendo a tela em branco original (até essa ter conteúdo próprio).
  if (session.actingMode === "unidade" && session.activeOrganization) {
    const setup = await getUnitSetup(session.activeOrganization.id);
    const completedCount = setup.completedSteps.length;
    const totalSteps = SETUP_STEPS.length;
    const allDone = completedCount === totalSteps;

    return <UnitHome name={session.activeOrganization.name} setup={{ completedCount, totalSteps, allDone, completedSteps: setup.completedSteps }} />;
  }

  return <MatrizHome />;
}

function UnitHome({
  name,
  setup,
}: {
  name: string;
  setup: {
    completedCount: number;
    totalSteps: number;
    allDone: boolean;
    completedSteps: readonly string[];
  };
}) {
  if (setup.allDone) {
    return (
      <>
        <div className="flex items-center justify-between mb-4 gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-1">
              {name}
            </div>
            <h1 className="text-xl font-semibold text-foreground">Bem-vindo de volta</h1>
          </div>
        </div>

        <section className="rounded border border-success/40 bg-success/5 px-5 py-4 flex items-center gap-4 mb-5">
          <div className="h-10 w-10 rounded-full bg-success/15 text-success flex items-center justify-center shrink-0">
            <Check className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-foreground">Setup inicial concluído</div>
            <div className="text-xs text-muted-foreground">
              Seus 4 passos estão preenchidos. Você pode revisar a qualquer momento.
            </div>
          </div>
          <Link
            href="/iniciar/resumo"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded text-sm border border-border hover:bg-muted"
          >
            Ver resumo
          </Link>
        </section>

        <div className="bg-card border border-border rounded p-4">
          <p className="text-sm text-muted-foreground">
            Próximas telas chegam aqui. Por enquanto, use o menu lateral para acessar Premissas e demais áreas.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-1">
          {name}
        </div>
        <h1 className="text-xl font-semibold text-foreground">Bem-vindo ao V4 GTM OS</h1>
      </div>

      <section className="rounded-lg border border-accent/30 bg-gradient-to-br from-accent/5 via-card to-card p-6 mb-5">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 shrink-0 rounded-full bg-accent/15 text-accent flex items-center justify-center">
            <Rocket className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-foreground mb-1">
              Vamos configurar sua unidade
            </h2>
            <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
              Em 4 passos guiados, você vai cadastrar seu time, métricas operacionais, tiers de cliente e estratégia de leads. Cada passo já vem pré-preenchido com as premissas da Matriz — você só ajusta o que for diferente.
            </p>

            <div className="flex items-center gap-2 mb-4">
              {SETUP_STEPS.map((step) => {
                const done = setup.completedSteps.includes(step);
                return (
                  <span
                    key={step}
                    title={SETUP_STEP_LABEL[step]}
                    className={`h-1.5 flex-1 rounded-full ${
                      done ? "bg-success" : "bg-muted"
                    }`}
                  />
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              {setup.completedCount === 0
                ? "Nenhum passo iniciado ainda."
                : `${setup.completedCount} de ${setup.totalSteps} passos concluídos.`}
            </p>

            <Link
              href="/iniciar"
              className="inline-flex items-center gap-2 h-10 px-5 rounded text-sm font-medium bg-accent text-accent-foreground hover:opacity-90"
            >
              {setup.completedCount === 0 ? "Clique aqui para iniciar" : "Continuar setup"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <div className="rounded border border-border bg-card px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5" />
        <span>
          Você pode pausar o setup a qualquer momento — seu progresso fica salvo automaticamente.
        </span>
      </div>
    </>
  );
}

function MatrizHome() {
  return (
    <>
      <div className="flex items-center justify-between mb-4 gap-4">
        <h1 className="text-xl font-semibold text-foreground">Início</h1>
      </div>

      <div className="bg-card border border-border rounded p-4">
        <p className="text-sm text-muted-foreground">
          Visão consolidada da rede. Próximas iterações trarão KPIs agregados e indicadores das unidades.
        </p>
      </div>
    </>
  );
}
