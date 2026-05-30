"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { PercentCell } from "@/components/premissas/editable-cell";
import { FieldHelp } from "@/components/ui/field-help";
import { WizardFooter } from "./wizard-footer";
import type { ConversaoOutbound } from "@/lib/premissas/matriz-defaults";
import type { ConversoesOutboundData } from "@/lib/unit-setup-types";

type Props = {
  organizationId: string;
  initial: ConversoesOutboundData;
  matriz: ConversoesOutboundData;
  fromMatriz: boolean;
};

type CanalKey = keyof ConversoesOutboundData;

const CANAIS: Array<{ key: CanalKey; title: string }> = [
  { key: "indicacao", title: "P11 — Outbound: Indicação" },
  { key: "recovery", title: "P12 — Outbound: Recovery" },
  { key: "recomendacao", title: "P13 — Outbound: Recomendação" },
  { key: "prospeccao", title: "P14 — Outbound: Prospecção Ativa" },
];

export function StepConversoesOutbound({ organizationId, initial, matriz, fromMatriz }: Props) {
  const router = useRouter();
  const [data, setData] = useState<ConversoesOutboundData>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(canal: CanalKey, idx: number, k: keyof ConversaoOutbound, v: number) {
    setData((prev) => ({
      ...prev,
      [canal]: prev[canal].map((r, i) => (i === idx ? { ...r, [k]: v } : r)),
    }));
  }

  async function handleContinue() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/units/${organizationId}/setup`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "conversoes-outbound", data }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível salvar.");
        return;
      }
      router.push("/iniciar/mix-subcanais");
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
        <h2 className="text-lg font-semibold text-foreground">7 · Conversões Outbound</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Funis outbound (Lead → SQL → SAL → Won — sem MQL) dos 5 subcanais: Indicação, Eventos, Recovery, Recomendação e Prospecção Ativa.
        </p>
      </div>

      <div className="mb-4 rounded border border-info/30 bg-info/5 px-3 py-2 flex items-center gap-2 text-xs text-foreground">
        <Info className="h-3.5 w-3.5 text-info shrink-0" />
        <span>
          Valores pré-preenchidos vêm das <strong>premissas da Matriz</strong>.
          {fromMatriz
            ? " Ajuste para a realidade da sua unidade — campos que a matriz travou (0%) aparecem como Não disponível."
            : " O badge ao lado do campo mostra o delta vs. a premissa da Matriz."}
        </span>
      </div>

      {CANAIS.map(({ key, title }) => (
        <OutboundSection
          key={key}
          title={title}
          rows={data[key]}
          matriz={matriz[key]}
          onPatch={(idx, k, v) => patch(key, idx, k, v)}
        />
      ))}

      <WizardFooter
        onBack={() => router.push("/iniciar/conversoes-inbound")}
        onContinue={handleContinue}
        saving={saving}
        error={error}
      />
    </>
  );
}

function OutboundSection({
  title,
  rows,
  matriz,
  onPatch,
}: {
  title: string;
  rows: ConversaoOutbound[];
  matriz: ConversaoOutbound[];
  onPatch: (idx: number, k: keyof ConversaoOutbound, v: number) => void;
}) {
  return (
    <section className="rounded border border-border bg-card overflow-hidden mb-5">
      <header className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <span aria-hidden className="inline-block w-0.5 h-3.5 bg-accent rounded-sm" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">{title}</h3>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-2 py-1.5 text-[10px] uppercase tracking-wider">Tier</th>
              <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                <span className="inline-flex items-center gap-1 justify-end">
                  CR1 L→SQL
                  <FieldHelp text="% de Leads que pulam direto para SQL (sem etapa MQL)." position="bottom" />
                </span>
              </th>
              <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                <span className="inline-flex items-center gap-1 justify-end">
                  CR3 SQL→SAL
                  <FieldHelp text="% de SQLs que viram SAL (reunião realizada)." position="bottom" />
                </span>
              </th>
              <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                <span className="inline-flex items-center gap-1 justify-end">
                  CR4 SAL→Won
                  <FieldHelp text="% de SALs que fecham deal (Won)." position="bottom" />
                </span>
              </th>
              <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider border-l border-table-header-foreground/20">
                <span className="inline-flex items-center gap-1 justify-end">
                  CR6 At→Ren
                  <FieldHelp text="Pós-venda: % de Ativos que renovam contrato." position="bottom" />
                </span>
              </th>
              <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                <span className="inline-flex items-center gap-1 justify-end">
                  CR7 Ren→Exp
                  <FieldHelp text="Pós-venda: % de Renovações que viram Expansão." position="bottom" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr
                key={r.tier}
                className={`${idx % 2 === 0 ? "bg-card" : "bg-muted/30"} border-b border-border/60`}
              >
                <td className="px-2 py-2 text-xs font-medium text-accent">{r.tier}</td>
                {(["cr1", "cr3", "cr4"] as const).map((key) => (
                  <td key={key} className="px-2 py-2 text-xs text-right">
                    <PercentCell
                      isEditing
                      value={r[key]}
                      matrizValue={matriz[idx]?.[key]}
                      onChange={(v) => onPatch(idx, key, v)}
                      digits={0}
                      lockableZero
                    />
                  </td>
                ))}
                <td className="px-2 py-2 text-xs text-right border-l border-border/60">
                  <PercentCell
                    isEditing
                    value={r.cr6}
                    matrizValue={matriz[idx]?.cr6}
                    onChange={(v) => onPatch(idx, "cr6", v)}
                    digits={0}
                    lockableZero
                  />
                </td>
                <td className="px-2 py-2 text-xs text-right">
                  <PercentCell
                    isEditing
                    value={r.cr7}
                    matrizValue={matriz[idx]?.cr7}
                    onChange={(v) => onPatch(idx, "cr7", v)}
                    digits={0}
                    lockableZero
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
