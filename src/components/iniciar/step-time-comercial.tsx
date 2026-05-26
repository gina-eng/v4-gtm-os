"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Info } from "lucide-react";
import { CurrencyCell, PercentCell } from "@/components/premissas/editable-cell";
import { formatBRL } from "@/components/premissas/format";
import { FieldHelp } from "@/components/ui/field-help";
import { WizardFooter } from "./wizard-footer";
import {
  CAPACIDADE_OPTIONS,
  CARGOS_COMERCIAIS,
  type MetricaOperacional,
  type TimeComercialMembro,
} from "@/lib/premissas/matriz-defaults";
import { CargoSelect } from "./cargo-select";

type Props = {
  organizationId: string;
  initialValues: TimeComercialMembro[];
  fromMatriz: boolean;
  metricasOperacionais: MetricaOperacional[];
};

function custoLinhaMes(m: TimeComercialMembro): number {
  return m.salario * (1 + m.comissaoPct / 100);
}

/**
 * Normaliza linhas que possam ter vindo do storage com shape antigo
 * (sem email/capacidadePct, com quantidade). Garante defaults sensatos.
 */
function normalizeRow(r: Partial<TimeComercialMembro> & Record<string, unknown>): TimeComercialMembro {
  return {
    email: typeof r.email === "string" ? r.email : "",
    cargo: typeof r.cargo === "string" ? r.cargo : "",
    salario: typeof r.salario === "number" ? r.salario : 0,
    comissaoPct: typeof r.comissaoPct === "number" ? r.comissaoPct : 0,
    capacidadePct:
      typeof r.capacidadePct === "number" &&
      (CAPACIDADE_OPTIONS as readonly number[]).includes(r.capacidadePct)
        ? r.capacidadePct
        : 100,
  };
}

