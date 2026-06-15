"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { formatBRL, formatPercent } from "@/components/premissas/format";
import { WizardFooter } from "./wizard-footer";
import type { HorizonteCrescimento } from "@/lib/premissas/matriz-defaults";

type Props = {
  organizationId: string;
  matrizDefault: HorizonteCrescimento[];
  /** Horizonte em que a unidade se encontra hoje, vindo de `organizations.horizonteAtual`. */
  horizonteAtual: HorizonteCrescimento["h"];
};

/**
 * Step 1 — Horizontes de Crescimento (P1).
 *
 * Visão de balizamento — somente leitura. As faixas e prazos são definidos pela
 * Matriz; a unidade apenas confirma e segue. O horizonte atual é destacado para
 * a unidade ter clareza de onde está e o que precisa pra evoluir.
 */
export function StepHorizontes({
  organizationId,
  matrizDefault,
  horizonteAtual,
}: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      // Nada é editável: persiste exatamente o default da Matriz para marcar o
      // step como concluído e manter o repository consistente.
      const res = await fetch(`/api/units/${organizationId}/setup`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "horizontes", data: matrizDefault }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível continuar.");
        return;
      }
      router.push("/iniciar/time-comercial");
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
        <h2 className="text-lg font-semibold text-foreground">1 · Horizontes de Crescimento</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Cada horizonte (H1–H5) é uma fase de maturidade. Esta tela é apenas uma <strong>visão de balizamento</strong> — os valores são definidos pela Matriz.
        </p>
      </div>

      <div className="mb-4 rounded border border-info/30 bg-info/5 px-3 py-2 flex items-center gap-2 text-xs text-foreground">
        <Info className="h-3.5 w-3.5 text-info shrink-0" />
        <span>
          Sua unidade está em <strong className="text-accent">{horizonteAtual}</strong>. Use as faixas abaixo como referência ao preencher os próximos passos.
        </span>
      </div>

      <section className="rounded border border-border bg-card overflow-hidden">
        <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {matrizDefault.map((r) => {
            const isAtual = r.h === horizonteAtual;
            return (
              <div
                key={r.h}
                className={`rounded border ${
                  isAtual
                    ? "border-accent/60 bg-accent/5 ring-1 ring-accent/30"
                    : "border-border bg-card"
                } overflow-hidden flex flex-col`}
              >
                <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between bg-accent text-accent-foreground">
                  <span className="text-sm font-semibold tracking-wide">{r.h}</span>
                  {isAtual && (
                    <span className="text-[8px] uppercase tracking-widest font-semibold bg-accent-foreground text-accent px-1.5 py-0.5 rounded">
                      Atual
                    </span>
                  )}
                </div>
                <dl className="px-3 py-2.5 text-xs flex-1 space-y-2">
                  <ReadField
                    label="Faixa Min"
                  >
                    <span className="tabular-nums">{formatBRL(r.faixaMin)}</span>
                  </ReadField>
                  <ReadField
                    label="Faixa Máx"
                  >
                    <span className="tabular-nums">
                      {r.faixaMax === null ? (
                        <span className="text-muted-foreground">Sem teto</span>
                      ) : (
                        formatBRL(r.faixaMax)
                      )}
                    </span>
                  </ReadField>
                  <ReadField
                    label="Tempo Máx (meses)"
                  >
                    <span className="tabular-nums">
                      {r.tempoMaxMeses === null ? (
                        <span className="text-muted-foreground">Sem prazo</span>
                      ) : (
                        r.tempoMaxMeses
                      )}
                    </span>
                  </ReadField>
                  <ReadField
                    label="Cresc. Mensal"
                  >
                    <span className="inline-flex items-center gap-1 text-success font-medium tabular-nums">
                      {formatPercent(r.crescMensalPct, 1)}
                      <span className="text-success/80">≥</span>
                    </span>
                  </ReadField>
                </dl>
              </div>
            );
          })}
        </div>
        <div className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border bg-muted/20">
          Fórmula do crescimento mensal: <code className="text-foreground">[(Receita atual ÷ anterior) − 1] × 100</code>
        </div>
      </section>

      <WizardFooter
        onContinue={handleContinue}
        continueLabel="Continuar"
        saving={saving}
        error={error}
      />
    </>
  );
}

function ReadField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </dt>
      <dd className="text-xs text-foreground">{children}</dd>
    </div>
  );
}
