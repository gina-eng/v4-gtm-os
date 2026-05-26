"use client";

import { useMemo, useState } from "react";
import { Info, Network } from "lucide-react";
import {
  EditableSection,
  SectionBadge,
} from "@/components/premissas/editable-section";
import { CurrencyCell, IntegerCell } from "@/components/premissas/editable-cell";
import {
  farolColorClass,
  formatBRL,
  formatPercent,
} from "@/components/premissas/format";
import { FieldHelp } from "@/components/ui/field-help";
import type {
  Horizonte,
  HorizonteCrescimento,
  RealizadoMensal,
} from "@/lib/premissas/matriz-defaults";
import {
  aderencia,
  aderenciaPercentual,
  cacMes,
  calcularRealizadoVsProjetado,
  formatMesPt,
  ULTIMO_MES_FECHADO,
  type LinhaRealizadoProjetado,
} from "@/lib/realizado/projecao";

type UnidadeProps = {
  mode: "unidade";
  organizationId: string;
  organizationName: string;
  initialValues: RealizadoMensal[];
  horizontes: HorizonteCrescimento[];
  horizonteAtual: Horizonte;
  /** Data de inauguração da unidade (YYYY-MM-DD). Usada para escolher o mês-âncora. */
  dataInicio: string | null;
};

type MatrizProps = {
  mode: "matriz";
  organizationName: string;
  /**
   * Linhas já agregadas das unidades — cada unidade calcula sua própria projeção
   * (com seu horizonteAtual) e o servidor soma mês a mês antes de renderizar.
   */
  linhasMatriz: LinhaRealizadoProjetado[];
  unitCount: number;
};

type Props = UnidadeProps | MatrizProps;

/**
 * Tela /realizado — Realizado vs Projetado.
 *
 * Unidade: edita o realizado mês-a-mês dos meses fechados e vê a projeção até dez/26.
 * Matriz: visualiza a soma do realizado das unidades (proxy — sem input próprio).
 */
