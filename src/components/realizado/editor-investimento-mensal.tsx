"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Loader2, TriangleAlert } from "lucide-react";
import { CurrencyCell } from "@/components/premissas/editable-cell";
import { formatBRL, formatPercent } from "@/components/premissas/format";
import { FieldHelp } from "@/components/ui/field-help";
import type {
  Horizonte,
  InvestimentoMes,
  InvestimentoMidia,
} from "@/lib/premissas/matriz-defaults";
import type { LinhaRampUp } from "@/lib/premissas/funil-reverso";
import { formatMesPt, MESES_ANO_2026 } from "@/lib/realizado/projecao";

type Props = {
  organizationId: string;
  horizonteAtual: Horizonte;
  /** P6 da unidade — usado como baseline (target × pctProducao) quando o mês não tem override. */
  investimentoMidia: InvestimentoMidia[];
  /** Override mensal atual (R$). 0–12 entradas; meses ausentes herdam o baseline. */
  investimentoMensal: InvestimentoMes[];
  /** Linhas ramp-up por mês — fonte do target (para calcular o % derivado). */
  rampUpByMes: Map<string, LinhaRampUp>;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 800;
const MESES = MESES_ANO_2026 as readonly string[];
const W_LABEL = 220;
const W_MES = 116;
const W_TOTAL = 132;

function mesCurto(mes: string): string {
  return formatMesPt(mes).split(" ")[0] ?? mes;
}

export function EditorInvestimentoMensal({
  organizationId,
  horizonteAtual,
  investimentoMidia,
  investimentoMensal,
  rampUpByMes,
}: Props) {
  const router = useRouter();

  const baselinePct = useMemo(() => {
    const p6 = investimentoMidia.find((i) => i.h === horizonteAtual);
    return p6?.pctProducao ?? 0;
  }, [investimentoMidia, horizonteAtual]);

  // Target por mês (para calcular o % derivado e o baseline de investimento).
  const targetByMes = useMemo(() => {
    const m = new Map<string, number>();
    for (const mes of MESES) m.set(mes, rampUpByMes.get(mes)?.target ?? 0);
    return m;
  }, [rampUpByMes]);

  // Estado: sempre 12 valores absolutos (R$). Inicializa do override do banco;
  // meses ausentes herdam o baseline (target × pctProducao do horizonte).
  const buildInitial = (): Record<string, number> => {
    const byMes = new Map(investimentoMensal.map((p) => [p.mes, p.investimento]));
    const out: Record<string, number> = {};
    for (const mes of MESES) {
      const override = byMes.get(mes);
      out[mes] = override ?? (targetByMes.get(mes) ?? 0) * (baselinePct / 100);
    }
    return out;
  };
  const [valores, setValores] = useState<Record<string, number>>(buildInitial);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const lastSavedRef = useRef<Record<string, number>>(valores);
  useEffect(() => {
    const next = buildInitial();
    setValores(next);
    lastSavedRef.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investimentoMensal, baselinePct, targetByMes]);

  function patchMes(mes: string, novoValor: number) {
    setValores((prev) => ({ ...prev, [mes]: novoValor }));
  }

  useEffect(() => {
    const dirty = MESES.some(
      (m) => Math.abs((valores[m] ?? 0) - (lastSavedRef.current[m] ?? 0)) > 0.01,
    );
    if (!dirty) return;

    const timer = setTimeout(async () => {
      setStatus("saving");
      setErrorMsg(null);
      try {
        const payload = MESES.map((mes) => ({ mes, investimento: valores[mes] ?? 0 }));
        const res = await fetch(`/api/units/${organizationId}/investimento-mensal`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ investimentoMensal: payload }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setErrorMsg(body.error ?? "Não foi possível salvar.");
          setStatus("error");
          return;
        }
        lastSavedRef.current = { ...valores };
        setStatus("saved");
        router.refresh();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Erro inesperado.");
        setStatus("error");
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [valores, organizationId, router]);

  // Totais para a coluna da direita.
  const investAno = MESES.reduce((acc, m) => acc + (valores[m] ?? 0), 0);
  const targetAno = MESES.reduce((acc, m) => acc + (targetByMes.get(m) ?? 0), 0);
  const pctAno = targetAno > 0 ? (investAno / targetAno) * 100 : 0;

  return (
    <div className="rounded border border-border bg-card mb-5 w-fit">
      <div className="border-b border-border bg-muted/20 py-2.5">
        <div className="sticky left-0 inline-flex items-baseline gap-2 px-4 flex-wrap">
          <h2 className="text-xs uppercase tracking-wider font-semibold text-foreground">
            Pace de investimento
          </h2>
          <span className="text-[10px] text-muted-foreground">
            — defina o investimento em mídia (R$) mês a mês; o % da produção é derivado
          </span>
          <span className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ml-2">
            {horizonteAtual}
          </span>
          <StatusBadge status={status} errorMsg={errorMsg} />
          <Link
            href="/iniciar/leads-investimento"
            className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5"
          >
            Ajustar baseline P6 (splits LB/BB, horizontes)
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <table className="text-sm border-collapse table-fixed" style={{ width: "max-content" }}>
        <colgroup>
          <col style={{ width: W_LABEL }} />
          {MESES.map((m) => (
            <col key={m} style={{ width: W_MES }} />
          ))}
          <col style={{ width: W_TOTAL }} />
        </colgroup>
        <thead>
          <tr>
            <th className="sticky top-0 left-0 z-50 bg-table-header text-table-header-foreground px-3 py-2 text-left text-[10px] uppercase tracking-wider border-r border-border">
              Métrica
            </th>
            {MESES.map((mes) => (
              <th
                key={mes}
                className="sticky top-0 z-40 bg-table-header text-table-header-foreground h-9 font-medium px-3 py-2 text-right text-[10px] uppercase tracking-wider tabular-nums"
                title={formatMesPt(mes)}
              >
                {mesCurto(mes)}
              </th>
            ))}
            <th className="sticky top-0 z-40 bg-accent/15 text-accent h-9 px-3 py-2 text-right text-[10px] uppercase tracking-wider tabular-nums font-semibold border-l-2 border-border">
              Total 2026
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Linha 1 — Investimento (R$) editável */}
          <tr className="border-b border-border/60 bg-muted/30 hover:bg-muted/40">
            <td className="sticky left-0 z-10 bg-muted/40 border-r border-border px-3 py-2 text-xs text-foreground font-semibold">
              <span className="inline-flex items-center gap-1">
                Investimento (R$)
                <FieldHelp
                  text="Valor absoluto em mídia para o mês. Esse é o input — o % da produção abaixo é calculado a partir daqui e do target. O forecast inteiro recalcula automaticamente."
                  position="bottom"
                />
              </span>
            </td>
            {MESES.map((mes) => (
              <td key={mes} className="px-3 py-2 text-right">
                <CurrencyCell
                  isEditing
                  value={valores[mes] ?? 0}
                  onChange={(v) => patchMes(mes, v)}
                  step={1000}
                  inputClassName="w-20"
                />
              </td>
            ))}
            <td className="px-3 py-2 text-right bg-accent/5 border-l-2 border-border text-xs tabular-nums text-accent font-semibold">
              {formatBRL(investAno)}
            </td>
          </tr>
          {/* Linha 2 — % da produção derivado, read-only */}
          <tr className="border-b border-border/60 hover:bg-muted/20">
            <td className="sticky left-0 z-10 bg-card border-r border-border pl-8 pr-3 py-2 text-xs text-muted-foreground font-medium">
              <span className="inline-flex items-center gap-1">
                % da produção
                <FieldHelp
                  text="Investimento ÷ faturamento previsto do mês × 100. Derivado — não editável. Edite o investimento acima para ajustar."
                  position="bottom"
                />
              </span>
            </td>
            {MESES.map((mes) => {
              const target = targetByMes.get(mes) ?? 0;
              const pct = target > 0 ? ((valores[mes] ?? 0) / target) * 100 : 0;
              const deltaAbs = pct - baselinePct;
              // Delta relativo vs baseline. Quando baseline=0, mostra absoluto
              // pra evitar divisão por zero (e o sinal já indica direção).
              const deltaRel =
                baselinePct > 0 ? (deltaAbs / baselinePct) * 100 : deltaAbs;
              const significante = Math.abs(deltaAbs) > 0.05;
              const corPrincipal = !significante
                ? "text-muted-foreground"
                : deltaAbs > 0
                  ? "text-success"
                  : "text-destructive";
              const corDelta = !significante
                ? "text-muted-foreground/60"
                : deltaAbs > 0
                  ? "text-success/80"
                  : "text-destructive/80";
              const deltaLabel = significante
                ? `${deltaRel > 0 ? "+" : ""}${deltaRel.toFixed(Math.abs(deltaRel) >= 10 ? 0 : 1)}%`
                : null;
              return (
                <td
                  key={mes}
                  className="px-3 py-2 text-right tabular-nums"
                  title={
                    target > 0
                      ? `Pace atual: ${formatPercent(pct, 1)} · baseline ${horizonteAtual}: ${formatPercent(baselinePct, 1)}`
                      : undefined
                  }
                >
                  {target > 0 ? (
                    <div className="flex flex-col items-end leading-tight">
                      <span className={`text-xs ${corPrincipal}`}>
                        {formatPercent(pct, 1)}
                      </span>
                      {deltaLabel && (
                        <span className={`text-[9px] font-medium ${corDelta}`}>
                          {deltaLabel} vs base
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              );
            })}
            {(() => {
              const pct = targetAno > 0 ? pctAno : 0;
              const deltaAbs = pct - baselinePct;
              const deltaRel =
                baselinePct > 0 ? (deltaAbs / baselinePct) * 100 : deltaAbs;
              const significante = Math.abs(deltaAbs) > 0.05;
              const deltaLabel = significante
                ? `${deltaRel > 0 ? "+" : ""}${deltaRel.toFixed(Math.abs(deltaRel) >= 10 ? 0 : 1)}%`
                : null;
              return (
                <td className="px-3 py-2 text-right bg-accent/5 border-l-2 border-border tabular-nums">
                  {targetAno > 0 ? (
                    <div className="flex flex-col items-end leading-tight">
                      <span className="text-xs text-accent font-semibold">
                        {formatPercent(pct, 1)}
                      </span>
                      {deltaLabel && (
                        <span className="text-[9px] font-medium text-accent/70">
                          {deltaLabel} vs base
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              );
            })()}
          </tr>
        </tbody>
      </table>
      <div className="border-t border-border bg-muted/20 py-2.5">
        <p className="sticky left-0 inline-block px-4 text-[10px] text-muted-foreground">
          Baseline do horizonte {horizonteAtual}: {formatPercent(baselinePct, 1)} da produção.
          Meses não editados começam com esse pace.
        </p>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  errorMsg,
}: {
  status: SaveStatus;
  errorMsg: string | null;
}) {
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground ml-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        Salvando…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-success ml-2">
        <Check className="h-3 w-3" />
        Salvo
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        title={errorMsg ?? undefined}
        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-destructive ml-2"
      >
        <TriangleAlert className="h-3 w-3" />
        {errorMsg ?? "Erro ao salvar"}
      </span>
    );
  }
  return null;
}
