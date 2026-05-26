"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { IntegerCell, PercentCell } from "@/components/premissas/editable-cell";
import { FieldHelp } from "@/components/ui/field-help";
import { WizardFooter } from "./wizard-footer";
import type { MetricaOperacional } from "@/lib/premissas/matriz-defaults";
import { CargoSelect } from "./cargo-select";

type Props = {
  organizationId: string;
  initialValues: MetricaOperacional[];
  matrizDefault: MetricaOperacional[];
  fromMatriz: boolean;
};

/**
 * Colunas numéricas (proxy) — contratação/onboarding em dias, rampagem/permanência
 * em meses, wipLimit em capacidade/mês, turnoverMesPct em % mensal.
 */
const NUM_COLS: Array<{
  key: keyof MetricaOperacional;
  label: string;
  suffix?: string;
  help: string;
}> = [
  {
    key: "wipLimit",
    label: "WIP Limit",
    suffix: "/mês",
    help: "Work-in-progress: capacidade máxima do cargo em plena produção. Unidade depende do cargo (MQLs para SDR, leads para BDR, reuniões para Closer).",
  },
  {
    key: "contratacao",
    label: "Contratação",
    suffix: "dias",
    help: "Tempo médio em dias entre abrir a vaga e a pessoa começar. Considera anúncio, processo seletivo e início.",
  },
  {
    key: "onboarding",
    label: "Onboarding",
    suffix: "dias",
    help: "Tempo em dias de treinamento inicial — da entrada até começar a executar com supervisão.",
  },
  {
    key: "rampagem",
    label: "Rampagem",
    suffix: "meses",
    help: "Tempo em meses até a pessoa atingir produtividade plena (100% do WIP).",
  },
  {
    key: "atingimentoMes",
    label: "Atinge 100%",
    suffix: "º mês",
    help: "A partir de qual mês de casa o colaborador entrega 100% do WIP Limit de forma consistente.",
  },
  {
    key: "permanencia",
    label: "Permanência",
    suffix: "meses",
    help: "Tempo médio em meses que a pessoa permanece no cargo antes de sair (promoção, troca ou saída).",
  },
];

export function StepMetricasOperacionais({
  organizationId,
  initialValues,
  matrizDefault,
  fromMatriz,
}: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<MetricaOperacional[]>(initialValues);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch<K extends keyof MetricaOperacional>(
    idx: number,
    k: K,
    v: MetricaOperacional[K],
  ) {
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
        body: JSON.stringify({ step: "metricas-operacionais", data: rows }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível salvar.");
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
        <h2 className="text-lg font-semibold text-foreground">3 · Capacidade Operacional</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Quantifique os parâmetros operacionais de cada cargo. Esses números alimentam o capacity planning e o cálculo de CAC dinâmico.
        </p>
      </div>

      <div className="mb-4 rounded border border-info/30 bg-info/5 px-3 py-2 flex items-center gap-2 text-xs text-foreground">
        <Info className="h-3.5 w-3.5 text-info shrink-0" />
        <span>
          Valores pré-preenchidos vêm das <strong>premissas da Matriz</strong>.
          {fromMatriz
            ? " Ajuste para a realidade da sua unidade."
            : " Ao alterar, o badge ao lado do campo mostra o quanto você se afastou da premissa."}
        </span>
      </div>

      <section className="rounded border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1">
                    Cargo
                    <FieldHelp text="Posição operacional do time comercial." position="bottom" />
                  </span>
                </th>
                {NUM_COLS.map((c) => (
                  <th
                    key={c.key as string}
                    className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider"
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      {c.label}
                      {c.suffix && (
                        <span className="text-table-header-foreground/60 normal-case">
                          ({c.suffix})
                        </span>
                      )}
                      <FieldHelp text={c.help} position="bottom" />
                    </span>
                  </th>
                ))}
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Turnover/Mês
                    <FieldHelp text="Percentual mensal de saídas do cargo. Ex: 2% = a cada 50 colaboradores, 1 sai por mês." position="bottom" />
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Ligações/Mês
                    <FieldHelp text="Volume médio de ligações por mês. Aplica-se a cargos de prospecção (SDR/BDR); use 0 para cargos sem cadência de ligação (ex: Closer)." position="bottom" />
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Conexão %
                    <FieldHelp text="Taxa de conexão das ligações em %. Use 0 para cargos sem cadência de ligação." position="bottom" />
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1">
                    Extra
                    <FieldHelp text="Observações qualitativas livres — não entra em fórmulas." position="bottom" />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr
                  key={idx}
                  className={`${idx % 2 === 0 ? "bg-card" : "bg-muted/30"} border-b border-border/60`}
                >
                  <td className="px-2 py-2 text-xs">
                    <CargoSelect
                      value={r.cargo}
                      onChange={(v) => patch(idx, "cargo", v)}
                    />
                  </td>
                  {NUM_COLS.map((c) => (
                    <td key={c.key as string} className="px-2 py-2 text-xs text-right">
                      <IntegerCell
                        isEditing
                        value={r[c.key] as number}
                        matrizValue={matrizDefault[idx]?.[c.key] as number | undefined}
                        onChange={(v) => patch(idx, c.key, v as MetricaOperacional[typeof c.key])}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-2 text-xs text-right">
                    <PercentCell
                      isEditing
                      value={r.turnoverMesPct}
                      matrizValue={matrizDefault[idx]?.turnoverMesPct}
                      onChange={(v) => patch(idx, "turnoverMesPct", v)}
                      digits={1}
                    />
                  </td>
                  <td className="px-2 py-2 text-xs text-right">
                    <IntegerCell
                      isEditing
                      value={r.ligacoesMes}
                      matrizValue={matrizDefault[idx]?.ligacoesMes}
                      onChange={(v) => patch(idx, "ligacoesMes", v)}
                      inputClassName="w-14"
                    />
                  </td>
                  <td className="px-2 py-2 text-xs text-right">
                    <PercentCell
                      isEditing
                      value={r.conexaoPct}
                      matrizValue={matrizDefault[idx]?.conexaoPct}
                      onChange={(v) => patch(idx, "conexaoPct", v)}
                      digits={0}
                    />
                  </td>
                  <td className="px-2 py-2 text-xs">
                    <span className="inline-flex items-center px-2 py-0.5 border border-dashed border-warning bg-warning/5 rounded">
                      <input
                        type="text"
                        value={r.extra}
                        onChange={(e) => patch(idx, "extra", e.target.value)}
                        placeholder="—"
                        className="bg-transparent text-xs focus:outline-none text-foreground w-full min-w-0"
                      />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border bg-muted/20">
          Valores quantitativos serão usados em fórmulas downstream (capacity, CAC dinâmico). Use o campo <em>Extra</em> para observações qualitativas.
        </div>
      </section>

      <WizardFooter
        onBack={() => router.push("/iniciar/time-comercial")}
        onContinue={handleContinue}
        saving={saving}
        error={error}
      />
    </>
  );
}
