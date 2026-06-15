"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { CurrencyCell, PercentCell } from "@/components/premissas/editable-cell";
import { WizardFooter } from "./wizard-footer";
import type {
  ConversaoInbound,
  ConversaoMeetingBroker,
} from "@/lib/premissas/matriz-defaults";

type Props = {
  organizationId: string;
  initialLeadBroker: ConversaoInbound[];
  initialBlackBox: ConversaoInbound[];
  initialMeetingBroker: ConversaoMeetingBroker;
  matrizLeadBroker: ConversaoInbound[];
  matrizBlackBox: ConversaoInbound[];
  matrizMeetingBroker: ConversaoMeetingBroker;
  fromMatriz: boolean;
};

export function StepConversoesInbound({
  organizationId,
  initialLeadBroker,
  initialBlackBox,
  initialMeetingBroker,
  matrizLeadBroker,
  matrizBlackBox,
  matrizMeetingBroker,
  fromMatriz,
}: Props) {
  const router = useRouter();
  const [leadBroker, setLeadBroker] = useState<ConversaoInbound[]>(initialLeadBroker);
  const [blackBox, setBlackBox] = useState<ConversaoInbound[]>(initialBlackBox);
  const [meetingBroker, setMeetingBroker] = useState<ConversaoMeetingBroker>(initialMeetingBroker);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patchLB<K extends keyof ConversaoInbound>(idx: number, k: K, v: ConversaoInbound[K]) {
    setLeadBroker((prev) => prev.map((r, i) => (i === idx ? { ...r, [k]: v } : r)));
  }
  function patchBB<K extends keyof ConversaoInbound>(idx: number, k: K, v: ConversaoInbound[K]) {
    setBlackBox((prev) => prev.map((r, i) => (i === idx ? { ...r, [k]: v } : r)));
  }
  function patchMB<K extends keyof ConversaoMeetingBroker>(k: K, v: ConversaoMeetingBroker[K]) {
    setMeetingBroker((prev) => ({ ...prev, [k]: v }));
  }

  async function handleContinue() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/units/${organizationId}/setup`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "conversoes-inbound",
          data: { leadBroker, blackBox, meetingBroker },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível salvar.");
        return;
      }
      router.push("/iniciar/conversoes-outbound");
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
        <h2 className="text-lg font-semibold text-foreground">6 · Conversões Inbound</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Taxas de conversão do funil inbound da sua unidade: Lead Broker, Black Box e Meeting Broker.
        </p>
      </div>

      <div className="mb-4 rounded border border-info/30 bg-info/5 px-3 py-2 flex items-center gap-2 text-xs text-foreground">
        <Info className="h-3.5 w-3.5 text-info shrink-0" />
        <span>
          Valores pré-preenchidos vêm das <strong>premissas da Matriz</strong>.
          {fromMatriz
            ? " Ajuste para a realidade da sua unidade — campos em 0% que a matriz travou aparecem como Não disponível."
            : " O badge ao lado do campo mostra o delta vs. a premissa da Matriz."}
        </span>
      </div>

      <InboundSection
        title="CRs Lead Broker por Tier"
        rows={leadBroker}
        matriz={matrizLeadBroker}
        onPatch={patchLB}
      />

      <InboundSection
        title="CRs Black Box por Tier"
        rows={blackBox}
        matriz={matrizBlackBox}
        onPatch={patchBB}
      />

      {/* P10 — Meeting Broker (Enterprise) */}
      <section className="rounded border border-border bg-card overflow-hidden mb-5">
        <header className="px-4 py-2.5 border-b border-border flex items-center gap-2">
          <span aria-hidden className="inline-block w-0.5 h-3.5 bg-accent rounded-sm" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Meeting Broker (Enterprise)
          </h3>
        </header>
        <div className="px-4 py-2 text-[11px] text-muted-foreground border-b border-border/60">
          Canal exclusivo para tier Enterprise. Funil curto: paga por SQL qualificado.
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  Canal
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Custo/SQL
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    CR3 SQL→SAL
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    CR4 SAL→Won
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  Meta
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  Pipeline
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-card border-b border-border/60">
                <td className="px-2 py-2 text-xs font-medium text-accent">Meeting Broker</td>
                <td className="px-2 py-2 text-xs text-right">
                  <CurrencyCell
                    isEditing
                    value={meetingBroker.custoSql}
                    matrizValue={matrizMeetingBroker.custoSql}
                    onChange={(v) => patchMB("custoSql", v)}
                    step={500}
                    lockableZero
                  />
                </td>
                <td className="px-2 py-2 text-xs text-right">
                  <PercentCell
                    isEditing
                    value={meetingBroker.cr3}
                    matrizValue={matrizMeetingBroker.cr3}
                    onChange={(v) => patchMB("cr3", v)}
                    digits={0}
                    lockableZero
                  />
                </td>
                <td className="px-2 py-2 text-xs text-right">
                  <PercentCell
                    isEditing
                    value={meetingBroker.cr4}
                    matrizValue={matrizMeetingBroker.cr4}
                    onChange={(v) => patchMB("cr4", v)}
                    digits={0}
                    lockableZero
                  />
                </td>
                <td className="px-2 py-2 text-xs">
                  <span className="inline-flex items-center px-2 py-0.5 border border-dashed border-warning bg-warning/5 rounded">
                    <input
                      type="text"
                      value={meetingBroker.meta}
                      onChange={(e) => patchMB("meta", e.target.value)}
                      placeholder="—"
                      className="bg-transparent text-xs focus:outline-none text-foreground w-full min-w-0"
                    />
                  </span>
                </td>
                <td className="px-2 py-2 text-xs">
                  <span className="inline-flex items-center px-2 py-0.5 border border-dashed border-warning bg-warning/5 rounded">
                    <input
                      type="text"
                      value={meetingBroker.pipeline}
                      onChange={(e) => patchMB("pipeline", e.target.value)}
                      placeholder="—"
                      className="bg-transparent text-xs focus:outline-none text-foreground w-full min-w-0"
                    />
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <WizardFooter
        onBack={() => router.push("/iniciar/leads-investimento")}
        onContinue={handleContinue}
        saving={saving}
        error={error}
      />
    </>
  );
}

function InboundSection({
  title,
  rows,
  matriz,
  onPatch,
}: {
  title: string;
  rows: ConversaoInbound[];
  matriz: ConversaoInbound[];
  onPatch: <K extends keyof ConversaoInbound>(idx: number, k: K, v: ConversaoInbound[K]) => void;
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
                  CR1 L→MQL
                </span>
              </th>
              <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                <span className="inline-flex items-center gap-1 justify-end">
                  CR2 MQL→SQL
                </span>
              </th>
              <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                <span className="inline-flex items-center gap-1 justify-end">
                  CR3 SQL→SAL
                </span>
              </th>
              <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                <span className="inline-flex items-center gap-1 justify-end">
                  CR4 SAL→Won
                </span>
              </th>
              <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider border-l border-table-header-foreground/20">
                <span className="inline-flex items-center gap-1 justify-end">
                  CR5 W→At
                </span>
              </th>
              <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                <span className="inline-flex items-center gap-1 justify-end">
                  CR6 At→Ren
                </span>
              </th>
              <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                <span className="inline-flex items-center gap-1 justify-end">
                  CR7 Ren→Exp
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
                {(["cr1", "cr2", "cr3", "cr4"] as const).map((key) => (
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
                    value={r.cr5}
                    matrizValue={matriz[idx]?.cr5}
                    onChange={(v) => onPatch(idx, "cr5", v)}
                    digits={0}
                    lockableZero
                  />
                </td>
                <td className="px-2 py-2 text-xs text-right">
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
