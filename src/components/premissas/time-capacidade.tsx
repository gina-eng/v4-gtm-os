"use client";

import { useMemo } from "react";
import { Plus, X } from "lucide-react";
import { CurrencyCell, IntegerCell, PercentCell } from "./editable-cell";
import { formatBRL } from "./format";
import { CargoSelect } from "@/components/iniciar/cargo-select";
import { FieldHelp } from "@/components/ui/field-help";
import {
  CAPACIDADE_OPTIONS,
  CARGOS_COMERCIAIS,
  cargoLabel,
  type MetricaOperacional,
  type TimeComercialMembro,
} from "@/lib/premissas/matriz-defaults";
import type { LinhaRampUp } from "@/lib/premissas/funil-reverso";
import {
  comissaoPessoa,
  custoLinhaMes,
  disponivelPorCargoDe,
  mesReferenciaComissao,
  producaoPessoa,
  receitaMesReferencia,
} from "@/lib/premissas/custo-time";
import { formatMesPt } from "@/lib/realizado/projecao";

export type CacContext = {
  investido: number;
  won: number;
  unidades: number;
} | null;

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** Colunas numéricas das métricas operacionais (proxy p/ capacity / CAC). */
const NUM_COLS: Array<{
  key: keyof MetricaOperacional;
  label: string;
  suffix?: string;
  help?: string;
}> = [
  {
    key: "wipLimit",
    label: "WIP Limit",
    suffix: "/mês",
    help: "Capacidade máxima por mês de cada cargo — a unidade muda conforme a posição: LDR, BDR e SDR medem leads; Closer mede reuniões realizadas; Account Manager mede contas.",
  },
  {
    key: "contratacao",
    label: "Contratação",
    suffix: "dias",
  },
  {
    key: "onboarding",
    label: "Onboarding",
    suffix: "dias",
  },
  {
    key: "rampagem",
    label: "Rampagem",
    suffix: "meses",
  },
  {
    key: "atingimentoMes",
    label: "Atinge 100%",
    suffix: "º mês",
  },
  {
    key: "permanencia",
    label: "Permanência",
    suffix: "meses",
  },
];

type Props = {
  team: TimeComercialMembro[];
  metrics: MetricaOperacional[];
  onTeamChange: (rows: TimeComercialMembro[]) => void;
  onMetricsChange: (rows: MetricaOperacional[]) => void;
  /** Premissa da Matriz por cargo (mesma ordem das métricas) — alimenta os badges de diferença. */
  metricsMatriz?: MetricaOperacional[];
  cacContext: CacContext;
  /** Ramp-up do forecast da unidade — base da comissão por produção. Ausente
   *  (ex.: passo do wizard, antes de existir forecast) ⇒ comissão zero, custo = salário. */
  linhasRampUp?: LinhaRampUp[];
  /** Data de início da unidade — define o mês de referência da comissão. */
  dataInicio?: string | null;
  readOnly?: boolean;
};

/**
 * Editor unificado de TIME COMERCIAL + CAPACIDADE OPERACIONAL com os cards de
 * "Capacidade do time por cargo" recalculados ao vivo a partir das duas tabelas.
 *
 * Totalmente controlado: o pai detém o estado e cuida da persistência. Usado no
 * passo fundido do wizard (/iniciar) e na aba Time & Capacidade do
 * /premissas-unidade. A capacidade efetiva mostrada nos cards é o "output" que
 * o forecast também consome (funil-reverso lê wipLimit × capacidadePct).
 */
