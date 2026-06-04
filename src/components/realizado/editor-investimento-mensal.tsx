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
  RealizadoMensal,
} from "@/lib/premissas/matriz-defaults";
import type { LinhaRampUp } from "@/lib/premissas/funil-reverso";
import {
  formatMesPt,
  getMesAncora,
  MESES_ANO_2026,
  ULTIMO_MES_FECHADO,
} from "@/lib/realizado/projecao";

type Props = {
  organizationId: string;
  horizonteAtual: Horizonte;
  /** P6 da unidade — usado como baseline (target × pctProducao) quando o mês não tem override. */
  investimentoMidia: InvestimentoMidia[];
  /** Override mensal atual (R$). 0–12 entradas; meses ausentes herdam o baseline. */
  investimentoMensal: InvestimentoMes[];
  /**
   * Realizado mensal da unidade — fornece o `investido` real dos meses fechados.
   * Esses meses ficam read-only no editor (a edição vive em /iniciar/realizado-historico).
   */
  realizadoHistorico: RealizadoMensal[];
  /** Linhas ramp-up por mês — fonte do target (para calcular o % derivado). */
  rampUpByMes: Map<string, LinhaRampUp>;
  /** Horizonte efetivo por mês — quando definido, exibe badge sob o nome do mês. */
  horizonteByMes?: Map<string, Horizonte>;
  /** Meses onde houve transição de horizonte — recebem borda accent na coluna. */
  transicoesMeses?: Set<string>;
  /**
   * Data de início da unidade (YYYY-MM-DD). Meses anteriores ao mês-âncora
   * ficam travados (read-only, dim) — a unidade ainda não operava.
   */
  dataInicio?: string | null;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 800;
const MESES = MESES_ANO_2026 as readonly string[];
// Larguras em % — tabela cresce/encolhe com o container. Mesmas proporções
// usadas nas outras tabelas do forecast pra todos os cards alinharem.
const PCT_LABEL = "14%";
const PCT_MES = "6.5%";
const PCT_TOTAL = "8%";
const MIN_TABLE_WIDTH = 1400;

function mesCurto(mes: string): string {
  return formatMesPt(mes).split(" ")[0] ?? mes;
}

export function EditorInvestimentoMensal({
  organizationId,
  horizonteAtual,
  investimentoMidia,
  investimentoMensal,
  realizadoHistorico,
  rampUpByMes,
  horizonteByMes,
  transicoesMeses,
  dataInicio,
}: Props) {
  const router = useRouter();
  const mesAncora = getMesAncora(dataInicio ?? null);
  const isAntesDeOperar = (mes: string) => mes < mesAncora;

  // baseline % do horizonte vigente da unidade (estampado no header e usado
  // pro pace anual quando não tem horizonte específico).
  const baselinePctAtual = useMemo(() => {
    const p6 = investimentoMidia.find((i) => i.h === horizonteAtual);
    return p6?.pctProducao ?? 0;
  }, [investimentoMidia, horizonteAtual]);

  // baseline % POR mês — usa o pctProducao do horizonte do mês (que pode
  // mudar quando a unidade é promovida). Sem isso, o delta "vs base" ficava
  // comparando AGO/SET/OUT contra o pctProducao do H1, mesmo a unidade já
  // estando em H2 nesses meses.
  const baselinePctByMes = useMemo(() => {
    const pctByH = new Map(investimentoMidia.map((i) => [i.h, i.pctProducao]));
    const m = new Map<string, number>();
    for (const mes of MESES) {
      const horMes = rampUpByMes.get(mes)?.horizonte ?? horizonteAtual;
      m.set(mes, pctByH.get(horMes) ?? 0);
    }
    return m;
  }, [investimentoMidia, rampUpByMes, horizonteAtual]);

  // Target por mês (para calcular o % derivado e o baseline de investimento).
  const targetByMes = useMemo(() => {
    const m = new Map<string, number>();
    for (const mes of MESES) m.set(mes, rampUpByMes.get(mes)?.target ?? 0);
    return m;
  }, [rampUpByMes]);

  // Investido real declarado no setup por mês fechado. Meses fechados com
  // `investido > 0` viram read-only no editor (o valor vem do realizado).
  const investidoRealByMes = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of realizadoHistorico) m.set(r.mes, r.investido);
    return m;
  }, [realizadoHistorico]);

  const isFechado = (mes: string) => mes <= ULTIMO_MES_FECHADO;
  // Meses anteriores ao início da unidade são travados (unidade ainda não
  // operava). Meses fechados com investido > 0 puxam do realizado e também
  // ficam travados (fonte da verdade no /iniciar/realizado-historico).
  const isReadOnlyMes = (mes: string) =>
    isAntesDeOperar(mes) ||
    (isFechado(mes) && (investidoRealByMes.get(mes) ?? 0) > 0);

  // Estado: sempre 12 valores absolutos (R$). Regra do display:
  //   1. mês antes da operação → 0 (travado)
  //   2. mês fechado com investido > 0 → valor do realizado (travado)
  //   3. **default = baseline** (target × pctProducao do horizonte do mês)
  //   4. override do banco SOMENTE se diferir do baseline em mais de 1%
  //      — assim valores salvos por código antigo (que não promovia o
  //      pctProducao quando a unidade subia de horizonte) são tratados como
  //      "auto" e recalculados pelo baseline novo. Se a unidade quiser de
  //      fato customizar, ela edita o número e o save persiste como override
  //      real (já que vai divergir do baseline).
  const buildInitial = (): Record<string, number> => {
    const byMes = new Map(investimentoMensal.map((p) => [p.mes, p.investimento]));
    const out: Record<string, number> = {};
    for (const mes of MESES) {
      if (isAntesDeOperar(mes)) {
        out[mes] = 0;
        continue;
      }
      if (isReadOnlyMes(mes)) {
        out[mes] = investidoRealByMes.get(mes) ?? 0;
        continue;
      }
      const target = targetByMes.get(mes) ?? 0;
      const baselineMes = baselinePctByMes.get(mes) ?? baselinePctAtual;
      const baseline = target * (baselineMes / 100);
      const override = byMes.get(mes);
      if (override === undefined) {
        out[mes] = baseline;
        continue;
      }
      // Se o override salvo bate com o baseline (qualquer valor "auto"
      // anterior), recalcula com o baseline atual.
      const tol = Math.max(1, baseline * 0.01);
      // Se o mês está em horizonte diferente do horizonteAtual da unidade,
      // o override salvo veio de antes da promoção — descarta e recalcula.
      const horMes = rampUpByMes.get(mes)?.horizonte ?? horizonteAtual;
      if (horMes !== horizonteAtual) {
        out[mes] = baseline;
        continue;
      }
      if (Math.abs(override - baseline) <= tol) {
        out[mes] = baseline;
      } else {
        out[mes] = override;
      }
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
  }, [investimentoMensal, baselinePctByMes, baselinePctAtual, targetByMes, investidoRealByMes]);

  function patchMes(mes: string, novoValor: number) {
    setValores((prev) => ({ ...prev, [mes]: novoValor }));
  }

  useEffect(() => {
    const dirty = MESES.some(
      (m) =>
        !isReadOnlyMes(m) &&
        Math.abs((valores[m] ?? 0) - (lastSavedRef.current[m] ?? 0)) > 0.01,
    );
    if (!dirty) return;

    const timer = setTimeout(async () => {
      setStatus("saving");
      setErrorMsg(null);
      try {
        // Meses read-only (realizado) não vão no payload — o valor lá é a
        // fonte da verdade e mora em /iniciar/realizado-historico.
        // Também filtra valores que BATEM com o baseline atual (target ×
        // pctProducao do horizonte do mês) — esses são "default" e devem
        // ser recalculados a cada load, não persistidos. Só sobe pro banco
        // o que o usuário REALMENTE editou (diff vs baseline > 1%).
        const payload = MESES.filter((mes) => !isReadOnlyMes(mes))
          .filter((mes) => {
            const target = targetByMes.get(mes) ?? 0;
            const baselineMes = baselinePctByMes.get(mes) ?? baselinePctAtual;
            const baseline = target * (baselineMes / 100);
            const tol = Math.max(1, (baseline * 1) / 100);
            return Math.abs((valores[mes] ?? 0) - baseline) > tol;
          })
          .map((mes) => ({ mes, investimento: valores[mes] ?? 0 }));
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
    <div className="rounded border border-border bg-card mb-5 w-full">
      <div className="border-b border-border bg-muted/20 py-2.5">
        <div className="sticky left-0 inline-flex items-baseline gap-2 px-4 flex-wrap">
          <h2 className="text-xs uppercase tracking-wider font-semibold text-foreground">
            Pace de investimento
          </h2>
          <span className="text-[10px] text-muted-foreground">
            — meses fechados puxam do realizado; meses futuros são editáveis (R$). O % da produção é derivado. Mexer num mês reflete nos posteriores (a receita do mês vira a base do seguinte)
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

      <table
        className="text-sm border-collapse table-fixed w-full"
        style={{ minWidth: MIN_TABLE_WIDTH }}
      >
        <colgroup>
          <col style={{ width: PCT_LABEL }} />
          {MESES.map((m) => {
            const isTransition = transicoesMeses?.has(m) ?? false;
            return (
              <col
                key={m}
                style={{ width: PCT_MES }}
                className={isTransition ? "border-l-2 border-l-accent" : undefined}
              />
            );
          })}
          <col style={{ width: PCT_TOTAL }} />
        </colgroup>
        <thead>
          <tr>
            <th className="sticky top-0 left-0 z-50 bg-table-header text-table-header-foreground px-3 py-2 text-left text-[10px] uppercase tracking-wider border-r border-border"></th>
            {MESES.map((mes) => {
              const h = horizonteByMes?.get(mes);
              const isTransition = transicoesMeses?.has(mes) ?? false;
              return (
                <th
                  key={mes}
                  className={`sticky top-0 z-40 bg-table-header text-table-header-foreground h-auto font-medium px-3 py-2 text-right text-[10px] uppercase tracking-wider tabular-nums ${
                    isTransition ? "border-l-2 border-l-accent" : ""
                  }`}
                  title={
                    h
                      ? `${formatMesPt(mes)} — premissas aplicadas: ${h}`
                      : formatMesPt(mes)
                  }
                >
                  <div className="flex flex-col items-end leading-tight">
                    <span>{mesCurto(mes)}</span>
                    {h && (
                      <span
                        className={`text-[9px] font-bold mt-0.5 tracking-wider ${
                          isTransition ? "text-warning" : "text-warning/85"
                        }`}
                      >
                        {h}
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
            <th className="sticky top-0 z-40 bg-accent/15 text-accent h-auto px-3 py-2 text-right text-[10px] uppercase tracking-wider tabular-nums font-semibold border-l-2 border-border">
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
            {MESES.map((mes) => {
              if (isAntesDeOperar(mes)) {
                return (
                  <td
                    key={mes}
                    className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground/40 bg-muted/10"
                    title={`Unidade iniciou em ${formatMesPt(mesAncora)} — meses anteriores não operam.`}
                  >
                    —
                  </td>
                );
              }
              if (isReadOnlyMes(mes)) {
                return (
                  <td
                    key={mes}
                    className="px-3 py-2 text-right text-xs tabular-nums bg-info/5 text-foreground"
                    title="Valor declarado no setup como realizado — edite em /iniciar/realizado-historico"
                  >
                    {formatBRL(valores[mes] ?? 0)}
                  </td>
                );
              }
              return (
                <td key={mes} className="px-3 py-2 text-right">
                  <CurrencyCell
                    isEditing
                    value={valores[mes] ?? 0}
                    onChange={(v) => patchMes(mes, v)}
                    step={1000}
                    inputClassName="w-full min-w-0"
                  />
                </td>
              );
            })}
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
              // Baseline POR mês: pctProducao do horizonte vigente naquele mês
              // (pode ser diferente de horizonteAtual depois de promoção).
              const baselineMes = baselinePctByMes.get(mes) ?? baselinePctAtual;
              const horMes = rampUpByMes.get(mes)?.horizonte ?? horizonteAtual;
              const deltaAbs = pct - baselineMes;
              // Delta relativo vs baseline. Quando baseline=0, mostra absoluto
              // pra evitar divisão por zero (e o sinal já indica direção).
              const deltaRel =
                baselineMes > 0 ? (deltaAbs / baselineMes) * 100 : deltaAbs;
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
                      ? `Pace atual: ${formatPercent(pct, 1)} · baseline ${horMes}: ${formatPercent(baselineMes, 1)}`
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
              // Comparativo anual usa o baseline do horizonte vigente da
              // unidade (snapshot do começo do ano). Se a unidade promoveu
              // durante o ano, o delta mostra o quanto desviou do baseline
              // INICIAL — útil pra ver o efeito do crescimento.
              const deltaAbs = pct - baselinePctAtual;
              const deltaRel =
                baselinePctAtual > 0 ? (deltaAbs / baselinePctAtual) * 100 : deltaAbs;
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
          Baseline do horizonte {horizonteAtual}: {formatPercent(baselinePctAtual, 1)} da produção.
          Meses não editados começam com o pace do horizonte vigente no mês
          (promoções aplicam o pctProducao do novo horizonte automaticamente).
          A receita efetiva de cada mês é a base do mês seguinte — então aumentar
          (ou reduzir) o investimento de um mês propaga pra frente.
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
