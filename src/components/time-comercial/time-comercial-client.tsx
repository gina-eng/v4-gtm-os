"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Plus, X } from "lucide-react";
import { CurrencyCell, PercentCell } from "@/components/premissas/editable-cell";
import { formatBRL, formatInt } from "@/components/premissas/format";
import { CargoSelect } from "@/components/iniciar/cargo-select";
import {
  CAPACIDADE_OPTIONS,
  CARGOS_COMERCIAIS,
  cargoLabel,
  type Horizonte,
  type MetricaOperacional,
  type TimeComercialMembro,
} from "@/lib/premissas/matriz-defaults";
import {
  calcularPlanoContratacao,
  type LinhaRampUp,
  type PlanoContratacaoCargo,
} from "@/lib/premissas/funil-reverso";
import {
  comissaoPessoa as calcComissao,
  custoLinhaMes as calcCustoMes,
  disponivelPorCargoDe,
  mesReferenciaComissao,
  producaoPessoa as calcProducao,
} from "@/lib/premissas/custo-time";
import { formatMesPt, getMesAncora, MESES_ANO_2026 } from "@/lib/realizado/projecao";

type Props = {
  organizationId: string;
  organizationName: string;
  horizonteAtual: Horizonte;
  dataInicio: string | null;
  timeComercial: TimeComercialMembro[];
  metricasOperacionais: MetricaOperacional[];
  linhasRampUp: LinhaRampUp[];
};

const MESES = MESES_ANO_2026 as readonly string[];

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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function rowsEqual(a: TimeComercialMembro[], b: TimeComercialMembro[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.email !== y.email ||
      x.cargo !== y.cargo ||
      x.salario !== y.salario ||
      x.comissaoPct !== y.comissaoPct ||
      x.capacidadePct !== y.capacidadePct
    ) {
      return false;
    }
  }
  return true;
}

function mesCurto(mes: string): string {
  return formatMesPt(mes).split(" ")[0] ?? mes;
}

