"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { PercentCell } from "@/components/premissas/editable-cell";
import { formatPercent } from "@/components/premissas/format";
import { WizardFooter } from "./wizard-footer";
import type { MixOutboundHorizonte } from "@/lib/premissas/matriz-defaults";

type Props = {
  organizationId: string;
  initial: MixOutboundHorizonte[];
  matriz: MixOutboundHorizonte[];
  fromMatriz: boolean;
};

const COLS = ["indicacao", "recovery", "recomendacao", "prospeccao"] as const;
type ColKey = (typeof COLS)[number];

const COL_LABEL: Record<ColKey, string> = {
  indicacao: "Indicação",
  recovery: "Recovery",
  recomendacao: "Recomendação",
  prospeccao: "Prospecção",
};

function mixTotal(r: MixOutboundHorizonte): number {
  return r.indicacao + r.recovery + r.recomendacao + r.prospeccao;
}

export function StepMixSubcanais({ organizationId, initial, matriz, fromMatriz }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<MixOutboundHorizonte[]>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(idx: number, k: ColKey, v: number) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [k]: v } : r)));
  }

  async function handleContinue() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/units/${organizationId}/setup`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "mix-subcanais", data: rows }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível salvar.");
        return;
      }
      // Último passo do setup (a etapa "Realizado Histórico" foi removida — o
      // realizado agora vem do extrato do time de dados). Segue pro resumo.
      router.push("/iniciar/resumo");
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
        <h2 className="text-lg font-semibold text-foreground">8 · Mix Subcanais Outbound</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Distribuição dos leads outbound entre os 5 subcanais em cada horizonte. Cada linha deve totalizar 100%.
        </p>
      </div>

      <div className="mb-4 rounded border border-info/30 bg-info/5 px-3 py-2 flex items-center gap-2 text-xs text-foreground">
        <Info className="h-3.5 w-3.5 text-info shrink-0" />
        <span>
          Valores pré-preenchidos vêm das <strong>premissas da Matriz</strong>.
          {fromMatriz
            ? " Ajuste para a realidade da sua unidade — subcanais que a matriz travou (0%) aparecem como Não disponível."
            : " O badge ao lado do campo mostra o delta vs. a premissa da Matriz."}
        </span>
      </div>

      <section className="rounded border border-border bg-card overflow-hidden">
        <header className="px-4 py-2.5 border-b border-border flex items-center gap-2">
          <span aria-hidden className="inline-block w-0.5 h-3.5 bg-accent rounded-sm" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Mix de Subcanais Outbound por Horizonte
          </h3>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  Horizonte
                </th>
                {COLS.map((c) => (
                  <th
                    key={c}
                    className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider"
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      {COL_LABEL[c]}
                    </span>
                  </th>
                ))}
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Total
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const total = mixTotal(r);
                const totalOk = Math.abs(total - 100) < 0.5;
                return (
                  <tr
                    key={r.h}
                    className={`${idx % 2 === 0 ? "bg-card" : "bg-muted/30"} border-b border-border/60`}
                  >
                    <td className="px-2 py-2 text-xs font-medium text-accent">{r.h}</td>
                    {COLS.map((c) => (
                      <td key={c} className="px-2 py-2 text-xs text-right">
                        <PercentCell
                          isEditing
                          value={r[c]}
                          matrizValue={matriz[idx]?.[c]}
                          onChange={(v) => patch(idx, c, v)}
                          digits={0}
                          lockableZero
                        />
                      </td>
                    ))}
                    <td
                      className={`px-2 py-2 text-xs text-right tabular-nums font-medium ${
                        totalOk ? "text-success" : "text-destructive"
                      }`}
                    >
                      {formatPercent(total, 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <WizardFooter
        onBack={() => router.push("/iniciar/conversoes-outbound")}
        onContinue={handleContinue}
        saving={saving}
        error={error}
        isLast
      />
    </>
  );
}
