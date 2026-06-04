"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Lock, RotateCcw, TriangleAlert } from "lucide-react";
import { CurrencyCell, IntegerCell } from "@/components/premissas/editable-cell";
import { formatBRL, formatInt } from "@/components/premissas/format";
import { FieldHelp } from "@/components/ui/field-help";
import { useRouter } from "next/navigation";
import type {
  DistSplitHorizonte,
  Horizonte,
  InvestimentoMidia,
  MixOutboundHorizonte,
  OverrideSubcanalMes,
} from "@/lib/premissas/matriz-defaults";
import type { LinhaRampUp, LinhaSubCanal, SubCanalKey } from "@/lib/premissas/funil-reverso";
import { SUB_CANAIS, subcanalLiberado } from "@/lib/premissas/funil-reverso";
import {
  formatMesPt,
  getMesAncora,
  MESES_ANO_2026,
  ULTIMO_MES_FECHADO,
} from "@/lib/realizado/projecao";

type Props = {
  organizationId: string;
  /** Caps por mês: `investTotal` (cap inbound) e `leadsOb` (cap outbound). */
  rampUpByMes: Map<string, LinhaRampUp>;
  /** Valores efetivos derivados por `${subcanal}|${mes}` — exibe o "auto" (rateio). */
  subCanalByKey: Map<string, LinhaSubCanal>;
  /** Overrides salvos (R$ inbound / leads outbound). */
  overridesSubcanalMes: OverrideSubcanalMes[];
  /** P6/P4/P16 da MATRIZ — definem se cada subcanal está liberado por horizonte. */
  matrizInvestimentoMidia: InvestimentoMidia[];
  matrizDistSplit: DistSplitHorizonte[];
  matrizMixSubcanais: MixOutboundHorizonte[];
  horizonteByMes?: Map<string, Horizonte>;
  transicoesMeses?: Set<string>;
  dataInicio?: string | null;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 800;
const MESES = MESES_ANO_2026 as readonly string[];
const PCT_LABEL = "14%";
const PCT_MES = "6.5%";
const PCT_TOTAL = "8%";
const MIN_TABLE_WIDTH = 1400;

const INBOUND = SUB_CANAIS.filter((s) => s.canal === "inbound");
const OUTBOUND = SUB_CANAIS.filter((s) => s.canal === "outbound");

function mesCurto(mes: string): string {
  return formatMesPt(mes).split(" ")[0] ?? mes;
}
const cellKey = (sub: SubCanalKey, mes: string) => `${sub}|${mes}`;

export function EditorSubcanalMensal({
  organizationId,
  rampUpByMes,
  subCanalByKey,
  overridesSubcanalMes,
  matrizInvestimentoMidia,
  matrizDistSplit,
  matrizMixSubcanais,
  horizonteByMes,
  transicoesMeses,
  dataInicio,
}: Props) {
  const router = useRouter();
  const mesAncora = getMesAncora(dataInicio ?? null);
  const isAntesDeOperar = (mes: string) => mes < mesAncora;
  const isFechado = (mes: string) => mes <= ULTIMO_MES_FECHADO;
  // Override só vale em meses futuros (realizado manda nos fechados).
  const isReadOnlyMes = (mes: string) => isAntesDeOperar(mes) || isFechado(mes);

  // Cap por mês e grupo.
  const capInbound = (mes: string) => rampUpByMes.get(mes)?.investTotal ?? 0;
  const capOutbound = (mes: string) => rampUpByMes.get(mes)?.leadsOb ?? 0;
  const isInbound = (sub: SubCanalKey) => INBOUND.some((s) => s.key === sub);

  // Liberação por (subcanal, mês): a matriz precisa ter o subcanal ativo no
  // horizonte EFETIVO daquele mês (promoção aplicada). Subcanal não liberado
  // fica travado — a unidade não pode editar o que a matriz não abriu.
  const matrizBlocks = useMemo(
    () => ({
      investimentoMidia: matrizInvestimentoMidia,
      distSplit: matrizDistSplit,
      mixSubcanais: matrizMixSubcanais,
    }),
    [matrizInvestimentoMidia, matrizDistSplit, matrizMixSubcanais],
  );
  const liberado = (sub: SubCanalKey, mes: string): boolean => {
    const h = rampUpByMes.get(mes)?.horizonte;
    if (!h) return false;
    return subcanalLiberado(matrizBlocks, h, sub);
  };

  // Valor efetivo derivado (rateio) por célula — exibido como "auto".
  const efetivo = (sub: SubCanalKey, mes: string): number => {
    const l = subCanalByKey.get(cellKey(sub, mes));
    if (!l) return 0;
    return isInbound(sub) ? l.invest : l.leads;
  };

  // Estado: overrides explícitos por célula. Ausência = "auto" (rateio).
  // Descarta overrides de células travadas (não liberadas pela matriz) ou em
  // meses read-only — defensivo contra dados antigos / mudança de premissa.
  const buildInitial = (): Map<string, number> => {
    const m = new Map<string, number>();
    for (const o of overridesSubcanalMes) {
      if (isReadOnlyMes(o.mes)) continue;
      if (!liberado(o.subcanal, o.mes)) continue;
      m.set(cellKey(o.subcanal, o.mes), o.valor);
    }
    return m;
  };
  const [overrides, setOverrides] = useState<Map<string, number>>(buildInitial);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const lastSavedRef = useRef<string>(serialize(buildInitial()));
  useEffect(() => {
    const next = buildInitial();
    setOverrides(next);
    lastSavedRef.current = serialize(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overridesSubcanalMes]);

  // Soma dos overrides explícitos de um grupo num mês (exceto opcionalmente um sub).
  const somaGrupoMes = (mes: string, grupo: "inbound" | "outbound", exceto?: SubCanalKey) => {
    const subs = grupo === "inbound" ? INBOUND : OUTBOUND;
    let acc = 0;
    for (const s of subs) {
      if (s.key === exceto) continue;
      const v = overrides.get(cellKey(s.key, mes));
      if (v !== undefined) acc += v;
    }
    return acc;
  };

  // Máximo digitável numa célula: cap do mês − Σ outros overrides do grupo.
  const maxCelula = (sub: SubCanalKey, mes: string) => {
    const grupo = isInbound(sub) ? "inbound" : "outbound";
    const cap = grupo === "inbound" ? capInbound(mes) : capOutbound(mes);
    return Math.max(0, cap - somaGrupoMes(mes, grupo, sub));
  };

  function setCelula(sub: SubCanalKey, mes: string, valor: number) {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(cellKey(sub, mes), Math.max(0, valor));
      return next;
    });
  }
  function resetCelula(sub: SubCanalKey, mes: string) {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.delete(cellKey(sub, mes));
      return next;
    });
  }

  // Save debounced.
  useEffect(() => {
    if (serialize(overrides) === lastSavedRef.current) return;
    const timer = setTimeout(async () => {
      setStatus("saving");
      setErrorMsg(null);
      try {
        const payload = Array.from(overrides.entries())
          .map(([k, valor]) => {
            const [subcanal, mes] = k.split("|") as [SubCanalKey, string];
            return { mes, subcanal, valor };
          })
          .filter((o) => !isReadOnlyMes(o.mes) && liberado(o.subcanal, o.mes));
        const res = await fetch(`/api/units/${organizationId}/subcanal-mensal`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ overrides: payload }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setErrorMsg(body.error ?? "Não foi possível salvar.");
          setStatus("error");
          return;
        }
        lastSavedRef.current = serialize(overrides);
        setStatus("saved");
        router.refresh();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Erro inesperado.");
        setStatus("error");
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [overrides, organizationId, router]);

  const colgroup = useMemo(
    () => (
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
    ),
    [transicoesMeses],
  );

  return (
    <div className="rounded border border-border bg-card mb-5 w-full">
      <div className="border-b border-border bg-muted/20 py-2.5">
        <div className="sticky left-0 inline-flex items-baseline gap-2 px-4 flex-wrap">
          <h2 className="text-xs uppercase tracking-wider font-semibold text-foreground">
            Alocação por subcanal
          </h2>
          <span className="text-[10px] text-muted-foreground">
            — fixe o investimento (R$) de um subcanal inbound ou os leads de um outbound. O que sobra é rateado entre os não-editados. Cada grupo não pode passar do total do mês (Pace / leads OB). Células &quot;auto&quot; seguem o rateio das premissas
          </span>
          <StatusBadge status={status} errorMsg={errorMsg} />
        </div>
      </div>

      <table
        className="text-sm border-collapse table-fixed w-full"
        style={{ minWidth: MIN_TABLE_WIDTH }}
      >
        {colgroup}
        <thead>
          <tr>
            <th className="sticky top-0 left-0 z-50 bg-table-header text-table-header-foreground px-3 py-2 text-left text-[10px] uppercase tracking-wider border-r border-border"></th>
            {MESES.map((mes) => {
              const h = horizonteByMes?.get(mes);
              const isTransition = transicoesMeses?.has(mes) ?? false;
              return (
                <th
                  key={mes}
                  className={`sticky top-0 z-40 bg-table-header text-table-header-foreground font-medium px-3 py-2 text-right text-[10px] uppercase tracking-wider tabular-nums ${
                    isTransition ? "border-l-2 border-l-accent" : ""
                  }`}
                  title={h ? `${formatMesPt(mes)} — premissas: ${h}` : formatMesPt(mes)}
                >
                  <div className="flex flex-col items-end leading-tight">
                    <span>{mesCurto(mes)}</span>
                    {h && <span className="text-[9px] font-bold mt-0.5 tracking-wider text-warning/85">{h}</span>}
                  </div>
                </th>
              );
            })}
            <th className="sticky top-0 z-40 bg-accent/15 text-accent px-3 py-2 text-right text-[10px] uppercase tracking-wider tabular-nums font-semibold border-l-2 border-border">
              Total 2026
            </th>
          </tr>
        </thead>
        <tbody>
          <GrupoHeader label="Inbound — investimento (R$)" />
          {INBOUND.map((s) => (
            <LinhaSubcanal
              key={s.key}
              sub={s.key}
              label={s.label}
              grupo="inbound"
              overrides={overrides}
              efetivo={efetivo}
              maxCelula={maxCelula}
              isReadOnlyMes={isReadOnlyMes}
              isAntesDeOperar={isAntesDeOperar}
              liberado={liberado}
              capDoMes={capInbound}
              onEdit={setCelula}
              onReset={resetCelula}
            />
          ))}
          <GrupoHeader label="Outbound — leads" />
          {OUTBOUND.map((s) => (
            <LinhaSubcanal
              key={s.key}
              sub={s.key}
              label={s.label}
              grupo="outbound"
              overrides={overrides}
              efetivo={efetivo}
              maxCelula={maxCelula}
              isReadOnlyMes={isReadOnlyMes}
              isAntesDeOperar={isAntesDeOperar}
              liberado={liberado}
              capDoMes={capOutbound}
              onEdit={setCelula}
              onReset={resetCelula}
            />
          ))}
        </tbody>
      </table>
      <div className="border-t border-border bg-muted/20 py-2.5">
        <p className="sticky left-0 inline-block px-4 text-[10px] text-muted-foreground">
          Meses fechados e anteriores ao início da unidade seguem o realizado e não são editáveis.
          Use o ↺ para devolver uma célula ao rateio automático. Ao fixar um valor acima do
          disponível no mês, ele é limitado ao teto restante do grupo.
        </p>
      </div>
    </div>
  );
}

function GrupoHeader({ label }: { label: string }) {
  return (
    <tr className="bg-muted/40">
      <td
        colSpan={MESES.length + 2}
        className="sticky left-0 z-10 bg-muted/40 border-y border-border px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
      >
        {label}
      </td>
    </tr>
  );
}

function LinhaSubcanal({
  sub,
  label,
  grupo,
  overrides,
  efetivo,
  maxCelula,
  isReadOnlyMes,
  isAntesDeOperar,
  liberado,
  capDoMes,
  onEdit,
  onReset,
}: {
  sub: SubCanalKey;
  label: string;
  grupo: "inbound" | "outbound";
  overrides: Map<string, number>;
  efetivo: (sub: SubCanalKey, mes: string) => number;
  maxCelula: (sub: SubCanalKey, mes: string) => number;
  isReadOnlyMes: (mes: string) => boolean;
  isAntesDeOperar: (mes: string) => boolean;
  liberado: (sub: SubCanalKey, mes: string) => boolean;
  capDoMes: (mes: string) => number;
  onEdit: (sub: SubCanalKey, mes: string, valor: number) => void;
  onReset: (sub: SubCanalKey, mes: string) => void;
}) {
  const fmt = grupo === "inbound" ? formatBRL : formatInt;
  const totalAno = MESES.reduce((acc, mes) => {
    if (!liberado(sub, mes)) return acc;
    const ov = overrides.get(cellKey(sub, mes));
    return acc + (ov ?? efetivo(sub, mes));
  }, 0);

  return (
    <tr className="border-b border-border/60 hover:bg-muted/20">
      <td className="sticky left-0 z-10 bg-card border-r border-border pl-6 pr-3 py-2 text-xs text-foreground font-medium">
        <span className="inline-flex items-center gap-1">
          {label}
          <FieldHelp
            text={
              grupo === "inbound"
                ? "Investimento de mídia (R$) fixado neste subcanal. Vazio = rateio automático do total do mês pelos splits. Travado quando a matriz não libera o canal no horizonte do mês."
                : "Quantidade de leads fixada neste subcanal outbound. Vazio = rateio automático do total de leads OB pelo mix. Travado quando a matriz não libera o canal no horizonte do mês."
            }
            position="bottom"
          />
        </span>
      </td>
      {MESES.map((mes) => {
        if (isAntesDeOperar(mes)) {
          return (
            <td key={mes} className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground/40 bg-muted/10">
              —
            </td>
          );
        }
        // Travado: a matriz não liberou este subcanal no horizonte do mês.
        if (!liberado(sub, mes)) {
          return (
            <td
              key={mes}
              className="px-2 py-2 text-right bg-muted/20"
              title="Não liberado pela matriz para o horizonte deste mês"
            >
              <span className="inline-flex items-center justify-end gap-1 w-full text-[10px] uppercase tracking-wider text-muted-foreground/50">
                <Lock className="h-2.5 w-2.5" />
              </span>
            </td>
          );
        }
        if (isReadOnlyMes(mes)) {
          return (
            <td
              key={mes}
              className="px-3 py-2 text-right text-xs tabular-nums bg-info/5 text-muted-foreground"
              title="Mês fechado — segue o realizado"
            >
              {fmt(efetivo(sub, mes))}
            </td>
          );
        }
        const ov = overrides.get(cellKey(sub, mes));
        if (ov === undefined) {
          // Auto (rateio) — clicar começa um override no valor efetivo atual.
          return (
            <td key={mes} className="px-3 py-2 text-right">
              <button
                type="button"
                onClick={() => onEdit(sub, mes, Math.round(efetivo(sub, mes)))}
                title="Auto (rateio) — clique para fixar"
                className="w-full text-right text-xs tabular-nums text-muted-foreground/60 hover:text-foreground"
              >
                {fmt(efetivo(sub, mes))}
              </button>
            </td>
          );
        }
        const max = maxCelula(sub, mes) + ov; // disponível + o próprio valor
        const Cell = grupo === "inbound" ? CurrencyCell : IntegerCell;
        // Reset posicionado em absoluto na borda esquerda (área de padding, onde
        // não há dígitos — valores são right-aligned), aparecendo no hover. Assim
        // o input ocupa a largura cheia da coluna e o valor não fica cortado.
        return (
          <td key={mes} className="px-3 py-2 text-right relative group">
            <Cell
              isEditing
              value={ov}
              onChange={(v) => onEdit(sub, mes, v)}
              max={max}
              step={grupo === "inbound" ? 1000 : 1}
              inputClassName="w-full min-w-0"
            />
            <button
              type="button"
              onClick={() => onReset(sub, mes)}
              title={`Voltar ao automático (cap do mês: ${fmt(capDoMes(mes))})`}
              className="absolute left-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-3.5 w-3.5 rounded bg-card text-muted-foreground/70 opacity-0 group-hover:opacity-100 hover:text-accent transition-opacity"
            >
              <RotateCcw className="h-2.5 w-2.5" />
            </button>
          </td>
        );
      })}
      <td className="px-3 py-2 text-right bg-accent/5 border-l-2 border-border text-xs tabular-nums text-accent font-semibold">
        {fmt(totalAno)}
      </td>
    </tr>
  );
}

function serialize(m: Map<string, number>): string {
  return Array.from(m.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}=${v}`)
    .join(";");
}

function StatusBadge({ status, errorMsg }: { status: SaveStatus; errorMsg: string | null }) {
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