export function TimeComercialClient({
  organizationId,
  organizationName,
  horizonteAtual,
  dataInicio,
  timeComercial,
  metricasOperacionais,
  linhasRampUp,
}: Props) {
  const router = useRouter();
  const initial = useMemo(() => timeComercial.map(normalizeRow), [timeComercial]);
  const [rows, setRows] = useState<TimeComercialMembro[]>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty = !rowsEqual(rows, initial);

  function patch<K extends keyof TimeComercialMembro>(
    idx: number,
    k: K,
    v: TimeComercialMembro[K],
  ) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [k]: v } : r)));
    setSavedAt(null);
  }

  function addRow() {
    const usados = new Set(rows.map((r) => r.cargo));
    const sugestao = CARGOS_COMERCIAIS.find((c) => !usados.has(c)) ?? CARGOS_COMERCIAIS[0];
    setRows((prev) => [
      ...prev,
      { email: "", cargo: sugestao, salario: 0, comissaoPct: 0, capacidadePct: 100 },
    ]);
    setSavedAt(null);
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
    setSavedAt(null);
  }

  async function handleSave() {
    if (saving || !dirty) return;
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
      setSavedAt(Date.now());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSaving(false);
    }
  }

  // Disponível por cargo = soma da capacidadePct/100 das pessoas com aquele cargo.
  const disponivelPorCargo = useMemo(() => disponivelPorCargoDe(rows), [rows]);

  const rampUpByMes = useMemo(() => {
    const m = new Map<string, LinhaRampUp>();
    for (const l of linhasRampUp) m.set(l.mes, l);
    return m;
  }, [linhasRampUp]);

  // Mês de referência pra comissão: onde a unidade está agora (mês corrente),
  // com piso no início de operação e teto no fim do horizonte do forecast.
  const mesReferencia = useMemo(() => mesReferenciaComissao(dataInicio), [dataInicio]);

  // Receita projetada do mês de referência — base da comissão por produção.
  const receitaMesRef = rampUpByMes.get(mesReferencia)?.recTotal ?? 0;

  // Custo/comissão por pessoa: comissão sobre a produção (resultado) gerada, não
  // sobre o salário. Lógica única em @/lib/premissas/custo-time.
  const producaoPessoa = (m: TimeComercialMembro): number =>
    calcProducao(m, receitaMesRef, disponivelPorCargo);
  const comissaoPessoa = (m: TimeComercialMembro): number =>
    calcComissao(m, receitaMesRef, disponivelPorCargo);
  const custoLinhaMes = (m: TimeComercialMembro): number =>
    calcCustoMes(m, receitaMesRef, disponivelPorCargo);

  const custoTotal = rows.reduce((acc, r) => acc + custoLinhaMes(r), 0);

  const cargos = useMemo(
    () => metricasOperacionais.map((x) => x.cargo),
    [metricasOperacionais],
  );

  const metricaByCargo = useMemo(
    () => new Map(metricasOperacionais.map((m) => [m.cargo, m])),
    [metricasOperacionais],
  );

  // Índice do mês-âncora (abertura da unidade) dentro de 2026 — base do plano.
  const mesAncoraIdx = useMemo(() => {
    const i = MESES.indexOf(getMesAncora(dataInicio));
    return i < 0 ? 0 : i;
  }, [dataInicio]);

  // Plano de contratação por cargo (lead time + rampagem). Reage às edições
  // não salvas do time via `disponivelPorCargo`; o `necessário` vem do forecast.
  const planoByCargo = useMemo(() => {
    const m = new Map<string, PlanoContratacaoCargo>();
    for (const cargo of cargos) {
      const metrica = metricaByCargo.get(cargo);
      if (!metrica) continue;
      const necessarioPorMes = MESES.map(
        (mes) => rampUpByMes.get(mes)?.headcount[cargo] ?? 0,
      );
      m.set(
        cargo,
        calcularPlanoContratacao(
          cargo,
          necessarioPorMes,
          disponivelPorCargo.get(cargo) ?? 0,
          metrica,
          mesAncoraIdx,
        ),
      );
    }
    return m;
  }, [cargos, metricaByCargo, rampUpByMes, disponivelPorCargo, mesAncoraIdx]);

  // Headcount total contratado (folha) por mês = soma do gross-up de cada cargo.
  const hcContratadoByMes = useMemo(() => {
    const m = new Map<string, number>();
    for (const mes of MESES) {
      let total = 0;
      for (const plano of planoByCargo.values()) {
        const linha = plano.porMes.find((p) => p.mes === mes);
        total += linha?.hcContratado ?? 0;
      }
      m.set(mes, total);
    }
    return m;
  }, [planoByCargo]);

  const totalVagasAno = useMemo(
    () => Array.from(planoByCargo.values()).reduce((a, p) => a + p.totalVagas, 0),
    [planoByCargo],
  );

  const picoHc = linhasRampUp.reduce((a, l) => Math.max(a, l.hcTotal), 0);

  const mesInicioFmt = dataInicio
    ? formatMesPt(dataInicio.slice(0, 7))
    : null;

  return (
    <div className="w-full">
      {/* ===== Cabeçalho ===== */}
      <div className="mb-4">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="flex items-end gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-foreground">Time Comercial</h1>
            <span
              className="inline-flex items-center rounded border border-border bg-muted px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              title="Horizonte cadastrado da unidade"
            >
              {horizonteAtual}
            </span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Cadastre cada pessoa do time comercial. A capacidade-padrão de cada cargo define o WIP limit; a capacidade atual da pessoa modula sobre isso. O cálculo de HC necessário usa o forecast 2026.
        </p>
      </div>

      {/* ===== Editor do time ===== */}
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-foreground">Cadastro</h2>
        <div className="flex items-center gap-2">
          {savedAt && !dirty && (
            <span className="text-[11px] text-success">Salvo.</span>
          )}
          {error && (
            <span className="text-[11px] text-destructive">{error}</span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="inline-flex items-center justify-center h-8 px-3 rounded text-xs font-medium bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      <section className="rounded border border-border bg-card overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  E-mail
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  Cargo
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  Salário Base
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  Comissão %
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  Capacidade Atual
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1">
                    Custo/Mês
                  </span>
                </th>
                <th className="bg-table-header h-8 w-8" aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-xs text-muted-foreground"
                  >
                    Nenhuma pessoa cadastrada ainda. Use o botão abaixo para adicionar.
                  </td>
                </tr>
              )}
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
                    <td
                      className="px-2 py-2 text-xs text-right tabular-nums text-success font-medium"
                      title={`${formatBRL(m.salario)} salário + ${formatBRL(comissaoPessoa(m))} comissão (${m.comissaoPct}% da produção ${formatBRL(producaoPessoa(m))} atribuída no mês de ${formatMesPt(mesReferencia)})`}
                    >
                      {formatBRL(custoLinhaMes(m))}
                    </td>
                    <td className="px-2">
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-destructive"
                        aria-label="Remover pessoa"
                      >
                        <X className="h-3 w-3" />
                      </button>
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
            Adicionar pessoa
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

      {/* ===== Tabela: HC necessário, plano de contratação e gap ===== */}
      <div className="mb-3 flex items-end justify-between gap-3 flex-wrap">
        <div className="max-w-3xl">
          <h2 className="text-sm font-semibold text-foreground">Time necessário e plano de contratação (Forecast 2026)</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            <strong>Necessário</strong> = ceil(volume ÷ wipLimit). <strong>Time atual</strong> = soma da capacidade das pessoas cadastradas acima (pronto, constante). <strong>Abrir vaga</strong> = quando contratar para a cadeira render 100% no mês certo, descontando lead time (contratação + onboarding) e rampagem do cargo. <strong>HC contratado</strong> = pessoas na folha, incluindo quem ainda rampa. <strong>Gap</strong> = necessário − produtivo projetado (já considera a rampa das novas vagas).
            {mesInicioFmt && (
              <>
                {" "}Meses anteriores a <strong>{mesInicioFmt}</strong> ficam fora da operação da unidade e não consomem HC.
              </>
            )}
          </p>
        </div>
        <div className="flex items-stretch gap-2">
          <div className="rounded border border-border bg-card px-3 py-1.5 text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Pico de HC em 2026
            </div>
            <div className="text-base font-semibold text-accent tabular-nums">
              {formatInt(picoHc)}
            </div>
          </div>
          <div className="rounded border border-border bg-card px-3 py-1.5 text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Vagas a abrir no ano
            </div>
            <div className="text-base font-semibold text-accent tabular-nums">
              {formatInt(totalVagasAno)}
            </div>
          </div>
        </div>
      </div>

      {!dirty && rows.length > 0 ? null : dirty ? (
        <div className="mb-3 rounded border border-info/30 bg-info/5 px-3 py-2 flex items-center gap-2 text-xs text-foreground">
          <Info className="h-3.5 w-3.5 text-info shrink-0" />
          <span>
            Você tem alterações não salvas. <strong>Time atual</strong> e o <strong>plano de contratação</strong> já refletem as mudanças; o resto do forecast (Necessário) atualiza após salvar.
          </span>
        </div>
      ) : null}

      <section className="rounded border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="sticky left-0 z-10 bg-table-header text-table-header-foreground h-8 font-medium text-left px-3 py-1.5 text-[10px] uppercase tracking-wider border-r border-border min-w-[220px]">
                  Cargo / Linha
                </th>
                {MESES.map((mes) => (
                  <th
                    key={mes}
                    className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-3 py-1.5 text-[10px] uppercase tracking-wider min-w-[88px]"
                  >
                    {mesCurto(mes)}
                  </th>
                ))}
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-3 py-1.5 text-[10px] uppercase tracking-wider border-l-2 border-border min-w-[110px]">
                  Pico 2026
                </th>
              </tr>
            </thead>
            <tbody>
              {cargos.length === 0 && (
                <tr>
                  <td
                    colSpan={MESES.length + 2}
                    className="px-3 py-8 text-center text-xs text-muted-foreground"
                  >
                    Nenhum cargo configurado em Capacidade Operacional. Configure em /premissas para ver o cálculo de HC necessário.
                  </td>
                </tr>
              )}
              {cargos.map((cargo) => (
                <CargoBlock
                  key={cargo}
                  cargo={cargo}
                  rampUpByMes={rampUpByMes}
                  disponivel={disponivelPorCargo.get(cargo) ?? 0}
                  plano={planoByCargo.get(cargo)}
                />
              ))}
              {/* HC Total (necessário) — pico do ano */}
              {cargos.length > 0 && (
                <tr className="border-b border-border/60 bg-muted/20 font-semibold">
                  <td className="sticky left-0 z-10 bg-muted/40 border-r border-border px-3 py-2 text-xs text-foreground">
                    HC Total (necessário)
                  </td>
                  {MESES.map((mes) => {
                    const v = rampUpByMes.get(mes)?.hcTotal ?? 0;
                    const isFechado = rampUpByMes.get(mes)?.isFechado ?? false;
                    return (
                      <td
                        key={mes}
                        className={`px-3 py-2 text-xs text-right tabular-nums ${
                          isFechado ? "text-muted-foreground" : "text-foreground"
                        }`}
                      >
                        {v === 0 ? "—" : formatInt(v)}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-xs text-right tabular-nums bg-accent/10 font-bold text-foreground border-l-2 border-border">
                    {picoHc === 0 ? "—" : formatInt(picoHc)}
                  </td>
                </tr>
              )}
              {/* HC Total contratado (folha) — gross-up com quem ainda rampa */}
              {cargos.length > 0 && (
                <tr className="border-b border-border bg-muted/20 font-semibold">
                  <td className="sticky left-0 z-10 bg-muted/40 border-r border-border px-3 py-2 text-xs text-foreground">
                    HC Total contratado (folha)
                  </td>
                  {MESES.map((mes) => {
                    const v = hcContratadoByMes.get(mes) ?? 0;
                    const isFechado = rampUpByMes.get(mes)?.isFechado ?? false;
                    return (
                      <td
                        key={mes}
                        className={`px-3 py-2 text-xs text-right tabular-nums ${
                          isFechado ? "text-muted-foreground" : "text-foreground"
                        }`}
                      >
                        {v === 0
                          ? "—"
                          : v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-xs text-right tabular-nums bg-accent/10 font-bold text-foreground border-l-2 border-border">
                    {(() => {
                      const pico = Math.max(0, ...Array.from(hcContratadoByMes.values()));
                      return pico === 0
                        ? "—"
                        : pico.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
                    })()}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const fmt1 = (n: number): string =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

function CargoBlock({
  cargo,
  rampUpByMes,
  disponivel,
  plano,
}: {
  cargo: string;
  rampUpByMes: Map<string, LinhaRampUp>;
  disponivel: number;
  plano?: PlanoContratacaoCargo;
}) {
  const planoByMes = useMemo(
    () => new Map((plano?.porMes ?? []).map((p) => [p.mes, p])),
    [plano],
  );
  const necessarioByMes = new Map<string, number>();
  for (const mes of MESES) {
    necessarioByMes.set(mes, rampUpByMes.get(mes)?.headcount[cargo] ?? 0);
  }
  const picoNecessario = Math.max(...Array.from(necessarioByMes.values()), 0);
  const picoHcContratado = Math.max(
    0,
    ...(plano?.porMes ?? []).map((p) => p.hcContratado),
  );
  // Pior gap do ano (apenas meses em operação) — referência da coluna lateral.
  const picoGap = Math.max(
    0,
    ...(plano?.porMes ?? [])
      .filter((p) => p.necessario > 0)
      .map((p) => p.gap),
  );
  const leadLabel = plano
    ? `Lead ${plano.leadMeses}m (contratação+onboarding) + rampa ${plano.rampaMeses}m = ${plano.leadTotal}m da vaga até 100% do WIP`
    : undefined;

  return (
    <>
      <tr className="border-b border-border/60 bg-muted/30 font-semibold">
        <td className="sticky left-0 z-10 bg-muted/40 border-r border-border px-3 py-2 text-xs text-foreground">
          {cargoLabel(cargo)}
        </td>
        <td colSpan={MESES.length + 1} className="bg-muted/30" />
      </tr>
      {/* Necessário */}
      <tr className="border-b border-border/60 hover:bg-muted/20">
        <td className="sticky left-0 z-10 bg-card border-r border-border pl-8 pr-3 py-2 text-xs text-muted-foreground font-medium">
          Necessário
        </td>
        {MESES.map((mes) => {
          const v = necessarioByMes.get(mes) ?? 0;
          const isFechado = rampUpByMes.get(mes)?.isFechado ?? false;
          return (
            <td
              key={mes}
              className={`px-3 py-2 text-xs text-right tabular-nums ${
                isFechado ? "text-muted-foreground" : "text-foreground"
              }`}
            >
              {v === 0 ? "—" : formatInt(v)}
            </td>
          );
        })}
        <td className="px-3 py-2 text-xs text-right tabular-nums bg-accent/10 font-semibold text-foreground border-l-2 border-border">
          {picoNecessario === 0 ? "—" : formatInt(picoNecessario)}
        </td>
      </tr>
      {/* Time atual — pronto, constante no ano */}
      <tr className="border-b border-border/60 hover:bg-muted/20">
        <td className="sticky left-0 z-10 bg-card border-r border-border pl-8 pr-3 py-2 text-xs text-muted-foreground font-medium">
          Time atual
        </td>
        {MESES.map((mes) => (
          <td
            key={mes}
            className="px-3 py-2 text-xs text-right tabular-nums text-muted-foreground"
          >
            {disponivel === 0 ? "—" : fmt1(disponivel)}
          </td>
        ))}
        <td className="px-3 py-2 text-xs text-right tabular-nums bg-accent/10 font-semibold text-foreground border-l-2 border-border">
          {disponivel === 0 ? "—" : fmt1(disponivel)}
        </td>
      </tr>
      {/* Abrir vaga — plano de contratação (lead time + rampagem) */}
      <tr className="border-b border-border/60 hover:bg-muted/20">
        <td
          className="sticky left-0 z-10 bg-card border-r border-border pl-8 pr-3 py-2 text-xs text-muted-foreground font-medium"
          title={leadLabel}
        >
          Abrir vaga
        </td>
        {MESES.map((mes) => {
          const p = planoByMes.get(mes);
          const v = p?.abrirVagas ?? 0;
          return (
            <td
              key={mes}
              className={`px-3 py-2 text-xs text-right tabular-nums ${
                v === 0
                  ? "text-muted-foreground"
                  : p?.abrirUrgente
                    ? "text-destructive font-semibold"
                    : "text-foreground font-medium"
              }`}
              title={
                v > 0 && p?.abrirUrgente
                  ? "Atrasado: a vaga já deveria estar aberta — contratar o quanto antes."
                  : undefined
              }
            >
              {v === 0 ? "—" : (p?.abrirUrgente ? `⚠ ${formatInt(v)}` : formatInt(v))}
            </td>
          );
        })}
        <td className="px-3 py-2 text-xs text-right tabular-nums bg-accent/10 font-semibold text-foreground border-l-2 border-border">
          {!plano || plano.totalVagas === 0 ? "—" : formatInt(plano.totalVagas)}
        </td>
      </tr>
      {/* HC contratado — folha (inclui quem ainda rampa) */}
      <tr className="border-b border-border/60 hover:bg-muted/20">
        <td className="sticky left-0 z-10 bg-card border-r border-border pl-8 pr-3 py-2 text-xs text-muted-foreground font-medium">
          HC contratado
        </td>
        {MESES.map((mes) => {
          const v = planoByMes.get(mes)?.hcContratado ?? 0;
          const isFechado = rampUpByMes.get(mes)?.isFechado ?? false;
          return (
            <td
              key={mes}
              className={`px-3 py-2 text-xs text-right tabular-nums ${
                isFechado ? "text-muted-foreground" : "text-foreground"
              }`}
            >
              {v === 0 ? "—" : fmt1(v)}
            </td>
          );
        })}
        <td className="px-3 py-2 text-xs text-right tabular-nums bg-accent/10 font-semibold text-foreground border-l-2 border-border">
          {picoHcContratado === 0 ? "—" : fmt1(picoHcContratado)}
        </td>
      </tr>
      {/* Gap — necessário − produtivo projetado (já considera a rampa das vagas) */}
      <tr className="border-b border-border hover:bg-muted/20">
        <td className="sticky left-0 z-10 bg-card border-r border-border pl-8 pr-3 py-2 text-xs text-muted-foreground font-medium">
          Gap
        </td>
        {MESES.map((mes) => {
          const p = planoByMes.get(mes);
          const necessario = necessarioByMes.get(mes) ?? 0;
          const gap = p?.gap ?? necessario - disponivel;
          const isFechado = rampUpByMes.get(mes)?.isFechado ?? false;
          const color =
            necessario === 0
              ? "text-muted-foreground"
              : gap > 0.05
                ? "text-destructive font-semibold"
                : gap < -0.05
                  ? "text-success"
                  : "text-foreground";
          return (
            <td
              key={mes}
              className={`px-3 py-2 text-xs text-right tabular-nums ${color} ${
                isFechado ? "opacity-70" : ""
              }`}
            >
              {necessario === 0 ? "—" : fmt1(gap)}
            </td>
          );
        })}
        <td
          className={`px-3 py-2 text-xs text-right tabular-nums bg-accent/10 font-semibold border-l-2 border-border ${
            picoNecessario === 0
              ? "text-muted-foreground"
              : picoGap > 0.05
                ? "text-destructive"
                : "text-success"
          }`}
        >
          {picoNecessario === 0 ? "—" : fmt1(picoGap)}
        </td>
      </tr>
    </>
  );
}