export function RealizadoClient(props: Props) {
  const isMatriz = props.mode === "matriz";

  // Modo unidade: gerencia estado editável local + recalcula projeção a cada mudança.
  // Modo matriz: recebe linhas já agregadas do servidor (cada unidade calcula sua
  // própria projeção e o page.tsx soma) — sem edição, sem recálculo.
  const initialUnidade = !isMatriz ? props.initialValues : null;
  const [saved, setSaved] = useState<RealizadoMensal[]>(initialUnidade ?? []);
  const [draft, setDraft] = useState<RealizadoMensal[]>(initialUnidade ?? []);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = isEditing ? draft : saved;

  // Extrai as deps do useMemo de forma estável — passar `props` direto faria o
  // memo refazer a cada render (objeto novo) sem motivo.
  const linhasMatriz = props.mode === "matriz" ? props.linhasMatriz : null;
  const horizontesUnidade = props.mode === "unidade" ? props.horizontes : null;
  const horizonteAtualUnidade =
    props.mode === "unidade" ? props.horizonteAtual : null;
  const dataInicioUnidade = props.mode === "unidade" ? props.dataInicio : null;

  const linhas = useMemo(() => {
    if (linhasMatriz) return linhasMatriz;
    if (horizontesUnidade && horizonteAtualUnidade) {
      return calcularRealizadoVsProjetado(
        rows,
        horizontesUnidade,
        horizonteAtualUnidade,
        { dataInicio: dataInicioUnidade },
      );
    }
    return [];
  }, [linhasMatriz, horizontesUnidade, horizonteAtualUnidade, dataInicioUnidade, rows]);

  // Map mes → row de input pra renderizar dados auxiliares (investido, leads, won)
  // ao lado do realizado/projetado. Só aplica no modo unidade.
  const inputByMes = useMemo(() => {
    const m = new Map<string, RealizadoMensal>();
    if (!isMatriz) for (const r of rows) m.set(r.mes, r);
    return m;
  }, [rows, isMatriz]);

  function updateRow(mes: string, patch: Partial<RealizadoMensal>) {
    setDraft((prev) =>
      prev.map((r) => (r.mes === mes ? { ...r, ...patch } : r)),
    );
  }

  async function handleSave() {
    if (props.mode !== "unidade" || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/units/${props.organizationId}/setup`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "realizado-historico", data: draft }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível salvar.");
        return;
      }
      setSaved(draft);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSaving(false);
    }
  }

  const eyebrow = isMatriz
    ? "V4 OS · CONSOLIDADO DA REDE"
    : `${props.organizationName} · REALIZADO`;
  const unitCount = props.mode === "matriz" ? props.unitCount : 1;
  const horizonteAtual = props.mode === "unidade" ? props.horizonteAtual : null;
  const taxaHorizonte =
    props.mode === "unidade"
      ? props.horizontes.find((h) => h.h === props.horizonteAtual)?.crescMensalPct ?? 0
      : 0;

  const totalRealizado = linhas.reduce((acc, l) => acc + l.realizado, 0);
  const totalProjetado = linhas.reduce((acc, l) => acc + l.projetado, 0);
  const aderenciaAno = aderenciaPercentual(totalRealizado, totalProjetado);

  return (
    <>
      {/* HEADER */}
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-1">
          {eyebrow}
        </div>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              Forecast
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isMatriz
                ? "Visão consolidada — soma do realizado e do projetado das unidades, sem input próprio da Matriz."
                : `Projeção ancorada no mês fechado mais recente e capitalizada pela taxa do horizonte ${horizonteAtual} (${formatPercent(taxaHorizonte, 1)}/mês). Re-ancora a cada mês fechado.`}
            </p>
          </div>
          {!isMatriz && (
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success inline-block" />
              Edição contínua
            </div>
          )}
        </div>
      </div>

      {/* AVISO MATRIZ — proxy */}
      {isMatriz && (
        <div className="mb-4 rounded border border-info/30 bg-info/5 px-3 py-2 flex items-center gap-2 text-xs text-foreground">
          <Network className="h-3.5 w-3.5 text-info shrink-0" />
          <span>
            Proxy consolidada de <strong>{unitCount} {unitCount === 1 ? "unidade" : "unidades"}</strong>.
            Cada unidade calcula sua projeção (a partir do mês fechado mais recente × taxa do horizonte próprio) e a Matriz soma mês a mês.
            Para editar, entre no contexto de uma unidade.
          </span>
        </div>
      )}

      {/* CARDS RESUMO */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <SummaryCard
          label="Realizado acumulado"
          value={formatBRL(totalRealizado)}
          help="Soma do faturamento realizado em todos os meses de 2026."
        />
        <SummaryCard
          label="Projetado acumulado"
          value={formatBRL(totalProjetado)}
          help="Forecast anual — realizado dos meses fechados + projeção dos futuros a partir do último mês fechado (taxa do horizonte, P1)."
        />
        <SummaryCard
          label="Aderência do ano"
          value={formatPercent(aderenciaAno, 1)}
          valueClassName={farolColorClass(aderenciaAno)}
          help="Realizado acumulado ÷ forecast anual. Quanto do forecast do ano já foi realizado."
        />
      </div>

      {/* TABELA PRINCIPAL */}
      <EditableSection
        title={isMatriz ? "CONSOLIDADO — FORECAST" : "INPUT UNIDADE — FORECAST"}
        badge={
          <SectionBadge>
            {isMatriz ? "Proxy · Soma das unidades" : "Edição contínua"}
          </SectionBadge>
        }
        canEdit={!isMatriz}
        isEditing={isEditing}
        onEdit={() => {
          setDraft(saved);
          setError(null);
          setIsEditing(true);
        }}
        onSave={handleSave}
        onCancel={() => {
          setDraft(saved);
          setIsEditing(false);
          setError(null);
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <Th help="Mês de referência (2026).">Mês</Th>
                <Th align="right" help="Faturamento realizado pela unidade no mês. Editável apenas para meses fechados.">Realizado</Th>
                <Th align="right" help="Meses fechados = o próprio realizado. Meses futuros = último mês fechado × (1 + cresc%)^n usando a taxa do horizonte atual.">Projetado</Th>
                <Th align="right" help="Aderência = Realizado ÷ Projetado. Verde acima de 100%, vermelho abaixo de 80%.">Aderência</Th>
                {!isMatriz && (
                  <Th align="right" help="Horizonte da P1 aplicado para projetar o ano.">Horiz.</Th>
                )}
                {!isMatriz && (
                  <>
                    <Th align="right" help="Investimento em mídia no mês (R$).">Investido</Th>
                    <Th align="right" help="Leads inbound (Lead Broker) no mês.">Leads IB</Th>
                    <Th align="right" help="Leads outbound (Black Box) no mês.">Leads OB</Th>
                    <Th align="right" help="Deals fechados no mês (Won).">Won</Th>
                    <Th align="right" help="CAC = Investido ÷ Won. Calculado automaticamente.">CAC</Th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha, idx) => {
                const isFechado = linha.mes <= ULTIMO_MES_FECHADO;
                const isEditable = isEditing && !isMatriz && isFechado;
                const input = inputByMes.get(linha.mes);
                const adher = aderencia(linha);
                const cac = input ? cacMes(input) : 0;
                return (
                  <tr
                    key={linha.mes}
                    className={`${idx % 2 === 0 ? "bg-card" : "bg-muted/30"} border-b border-border/60 ${
                      !isFechado ? "opacity-95" : ""
                    }`}
                  >
                    <td className="px-2 py-2 text-xs font-medium text-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {formatMesPt(linha.mes)}
                        {!isFechado && (
                          <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                            futuro
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-xs text-right">
                      {isEditable ? (
                        <CurrencyCell
                          isEditing
                          value={input?.faturamento ?? 0}
                          onChange={(v) => updateRow(linha.mes, { faturamento: v })}
                        />
                      ) : (
                        <span className="tabular-nums text-foreground">
                          {linha.realizado > 0 ? formatBRL(linha.realizado) : "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs text-right tabular-nums text-muted-foreground">
                      {linha.projetado > 0 ? formatBRL(linha.projetado) : "—"}
                    </td>
                    <td
                      className={`px-2 py-2 text-xs text-right tabular-nums font-semibold ${
                        adher > 0 ? farolColorClass(adher) : "text-muted-foreground"
                      }`}
                    >
                      {adher > 0 ? formatPercent(adher, 1) : "—"}
                    </td>
                    {!isMatriz && (
                      <td className="px-2 py-2 text-xs text-right tabular-nums text-muted-foreground">
                        {linha.horizonteAplicado ?? "—"}
                      </td>
                    )}
                    {!isMatriz && (
                      <td className="px-2 py-2 text-xs text-right">
                        {isEditable ? (
                          <CurrencyCell
                            isEditing
                            value={input?.investido ?? 0}
                            onChange={(v) => updateRow(linha.mes, { investido: v })}
                          />
                        ) : (
                          <span className="tabular-nums text-muted-foreground">
                            {(input?.investido ?? 0) > 0 ? formatBRL(input?.investido ?? 0) : "—"}
                          </span>
                        )}
                      </td>
                    )}
                    {!isMatriz && (
                      <td className="px-2 py-2 text-xs text-right">
                        {isEditable ? (
                          <IntegerCell
                            isEditing
                            value={input?.leadsIb ?? 0}
                            onChange={(v) => updateRow(linha.mes, { leadsIb: v })}
                          />
                        ) : (
                          <span className="tabular-nums text-muted-foreground">
                            {(input?.leadsIb ?? 0) > 0 ? input?.leadsIb : "—"}
                          </span>
                        )}
                      </td>
                    )}
                    {!isMatriz && (
                      <td className="px-2 py-2 text-xs text-right">
                        {isEditable ? (
                          <IntegerCell
                            isEditing
                            value={input?.leadsOb ?? 0}
                            onChange={(v) => updateRow(linha.mes, { leadsOb: v })}
                          />
                        ) : (
                          <span className="tabular-nums text-muted-foreground">
                            {(input?.leadsOb ?? 0) > 0 ? input?.leadsOb : "—"}
                          </span>
                        )}
                      </td>
                    )}
                    {!isMatriz && (
                      <td className="px-2 py-2 text-xs text-right">
                        {isEditable ? (
                          <IntegerCell
                            isEditing
                            value={input?.won ?? 0}
                            onChange={(v) => updateRow(linha.mes, { won: v })}
                          />
                        ) : (
                          <span className="tabular-nums text-muted-foreground">
                            {(input?.won ?? 0) > 0 ? input?.won : "—"}
                          </span>
                        )}
                      </td>
                    )}
                    {!isMatriz && (
                      <td className="px-2 py-2 text-xs text-right tabular-nums text-muted-foreground">
                        {cac > 0 ? formatBRL(cac) : "—"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2.5 border-t border-border bg-muted/20 flex items-center justify-between gap-3">
          <p className="text-[10px] text-muted-foreground">
            {isMatriz
              ? `Consolidado de ${unitCount} ${unitCount === 1 ? "unidade" : "unidades"} · Realizado e Projetado vêm da soma das unidades, cada uma calculada com seu próprio horizonte.`
              : `Edite os meses fechados · O mês fechado mais recente ancora a projeção dos meses futuros · Aderência = Realizado ÷ Projetado`}
          </p>
          {error && <span className="text-[10px] text-destructive">{error}</span>}
        </div>
      </EditableSection>
    </>
  );
}

function SummaryCard({
  label,
  value,
  help,
  valueClassName,
}: {
  label: string;
  value: string;
  help: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
        <FieldHelp text={help} position="bottom" />
      </div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${valueClassName ?? "text-foreground"}`}>
        {value}
      </div>
    </div>
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
