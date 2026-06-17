"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Lock, RotateCcw, TriangleAlert } from "lucide-react";
import { CurrencyCell, IntegerCell } from "@/components/premissas/editable-cell";
import { formatBRL, formatInt } from "@/components/premissas/format";
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

/**
 * Viabilidade de uma célula fixada (subcanal × mês) — guardrail, não bloqueio.
 * Avaliada POR CÉLULA: "esse valor gera < 1 venda NESTE mês?". O funil é linear
 * no input de cada subcanal (won = input × eficiência), então derivamos a
 * eficiência da célula a partir do estado salvo (won/input daquela célula) e a
 * aplicamos ao valor que o usuário está digitando — o aviso atualiza ao vivo,
 * mesmo antes do save. `piso` é o menor valor que fecha 1 venda (`1/eficiência`),
 * já arredondado pra cima e blindado contra erro de float — serve tanto pro
 * tooltip quanto pra ação "subir pro piso" (1 clique). `naoConverte`: há input
 * mas o funil não produz won algum (conversões zeradas no mês), então piso = ∞.
 */
type Viab = { status: "sub" | "naoConverte"; liveWon: number; piso: number };

function viabTitle(v: Viab, fmt: (n: number) => string): string {
  if (v.status === "naoConverte") {
    return "Com as conversões atuais, este subcanal não gera nenhuma venda no horizonte.";
  }
  const wonTxt = v.liveWon.toFixed(2).replace(".", ",");
  const pisoTxt = Number.isFinite(v.piso) ? ` Piso ≈ ${fmt(v.piso)} para 1 venda no horizonte.` : "";
  return `Projeta ${wonTxt} venda no horizonte (< 1).${pisoTxt}`;
}

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

  // NOTA (integridade de dado): o editor NÃO encolhe nem regrava os overrides pra
  // caber no cap. O usuário digita um valor e ele é gravado exatamente como digitado.
  // O hard-cap (Σ do grupo ≤ total do mês) é aplicado só no CÁLCULO, pelo motor
  // (`alocacaoInboundEfetiva` / equivalente outbound), que escala proporcionalmente
  // ao derivar a alocação efetiva. Assim, se o total do mês cair (ex.: redução no
  // Pace) e voltar a subir, a alocação original do usuário é preservada — antes,
  // um clamp persistido sobrescrevia o valor digitado por uma versão reduzida.
  // `maxCelula` ainda impede DIGITAR acima do cap no fluxo normal.

  // Assinatura estável dos caps por mês — muda só quando o investimento total
  // (cap inbound) ou a capacidade outbound mudam. É a dependência que faz o
  // estado reagir à redução do total no Pace, mesmo sem mudança nos overrides.
  const capsSig = useMemo(
    () => MESES.map((m) => `${capInbound(m)}:${capOutbound(m)}`).join("|"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rampUpByMes],
  );

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
  // Ressincroniza com o banco quando os overrides salvos mudam OU quando o cap do
  // mês muda (a mudança de cap pode re-filtrar quais células seguem liberadas).
  // Guardamos SEMPRE o valor cru que o usuário digitou — nunca um valor reduzido
  // pelo cap (ver nota acima). lastSaved = raw → o save effect não dispara à toa
  // quando só o cap muda; o motor cuida do hard-cap no cálculo.
  useEffect(() => {
    const raw = buildInitial();
    setOverrides(raw);
    lastSavedRef.current = serialize(raw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overridesSubcanalMes, capsSig]);

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

  // Viabilidade por célula FIXADA (override) — ver `Viab`. Só avalia células com
  // valor fixado pelo usuário (não as "auto"), pra não pintar de vermelho canais
  // naturalmente pequenos que ninguém editou. Recomputa ao digitar (overrides) e
  // quando o forecast salvo volta (subCanalByKey, pós-refresh).
  const viabByCell = useMemo(() => {
    const m = new Map<string, Viab>();
    for (const [key, liveInput] of overrides) {
      const [sub, mes] = key.split("|") as [SubCanalKey, string];
      if (isReadOnlyMes(mes) || !liberado(sub, mes)) continue;
      const l = subCanalByKey.get(key);
      const savedInput = l ? (isInbound(sub) ? l.invest : l.leads) : 0;
      const savedWon = l ? l.won : 0;
      // Eficiência da célula (won por R$/lead) — invariante de escala (funil
      // linear), então vale pro valor que está sendo digitado agora.
      const eff = savedInput > 0 ? savedWon / savedInput : 0;
      const liveWon = eff * liveInput;
      if (savedWon <= 0 && savedInput > 0) {
        m.set(key, { status: "naoConverte", liveWon: 0, piso: Infinity });
      } else if (liveWon < 1) {
        // Menor valor que fecha 1 venda, arredondado pra cima (R$ inteiro /
        // lead inteiro). +1 de margem se o arredondamento de float ainda
        // deixar liveWon < 1 — garante que o clique sempre limpa o vermelho.
        let piso = eff > 0 ? Math.ceil(1 / eff) : Infinity;
        if (Number.isFinite(piso) && eff * piso < 1) piso += 1;
        m.set(key, { status: "sub", liveWon, piso });
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overrides, subCanalByKey]);

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
              viabByCell={viabByCell}
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
              viabByCell={viabByCell}
              onEdit={setCelula}
              onReset={resetCelula}
            />
          ))}
        </tbody>
      </table>
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
  viabByCell,
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
  viabByCell: Map<string, Viab>;
  onEdit: (sub: SubCanalKey, mes: string, valor: number) => void;
  onReset: (sub: SubCanalKey, mes: string) => void;
}) {
  const fmt = grupo === "inbound" ? formatBRL : formatInt;
  // Mês com célula em foco — ancora o popup de "ajustar pro mínimo".
  const [focusedMes, setFocusedMes] = useState<string | null>(null);
  // Linha "quebra" se qualquer célula fixada deste subcanal está inviável.
  const quebrasNaLinha = MESES.filter((mes) => viabByCell.has(cellKey(sub, mes))).length;
  const inviavel = quebrasNaLinha > 0;
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
          {inviavel && (
            <span
              title={`${quebrasNaLinha} ${quebrasNaLinha > 1 ? "meses geram" : "mês gera"} < 1 venda — valor fixado abaixo do piso de viabilidade.`}
              className="inline-flex items-center gap-0.5 text-destructive"
            >
              <TriangleAlert className="h-3 w-3" />
              <span className="text-[9px] font-bold uppercase tracking-wider">Quebra</span>
            </span>
          )}
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
          // Auto (rateio) — recebe a mesma borda tracejada amarela das células
          // editáveis (afinal é editável); o texto suave + ausência do ↺
          // distinguem do valor fixado. Clicar fixa no valor efetivo atual.
          return (
            <td key={mes} className="px-3 py-2 text-right">
              <button
                type="button"
                onClick={() => onEdit(sub, mes, Math.round(efetivo(sub, mes)))}
                title="Auto (rateio) — clique para fixar"
                className="inline-flex w-full items-center justify-end rounded border border-dashed border-warning bg-warning/5 px-1.5 py-0.5 text-right text-xs tabular-nums text-muted-foreground/70 hover:text-foreground"
              >
                {fmt(efetivo(sub, mes))}
              </button>
            </td>
          );
        }
        // Teto da célula = cap do mês − Σ dos OUTROS overrides do grupo
        // (`maxCelula` já exclui esta célula). Não soma `ov`: somar o próprio
        // valor deixaria a soma do grupo estourar o cap ao digitar.
        const max = maxCelula(sub, mes);
        const Cell = grupo === "inbound" ? CurrencyCell : IntegerCell;
        const cellViab = viabByCell.get(cellKey(sub, mes));
        // Reset posicionado em absoluto na borda esquerda (área de padding, onde
        // não há dígitos — valores são right-aligned), aparecendo no hover. Assim
        // o input ocupa a largura cheia da coluna e o valor não fica cortado.
        return (
          <td
            key={mes}
            className="px-3 py-2 text-right relative group"
            title={cellViab ? viabTitle(cellViab, fmt) : undefined}
            onFocus={() => setFocusedMes(mes)}
            onBlur={(e) => {
              // Só fecha se o foco saiu da célula de fato — clicar no botão do
              // popup (filho do td) mantém o popup aberto (relatedTarget interno).
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setFocusedMes((cur) => (cur === mes ? null : cur));
              }
            }}
          >
            <Cell
              isEditing
              value={ov}
              onChange={(v) => onEdit(sub, mes, v)}
              max={max}
              step={grupo === "inbound" ? 1000 : 1}
              inputClassName="w-full min-w-0"
              invalid={cellViab !== undefined}
            />
            <button
              type="button"
              onClick={() => onReset(sub, mes)}
              title={`Voltar ao automático (cap do mês: ${fmt(capDoMes(mes))})`}
              className="absolute left-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-3.5 w-3.5 rounded bg-card text-muted-foreground/70 opacity-0 group-hover:opacity-100 hover:text-accent transition-opacity"
            >
              <RotateCcw className="h-2.5 w-2.5" />
            </button>
            {focusedMes === mes &&
              cellViab?.status === "sub" &&
              Number.isFinite(cellViab.piso) &&
              cellViab.piso <= max && (
                // onMouseDown preventDefault mantém o foco no input ao clicar
                // dentro do popup, pra o onClick disparar em qualquer browser.
                <div
                  role="alert"
                  className="absolute right-0 top-full z-30 mt-1 w-52 rounded-md border border-destructive/50 bg-card p-2.5 text-left shadow-lg"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <div className="flex items-start gap-1.5">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                    <p className="text-[11px] leading-snug text-foreground">
                      Esse valor não fecha 1 venda no mês. Ajustar pro mínimo de{" "}
                      <span className="font-semibold tabular-nums">{fmt(cellViab.piso)}</span>?
                    </p>
                  </div>
                  <div className="mt-2 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        onEdit(sub, mes, cellViab.piso);
                        // Tira o foco do input pra ele ressincronizar o texto
                        // exibido com o novo valor (só sincroniza fora de foco).
                        (document.activeElement as HTMLElement | null)?.blur();
                      }}
                      className="rounded bg-destructive px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-destructive-foreground hover:opacity-90"
                    >
                      Aceitar mínimo
                    </button>
                  </div>
                </div>
              )}
          </td>
        );
      })}
      <td
        className={`px-3 py-2 text-right border-l-2 text-xs tabular-nums font-semibold ${
          inviavel ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-accent/5 text-accent"
        }`}
        title={
          inviavel
            ? `${quebrasNaLinha} ${quebrasNaLinha > 1 ? "meses fixados geram" : "mês fixado gera"} < 1 venda.`
            : undefined
        }
      >
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