export function TimeCapacidade({
  team,
  metrics,
  onTeamChange,
  onMetricsChange,
  metricsMatriz,
  cacContext,
  linhasRampUp,
  dataInicio = null,
  readOnly = false,
}: Props) {
  const editing = !readOnly;

  function patchMembro<K extends keyof TimeComercialMembro>(
    idx: number,
    k: K,
    v: TimeComercialMembro[K],
  ) {
    onTeamChange(team.map((r, i) => (i === idx ? { ...r, [k]: v } : r)));
  }
  function addMembro() {
    const usados = new Set(team.map((r) => r.cargo));
    const sugestao = CARGOS_COMERCIAIS.find((c) => !usados.has(c)) ?? CARGOS_COMERCIAIS[0];
    onTeamChange([
      ...team,
      { email: "", cargo: sugestao, salario: 0, comissaoPct: 0, capacidadePct: 100 },
    ]);
  }
  function removeMembro(idx: number) {
    onTeamChange(team.filter((_, i) => i !== idx));
  }
  function patchMetric<K extends keyof MetricaOperacional>(
    idx: number,
    k: K,
    v: MetricaOperacional[K],
  ) {
    onMetricsChange(metrics.map((r, i) => (i === idx ? { ...r, [k]: v } : r)));
  }

  // Comissão sobre o resultado (produção) que cada pessoa ajuda a gerar — não
  // sobre o salário. Base = receita projetada do mês de referência, rateada por
  // capacidade do cargo (mesma lógica do /time-comercial). Sem `linhasRampUp`
  // (ex.: wizard antes do forecast), a receita é 0 ⇒ custo = só salário.
  const disponivelPorCargo = useMemo(() => disponivelPorCargoDe(team), [team]);
  const receitaMesRef = useMemo(
    () => receitaMesReferencia(linhasRampUp, dataInicio),
    [linhasRampUp, dataInicio],
  );
  const mesReferencia = useMemo(() => mesReferenciaComissao(dataInicio), [dataInicio]);

  const custoTotal = team.reduce(
    (acc, r) => acc + custoLinhaMes(r, receitaMesRef, disponivelPorCargo),
    0,
  );

  // CAC dinâmico (mesma fórmula da seção antiga): (custo do time + investido) / won,
  // do último mês fechado. Só exibido quando há contexto (ex.: /premissas-unidade).
  const cacCalculado =
    cacContext && cacContext.won > 0
      ? (custoTotal + cacContext.investido) / cacContext.won
      : null;

  // Mapa cargo → wipLimit (premissa) pra calcular capacidade-base por cargo.
  const wipLimitByCargo = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of metrics) m.set(x.cargo, x.wipLimit);
    return m;
  }, [metrics]);

  // Agrupa o time por cargo e aplica a capacidade % de cada pessoa sobre o WIP.
  // Recalcula quando time OU métricas mudam — é o "output" ao vivo.
  const summary = useMemo(() => {
    const agg = new Map<
      string,
      { cargo: string; pessoas: number; capacidade: number; capacidadeMax: number; temWip: boolean }
    >();
    for (const r of team) {
      if (!r.cargo) continue;
      const wip = wipLimitByCargo.get(r.cargo);
      const cur = agg.get(r.cargo) ?? {
        cargo: r.cargo,
        pessoas: 0,
        capacidade: 0,
        capacidadeMax: 0,
        temWip: wip !== undefined,
      };
      cur.pessoas += 1;
      if (wip !== undefined) {
        cur.capacidade += (wip * r.capacidadePct) / 100;
        cur.capacidadeMax += wip;
        cur.temWip = true;
      }
      agg.set(r.cargo, cur);
    }
    const standardOrder = new Map<string, number>(
      CARGOS_COMERCIAIS.map((c, i) => [c, i] as const),
    );
    return Array.from(agg.values()).sort((a, b) => {
      const ia = standardOrder.get(a.cargo) ?? Number.POSITIVE_INFINITY;
      const ib = standardOrder.get(b.cargo) ?? Number.POSITIVE_INFINITY;
      if (ia !== ib) return ia - ib;
      return a.cargo.localeCompare(b.cargo);
    });
  }, [team, wipLimitByCargo]);

  return (
    <div className="flex flex-col gap-6">
      {/* ===================== TIME COMERCIAL ===================== */}
      <section>
        <div className="mb-2 flex items-center gap-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-accent">
            Time Comercial
          </h3>
        </div>
        <div className="rounded border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <Th>E-mail</Th>
                  <Th>Cargo</Th>
                  <Th align="right">Salário Base</Th>
                  <Th align="right">Comissão %</Th>
                  <Th align="right">Capacidade Atual</Th>
                  <Th align="right">Custo/Mês</Th>
                  {editing && <th className="bg-table-header h-8 w-8" aria-label="Ações" />}
                </tr>
              </thead>
              <tbody>
                {team.map((m, idx) => {
                  const emailInvalid = m.email.length > 0 && !isValidEmail(m.email);
                  return (
                    <tr
                      key={idx}
                      className={`${idx % 2 === 0 ? "bg-card" : "bg-muted/30"} border-b border-border/60`}
                    >
                      <td className="px-2 py-2 text-xs">
                        {editing ? (
                          <input
                            type="email"
                            value={m.email}
                            onChange={(e) => patchMembro(idx, "email", e.target.value)}
                            placeholder="nome@empresa.com"
                            maxLength={255}
                            className={`w-56 h-7 rounded border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring ${
                              emailInvalid ? "border-destructive" : "border-input"
                            }`}
                          />
                        ) : (
                          <span className="text-foreground">{m.email || "—"}</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-xs font-medium text-accent">
                        {editing ? (
                          <CargoSelect value={m.cargo} onChange={(v) => patchMembro(idx, "cargo", v)} />
                        ) : (
                          cargoLabel(m.cargo)
                        )}
                      </td>
                      <td className="px-2 py-2 text-xs text-right">
                        <CurrencyCell isEditing={editing} value={m.salario} onChange={(v) => patchMembro(idx, "salario", v)} />
                      </td>
                      <td className="px-2 py-2 text-xs text-right">
                        <PercentCell isEditing={editing} value={m.comissaoPct} onChange={(v) => patchMembro(idx, "comissaoPct", v)} />
                      </td>
                      <td className="px-2 py-2 text-xs text-right">
                        {editing ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 border border-dashed border-warning bg-warning/5 rounded">
                            <select
                              value={m.capacidadePct}
                              onChange={(e) => patchMembro(idx, "capacidadePct", Number(e.target.value))}
                              className="bg-transparent text-xs focus:outline-none text-foreground font-medium tabular-nums"
                            >
                              {CAPACIDADE_OPTIONS.map((p) => (
                                <option key={p} value={p}>{p}%</option>
                              ))}
                            </select>
                          </span>
                        ) : (
                          <span className="tabular-nums">{m.capacidadePct}%</span>
                        )}
                      </td>
                      <td
                        className="px-2 py-2 text-xs text-right tabular-nums text-success font-medium"
                        title={
                          receitaMesRef > 0
                            ? `${formatBRL(m.salario)} salário + ${formatBRL(comissaoPessoa(m, receitaMesRef, disponivelPorCargo))} comissão (${m.comissaoPct}% da produção ${formatBRL(producaoPessoa(m, receitaMesRef, disponivelPorCargo))} atribuída no mês de ${formatMesPt(mesReferencia)})`
                            : `${formatBRL(m.salario)} salário — comissão entra quando houver forecast de receita`
                        }
                      >
                        {formatBRL(custoLinhaMes(m, receitaMesRef, disponivelPorCargo))}
                      </td>
                      {editing && (
                        <td className="px-2">
                          {team.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeMembro(idx)}
                              className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-destructive"
                              aria-label="Remover investidor"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center justify-between gap-3">
            {editing ? (
              <button
                type="button"
                onClick={addMembro}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[11px] font-medium border border-dashed border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/40"
              >
                <Plus className="h-3 w-3" />
                Adicionar investidor
              </button>
            ) : (
              <span />
            )}
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Custo total mensal ({team.length} {team.length === 1 ? "pessoa" : "pessoas"})
              </div>
              <div className="text-xl font-bold text-accent tabular-nums">{formatBRL(custoTotal)}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== CAPACIDADE OPERACIONAL ===================== */}
      <section>
        <div className="mb-2 flex items-center gap-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-accent">
            Capacidade Operacional
          </h3>
        </div>
        <div className="rounded border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <Th>Cargo</Th>
                  {NUM_COLS.map((c) => (
                    <Th key={c.key as string} align="right">
                      {c.label}
                      {c.suffix && <span className="text-table-header-foreground/60 normal-case"> ({c.suffix})</span>}
                      {c.help && <FieldHelp text={c.help} className="ml-1" />}
                    </Th>
                  ))}
                  <Th align="right">Turnover/Mês</Th>
                  <Th align="right">Ligações/Mês</Th>
                  <Th align="right">Conexão %</Th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((r, idx) => (
                  <tr
                    key={idx}
                    className={`${idx % 2 === 0 ? "bg-card" : "bg-muted/30"} border-b border-border/60`}
                  >
                    <td className="px-2 py-2 text-xs font-medium text-accent">
                      {editing ? (
                        <CargoSelect value={r.cargo} onChange={(v) => patchMetric(idx, "cargo", v)} />
                      ) : (
                        cargoLabel(r.cargo)
                      )}
                    </td>
                    {NUM_COLS.map((c) => (
                      <td key={c.key as string} className="px-2 py-2 text-xs text-right">
                        <IntegerCell
                          isEditing={editing}
                          value={r[c.key] as number}
                          matrizValue={metricsMatriz?.[idx]?.[c.key] as number | undefined}
                          onChange={(v) => patchMetric(idx, c.key, v as MetricaOperacional[typeof c.key])}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-2 text-xs text-right">
                      <PercentCell
                        isEditing={editing}
                        value={r.turnoverMesPct}
                        matrizValue={metricsMatriz?.[idx]?.turnoverMesPct}
                        onChange={(v) => patchMetric(idx, "turnoverMesPct", v)}
                        digits={1}
                      />
                    </td>
                    <td className="px-2 py-2 text-xs text-right">
                      <IntegerCell
                        isEditing={editing}
                        value={r.ligacoesMes}
                        matrizValue={metricsMatriz?.[idx]?.ligacoesMes}
                        onChange={(v) => patchMetric(idx, "ligacoesMes", v)}
                        inputClassName="w-14"
                      />
                    </td>
                    <td className="px-2 py-2 text-xs text-right">
                      <PercentCell
                        isEditing={editing}
                        value={r.conexaoPct}
                        matrizValue={metricsMatriz?.[idx]?.conexaoPct}
                        onChange={(v) => patchMetric(idx, "conexaoPct", v)}
                        digits={0}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ===================== CARDS (output ao vivo) ===================== */}
      <section>
        <div className="mb-2 flex items-center gap-1.5">
          <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Capacidade do time por cargo
          </h3>
        </div>
        {summary.length === 0 ? (
          <div className="rounded border border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
            Adicione investidores para ver a capacidade consolidada por cargo.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {summary.map((s) => {
              const wip = wipLimitByCargo.get(s.cargo);
              const pct = s.capacidadeMax > 0 ? Math.round((s.capacidade / s.capacidadeMax) * 100) : null;
              const barColor =
                pct === null ? "bg-muted" : pct >= 90 ? "bg-success" : pct >= 50 ? "bg-warning" : "bg-destructive";
              return (
                <div key={s.cargo} className="rounded border border-border bg-card px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold text-accent">{cargoLabel(s.cargo)}</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {s.pessoas} {s.pessoas === 1 ? "pessoa" : "pessoas"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-1.5">
                    <span className="text-lg font-bold text-success tabular-nums leading-none">
                      {s.temWip ? Math.round(s.capacidade).toLocaleString("pt-BR") : "—"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">/ mês</span>
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground tabular-nums">
                    {wip !== undefined ? (
                      <>
                        {wip.toLocaleString("pt-BR")}/pessoa
                        {pct !== null && (
                          <>
                            {" · "}
                            <span className="text-foreground/80">{pct}%</span> do potencial
                          </>
                        )}
                      </>
                    ) : (
                      "Sem WIP definido para esse cargo"
                    )}
                  </div>
                  {pct !== null && (
                    <div
                      className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden"
                      title={`${pct}% de ${Math.round(s.capacidadeMax).toLocaleString("pt-BR")}`}
                    >
                      <div className={`h-full ${barColor} transition-[width]`} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th
      className={`bg-table-header text-table-header-foreground h-8 font-medium px-2 py-1.5 text-[10px] uppercase tracking-wider whitespace-nowrap ${alignClass}`}
    >
      {children}
    </th>
  );
}