function isValidEmail(v: string): boolean {
  // Validação leve — o backend faz a checagem definitiva.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function StepTimeComercial({
  organizationId,
  initialValues,
  fromMatriz,
  metricasOperacionais,
}: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<TimeComercialMembro[]>(
    () => initialValues.map(normalizeRow),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch<K extends keyof TimeComercialMembro>(
    idx: number,
    k: K,
    v: TimeComercialMembro[K],
  ) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [k]: v } : r)));
  }

  function addRow() {
    const usados = new Set(rows.map((r) => r.cargo));
    const sugestao = CARGOS_COMERCIAIS.find((c) => !usados.has(c)) ?? CARGOS_COMERCIAIS[0];
    setRows((prev) => [
      ...prev,
      { email: "", cargo: sugestao, salario: 0, comissaoPct: 0, capacidadePct: 100 },
    ]);
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleContinue() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/units/${organizationId}/setup`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "time-comercial", data: rows }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível salvar.");
        return;
      }
      router.push("/iniciar/metricas-operacionais");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSaving(false);
    }
  }

  const custoTotal = rows.reduce((acc, r) => acc + custoLinhaMes(r), 0);

  // Mapa cargo → wipLimit pra calcular capacidade-base por cargo (premissa da Matriz/unidade).
  const wipLimitByCargo = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of metricasOperacionais) m.set(x.cargo, x.wipLimit);
    return m;
  }, [metricasOperacionais]);

  // Agrupa o time por cargo + soma capacidade aplicando o % de cada pessoa.
  const summary = useMemo(() => {
    const agg = new Map<
      string,
      { cargo: string; pessoas: number; capacidade: number; capacidadeMax: number; temWip: boolean }
    >();
    for (const r of rows) {
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
    // Ordena seguindo a ordem dos cargos padrão; cargos custom vão no fim.
    const standardOrder = new Map<string, number>(
      CARGOS_COMERCIAIS.map((c, i) => [c, i] as const),
    );
    return Array.from(agg.values()).sort((a, b) => {
      const ia = standardOrder.get(a.cargo) ?? Number.POSITIVE_INFINITY;
      const ib = standardOrder.get(b.cargo) ?? Number.POSITIVE_INFINITY;
      if (ia !== ib) return ia - ib;
      return a.cargo.localeCompare(b.cargo);
    });
  }, [rows, wipLimitByCargo]);

  return (
    <>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">2 · Time Comercial</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Cadastre cada investidor com e-mail, cargo, salário, comissão e capacidade atual. Esses números alimentam o cálculo de CAC e da capacidade total do time.
        </p>
      </div>

      <div className="mb-4 rounded border border-info/30 bg-info/5 px-3 py-2 flex items-center gap-2 text-xs text-foreground">
        <Info className="h-3.5 w-3.5 text-info shrink-0" />
        <span>
          Valores pré-preenchidos vêm das <strong>premissas da Matriz</strong>.
          {fromMatriz
            ? " Ajuste para a realidade da sua unidade — a premissa da Matriz não é alterada."
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
                    E-mail
                    <FieldHelp text="E-mail da pessoa. Usado como identificador e pra futura associação ao usuário cadastrado." position="bottom" />
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1">
                    Cargo
                    <FieldHelp text="Posição/role no time comercial (LDR, BDR, SDR, CLOSER, KAM ou outro cargo customizado)." position="bottom" />
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1">
                    Salário Base
                    <FieldHelp text="Salário mensal bruto (CLT ou PJ), sem comissão. Em reais." position="bottom" />
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1">
                    Comissão %
                    <FieldHelp text="Percentual de comissão sobre o salário base — usado pra estimar custo total mensal do cargo." position="bottom" />
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1">
                    Capacidade Atual
                    <FieldHelp text="Quanto da capacidade-padrão do cargo a pessoa está entregando hoje (0–100%). Em rampagem geralmente fica abaixo de 100%." position="bottom" />
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1">
                    Custo/Mês
                    <FieldHelp text="Salário × (1 + Comissão %). Calculado automaticamente — entra no CAC dinâmico." position="bottom" />
                  </span>
                </th>
                <th className="bg-table-header h-8 w-8" aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {rows.map((m, idx) => {
                const emailInvalid = m.email.length > 0 && !isValidEmail(m.email);
                return (
                  <tr
                    key={idx}
                    className={`${idx % 2 === 0 ? "bg-card" : "bg-muted/30"} border-b border-border/60`}
                  >
                    <td className="px-2 py-2 text-xs">
                      <input
                        type="email"
                        value={m.email}
                        onChange={(e) => patch(idx, "email", e.target.value)}
                        placeholder="nome@empresa.com"
                        maxLength={255}
                        className={`w-56 h-7 rounded border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring ${
                          emailInvalid ? "border-destructive" : "border-input"
                        }`}
                      />
                    </td>
                    <td className="px-2 py-2 text-xs">
                      <CargoSelect
                        value={m.cargo}
                        onChange={(v) => patch(idx, "cargo", v)}
                      />
                    </td>
                    <td className="px-2 py-2 text-xs text-right">
                      <CurrencyCell
                        isEditing
                        value={m.salario}
                        onChange={(v) => patch(idx, "salario", v)}
                      />
                    </td>
                    <td className="px-2 py-2 text-xs text-right">
                      <PercentCell
                        isEditing
                        value={m.comissaoPct}
                        onChange={(v) => patch(idx, "comissaoPct", v)}
                      />
                    </td>
                    <td className="px-2 py-2 text-xs text-right">
                      <span className="inline-flex items-center px-1.5 py-0.5 border border-dashed border-warning bg-warning/5 rounded">
                        <select
                          value={m.capacidadePct}
                          onChange={(e) =>
                            patch(idx, "capacidadePct", Number(e.target.value))
                          }
                          className="bg-transparent text-xs focus:outline-none text-foreground font-medium tabular-nums"
                        >
                          {CAPACIDADE_OPTIONS.map((p) => (
                            <option key={p} value={p}>
                              {p}%
                            </option>
                          ))}
                        </select>
                      </span>
                    </td>
                    <td className="px-2 py-2 text-xs text-right tabular-nums text-success font-medium">
                      {formatBRL(custoLinhaMes(m))}
                    </td>
                    <td className="px-2">
                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-destructive"
                          aria-label="Remover investidor"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[11px] font-medium border border-dashed border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/40"
          >
            <Plus className="h-3 w-3" />
            Adicionar investidor
          </button>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Custo total mensal ({rows.length} {rows.length === 1 ? "pessoa" : "pessoas"})
            </div>
            <div className="text-xl font-bold text-accent tabular-nums">
              {formatBRL(custoTotal)}
            </div>
          </div>
        </div>
      </section>

      {/* Resumo por cargo — pessoas + capacidade efetiva contra a premissa da Matriz.
          Cards compactos pra evitar duas faixas bordô empilhadas (a tabela principal já tem). */}
      <section className="mt-4">
        <div className="mb-2 flex items-center gap-1.5">
          <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Capacidade do time por cargo
          </h3>
          <FieldHelp
            text="Soma as pessoas por cargo e aplica a capacidade atual de cada uma sobre a premissa da Matriz (WIP limit do cargo na Capacidade Operacional). Ex: premissa SDR = 200 reuniões/mês; pessoa em 50% = 100 reuniões/mês."
            position="bottom"
          />
        </div>
        {summary.length === 0 ? (
          <div className="rounded border border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
            Adicione investidores para ver a capacidade consolidada por cargo.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {summary.map((s) => {
              const wip = wipLimitByCargo.get(s.cargo);
              const pct =
                s.capacidadeMax > 0
                  ? Math.round((s.capacidade / s.capacidadeMax) * 100)
                  : null;
              const barColor =
                pct === null
                  ? "bg-muted"
                  : pct >= 90
                    ? "bg-success"
                    : pct >= 50
                      ? "bg-warning"
                      : "bg-destructive";
              return (
                <div
                  key={s.cargo}
                  className="rounded border border-border bg-card px-3 py-2"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold text-accent tabular-nums">
                      {s.cargo}
                    </span>
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
                        Matriz: {wip.toLocaleString("pt-BR")}/pessoa
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
                      <div
                        className={`h-full ${barColor} transition-[width]`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <WizardFooter
        onBack={() => router.push("/iniciar/horizontes")}
        onContinue={handleContinue}
        saving={saving}
        error={error}
      />
    </>
  );
}
