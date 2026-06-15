"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { WizardFooter } from "./wizard-footer";
import { TimeCapacidade } from "@/components/premissas/time-capacidade";
import {
  CAPACIDADE_OPTIONS,
  type MetricaOperacional,
  type TimeComercialMembro,
} from "@/lib/premissas/matriz-defaults";

type Props = {
  organizationId: string;
  initialTeam: TimeComercialMembro[];
  initialMetrics: MetricaOperacional[];
  metricsMatriz: MetricaOperacional[];
  fromMatriz: boolean;
};

/** Normaliza linhas vindas de storage com shape antigo (sem email/capacidadePct). */
function normalizeMembro(r: Partial<TimeComercialMembro> & Record<string, unknown>): TimeComercialMembro {
  return {
    email: typeof r.email === "string" ? r.email : "",
    cargo: typeof r.cargo === "string" ? r.cargo : "",
    salario: typeof r.salario === "number" ? r.salario : 0,
    comissaoPct: typeof r.comissaoPct === "number" ? r.comissaoPct : 0,
    capacidadePct:
      typeof r.capacidadePct === "number" &&
      (CAPACIDADE_OPTIONS as readonly number[]).includes(r.capacidadePct)
        ? r.capacidadePct
        : 100,
  };
}

async function patchStep(orgId: string, step: string, data: unknown): Promise<string | null> {
  const res = await fetch(`/api/units/${orgId}/setup`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step, data }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return body.error ?? "Não foi possível salvar.";
  }
  return null;
}

/**
 * Passo fundido do wizard — Time Comercial + Capacidade Operacional num só.
 * Persiste os dois blocos (`time-comercial` e `metricas-operacionais`) ao
 * continuar; a UI (tabelas + cards ao vivo) vem do `TimeCapacidade` compartilhado.
 */
export function StepTimeCapacidade({
  organizationId,
  initialTeam,
  initialMetrics,
  metricsMatriz,
  fromMatriz,
}: Props) {
  const router = useRouter();
  const [team, setTeam] = useState<TimeComercialMembro[]>(() => initialTeam.map(normalizeMembro));
  const [metrics, setMetrics] = useState<MetricaOperacional[]>(initialMetrics);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const errTeam = await patchStep(organizationId, "time-comercial", team);
      if (errTeam) {
        setError(errTeam);
        return;
      }
      const errMetrics = await patchStep(organizationId, "metricas-operacionais", metrics);
      if (errMetrics) {
        setError(errMetrics);
        return;
      }
      router.push("/iniciar/tiers-receita");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">2 · Time &amp; Capacidade</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Cadastre o time comercial e os parâmetros de capacidade operacional de cada cargo. Os cards
          abaixo mostram a capacidade consolidada por posição em tempo real.
        </p>
      </div>

      <div className="mb-4 rounded border border-info/30 bg-info/5 px-3 py-2 flex items-center gap-2 text-xs text-foreground">
        <Info className="h-3.5 w-3.5 text-info shrink-0" />
        <span>
          Valores pré-preenchidos vêm das <strong>premissas da Matriz</strong>.
          {fromMatriz
            ? " Ajuste para a realidade da sua unidade — a premissa da Matriz não é alterada."
            : " Ao alterar, o badge ao lado do campo mostra o quanto você se afastou da premissa."}
        </span>
      </div>

      <TimeCapacidade
        team={team}
        metrics={metrics}
        onTeamChange={setTeam}
        onMetricsChange={setMetrics}
        metricsMatriz={metricsMatriz}
        cacContext={null}
      />

      <WizardFooter
        onBack={() => router.push("/iniciar/horizontes")}
        onContinue={handleContinue}
        saving={saving}
        error={error}
      />
    </>
  );
}
