"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { CurrencyCell, IntegerCell } from "@/components/premissas/editable-cell";
import { formatBRL, formatPercent } from "@/components/premissas/format";
import { FieldHelp } from "@/components/ui/field-help";
import { WizardFooter } from "./wizard-footer";
import type {
  Horizonte,
  HorizonteCrescimento,
  RealizadoMensal,
} from "@/lib/premissas/matriz-defaults";
import {
  calcularRealizadoVsProjetado,
  formatMesPt,
  getMesAncora,
  getMesBaseForecast,
  MESES_ANO_2026,
  ULTIMO_MES_FECHADO,
} from "@/lib/realizado/projecao";

type Props = {
  organizationId: string;
  initialValues: RealizadoMensal[];
  horizontes: HorizonteCrescimento[];
  horizonteAtual: Horizonte;
  /** Data de inauguração da unidade — define o mês-âncora da projeção. */
  dataInicio: string | null;
};

/**
 * Step 9 — Realizado Histórico.
 *
 * Coleta o realizado da unidade nos meses já fechados do ano corrente. Esse
 * input alimenta a projeção mês-a-mês até dez/2026 (calculada via P1 — taxa
 * de crescimento do horizonte atual). A tela /realizado mostra a visão completa
 * Realizado vs Projetado depois desse setup.
 */
