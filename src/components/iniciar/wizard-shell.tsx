"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Circle, CircleDashed } from "lucide-react";
import { SETUP_STEPS, SETUP_STEP_LABEL, type SetupStep } from "@/lib/unit-setup-types";

type Props = {
  unitName: string;
  completedSteps: SetupStep[];
  children: React.ReactNode;
};

/**
 * Casca do wizard /iniciar — sidebar de passos à esquerda, conteúdo à direita.
 * Quem renderiza isso é o layout do segmento /iniciar (server component).
 */
export function WizardShell({ unitName, completedSteps, children }: Props) {
  const pathname = usePathname();
  const currentSlug = pathname.split("/iniciar/")[1]?.split("/")[0] ?? "";
  const completedSet = new Set(completedSteps);

  return (
    <div className="flex gap-6 h-full min-h-0">
      {/* ============ SIDEBAR ============ */}
      <aside className="w-72 shrink-0 self-start sticky top-0">
        <div className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-1">
          {unitName} · SETUP INICIAL
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-1">Vamos configurar sua unidade</h1>
        <p className="text-xs text-muted-foreground mb-5">
          Cada passo já vem pré-preenchido com as premissas da Matriz. Ajuste o que for diferente na sua unidade e clique em <em>Salvar e continuar</em>.
        </p>

        <ol className="flex flex-col gap-1">
          {SETUP_STEPS.map((step, idx) => {
            const done = completedSet.has(step);
            const isActive = currentSlug === step;
            const isResumo = false;
            return (
              <li key={step}>
                <Link
                  href={`/iniciar/${step}`}
                  className={`flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                    isActive
                      ? "bg-accent/10 text-accent border-l-2 border-accent"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground border-l-2 border-transparent"
                  }`}
                  aria-current={isActive ? "step" : undefined}
                >
                  <span
                    className={`h-5 w-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-semibold ${
                      done
                        ? "bg-success text-success-foreground"
                        : isActive
                          ? "bg-accent text-accent-foreground"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {done ? <Check className="h-3 w-3" /> : idx + 1}
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className={`text-xs font-medium leading-tight ${isActive ? "" : ""}`}>
                      {SETUP_STEP_LABEL[step]}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {done ? "Concluído" : isActive ? "Em andamento" : "Pendente"}
                    </span>
                  </div>
                </Link>
                {isResumo && null}
              </li>
            );
          })}

          {/* Resumo */}
          <li className="mt-2 pt-2 border-t border-border">
            <Link
              href="/iniciar/resumo"
              className={`flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                currentSlug === "resumo"
                  ? "bg-accent/10 text-accent border-l-2 border-accent"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground border-l-2 border-transparent"
              }`}
            >
              <span
                className={`h-5 w-5 shrink-0 rounded-full flex items-center justify-center ${
                  completedSet.size === SETUP_STEPS.length
                    ? "bg-success text-success-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {completedSet.size === SETUP_STEPS.length ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <CircleDashed className="h-3 w-3" />
                )}
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium leading-tight">Resumo & finalizar</span>
                <span className="text-[10px] text-muted-foreground">
                  {completedSet.size}/{SETUP_STEPS.length} passos
                </span>
              </div>
            </Link>
          </li>
        </ol>
      </aside>

      {/* ============ CONTEÚDO ============ */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

/** Ícone de fallback caso seja necessário (não usado por enquanto). */
export function StepCircle() {
  return <Circle className="h-3 w-3" />;
}