export function StepRealizadoHistorico({
  organizationId,
  initialValues,
  horizontes,
  horizonteAtual,
  dataInicio,
}: Props) {
  const router = useRouter();
  // Mantém apenas os meses fechados a partir do mês-âncora da unidade (inaugurada
  // antes ou em jan → âncora jan; abriu no meio do ano → âncora = mês de início).
  const mesAncora = useMemo(() => getMesAncora(dataInicio), [dataInicio]);
  // Gera o esqueleto de TODOS os meses fechados no intervalo [âncora, último
  // fechado] mesmo quando a unidade ainda não salvou nada (initialValues vazio).
  // Cada mês reaproveita o valor salvo, ou entra zerado para preenchimento manual.
  const fechados = useMemo(() => {
    const byMes = new Map(initialValues.map((r) => [r.mes, r]));
    return MESES_ANO_2026.filter(
      (mes) => mes <= ULTIMO_MES_FECHADO && mes >= mesAncora,
    ).map(
      (mes): RealizadoMensal =>
        byMes.get(mes) ?? {
          mes,
          faturamento: 0,
          investido: 0,
          leadsIb: 0,
          leadsOb: 0,
          won: 0,
        },
    );
  }, [initialValues, mesAncora]);
  const [rows, setRows] = useState<RealizadoMensal[]>(fechados);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch<K extends keyof RealizadoMensal>(
    idx: number,
    k: K,
    v: RealizadoMensal[K],
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
        body: JSON.stringify({ step: "realizado-historico", data: rows }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível salvar.");
        return;
      }
      router.push("/iniciar/resumo");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSaving(false);
    }
  }

  // Preview do projetado: parte do mês fechado mais recente preenchido (mês-base)
  // e capitaliza pela taxa fixa do horizonte atual da unidade até dez/2026.
  const preview = useMemo(
    () =>
      calcularRealizadoVsProjetado(rows, horizontes, horizonteAtual, {
        dataInicio,
      }),
    [rows, horizontes, horizonteAtual, dataInicio],
  );
  const futuros = preview.filter((p) => p.mes > ULTIMO_MES_FECHADO);

  const totalRealizado = rows.reduce((acc, r) => acc + r.faturamento, 0);
  // Mês-base = fechado mais recente com faturamento. Sem ele não há projeção.
  const mesBase = useMemo(
    () => getMesBaseForecast(rows, { dataInicio }),
    [rows, dataInicio],
  );
  const temBase = mesBase !== null;

  return (
    <>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">9 · Realizado Histórico</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Preencha os números reais da unidade nos meses já fechados de 2026. Esses valores são a base para o cálculo de <strong>Forecast</strong>.
        </p>
      </div>

      <div className="mb-4 rounded border border-info/30 bg-info/5 px-3 py-2 flex items-center gap-2 text-xs text-foreground">
        <Info className="h-3.5 w-3.5 text-info shrink-0" />
        <span>
          A trajetória <strong>Projetada</strong> parte do <strong>mês fechado mais recente preenchido</strong>
          {temBase ? <> (<strong>{formatMesPt(mesBase!)}</strong>)</> : null}
          {" "}e capitaliza pela taxa do horizonte <strong>{horizonteAtual}</strong> (
          {formatPercent(horizontes.find((h) => h.h === horizonteAtual)?.crescMensalPct ?? 0, 1)}/mês)
          até dez/2026. Atualize um mês mais recente para a curva re-ancorar nele.
        </span>
      </div>

      {!temBase && (
        <div className="mb-4 rounded border border-warning/40 bg-warning/10 px-3 py-2 flex items-center gap-2 text-xs text-foreground">
          <Info className="h-3.5 w-3.5 text-warning shrink-0" />
          <span>
            Preencha o faturamento de pelo menos um mês fechado para ver a trajetória projetada.
          </span>
        </div>
      )}

      <section className="rounded border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <Th help="Mês fechado do ano corrente.">Mês</Th>
                <Th align="right" help="Faturamento realizado pela unidade no mês (R$).">Faturamento</Th>
                <Th align="right" help="Investimento em mídia no mês — Lead Broker + Black Box (R$).">Investido</Th>
                <Th align="right" help="Leads inbound (Lead Broker) gerados no mês.">Leads IB</Th>
                <Th align="right" help="Leads outbound (Black Box) gerados no mês.">Leads OB</Th>
                <Th align="right" help="Deals fechados (Won) no mês.">Won</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.mes}
                  className={`${idx % 2 === 0 ? "bg-card" : "bg-muted/30"} border-b border-border/60`}
                >
                  <td className="px-2 py-2 text-xs font-medium text-foreground">
                    {formatMesPt(row.mes)}
                  </td>
                  <td className="px-2 py-2 text-xs text-right">
                    <CurrencyCell
                      isEditing
                      value={row.faturamento}
                      onChange={(v) => patch(idx, "faturamento", v)}
                    />
                  </td>
                  <td className="px-2 py-2 text-xs text-right">
                    <CurrencyCell
                      isEditing
                      value={row.investido}
                      onChange={(v) => patch(idx, "investido", v)}
                    />
                  </td>
                  <td className="px-2 py-2 text-xs text-right">
                    <IntegerCell
                      isEditing
                      value={row.leadsIb}
                      onChange={(v) => patch(idx, "leadsIb", v)}
                    />
                  </td>
                  <td className="px-2 py-2 text-xs text-right">
                    <IntegerCell
                      isEditing
                      value={row.leadsOb}
                      onChange={(v) => patch(idx, "leadsOb", v)}
                    />
                  </td>
                  <td className="px-2 py-2 text-xs text-right">
                    <IntegerCell
                      isEditing
                      value={row.won}
                      onChange={(v) => patch(idx, "won", v)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Acumulado do período
          </span>
          <span className="text-base font-bold text-accent tabular-nums">
            {formatBRL(totalRealizado)}
          </span>
        </div>
      </section>

      {/* Preview da trajetória projetada — aparece quando há um mês-base preenchido */}
      {temBase && (
        <section className="mt-4 rounded border border-border bg-card overflow-hidden">
          <header className="flex items-center gap-2 px-4 h-10 border-b border-border bg-muted/30">
            <span aria-hidden className="inline-block w-0.5 h-3.5 bg-accent rounded-sm" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Trajetória projetada · até dez 2026
            </h3>
            <FieldHelp
              text="Projeção partindo do mês fechado mais recente preenchido e capitalizando pela taxa do horizonte atual da unidade (P1). Re-ancora sempre no último mês fechado com faturamento."
              position="bottom"
            />
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <Th>Mês</Th>
                  <Th align="right" help="Faturamento projetado mês-a-mês a partir do último mês fechado.">Projetado</Th>
                  <Th align="right" help="Horizonte usado para projetar este mês (P1).">Horizonte</Th>
                </tr>
              </thead>
              <tbody>
                {futuros.map((p, idx) => (
                  <tr
                    key={p.mes}
                    className={`${idx % 2 === 0 ? "bg-card" : "bg-muted/30"} border-b border-border/60`}
                  >
                    <td className="px-2 py-2 text-xs font-medium text-foreground">
                      {formatMesPt(p.mes)}
                    </td>
                    <td className="px-2 py-2 text-xs text-right tabular-nums text-foreground">
                      {formatBRL(p.projetado)}
                    </td>
                    <td className="px-2 py-2 text-xs text-right tabular-nums text-muted-foreground">
                      {p.horizonteAplicado ? (
                        <span className="inline-flex items-center gap-1">
                          <span>{p.horizonteAplicado}</span>
                          <span className="text-[10px]">
                            ({formatPercent(
                              horizontes.find((h) => h.h === p.horizonteAplicado)?.crescMensalPct ?? 0,
                              1,
                            )}
                            /mês)
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <WizardFooter
        onBack={() => router.push("/iniciar/mix-subcanais")}
        onContinue={handleContinue}
        saving={saving}
        error={error}
        isLast
      />
    </>
  );
}

function Th({
  children,
  align = "left",
  help,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  help?: string;
}) {
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const innerAlign = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <th
      className={`bg-table-header text-table-header-foreground h-8 font-medium px-2 py-1.5 text-[10px] uppercase tracking-wider ${alignClass}`}
    >
      {help ? (
        <span className={`inline-flex items-center gap-1 ${innerAlign}`}>
          {children}
          <FieldHelp text={help} position="bottom" />
        </span>
      ) : (
        children
      )}
    </th>
  );
}
