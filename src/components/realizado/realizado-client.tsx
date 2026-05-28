"use client";

import { Fragment } from "react";
import Link from "next/link";
import { ExternalLink, Network } from "lucide-react";
import { formatBRL, formatBRLk, formatInt, formatPercent } from "@/components/premissas/format";
import { FieldHelp } from "@/components/ui/field-help";
import type { Horizonte } from "@/lib/premissas/matriz-defaults";
import type {
  LinhaRampUp,
  LinhaSubCanal,
  SubCanalKey,
} from "@/lib/premissas/funil-reverso";
import { SUB_CANAIS } from "@/lib/premissas/funil-reverso";
import { formatMesPt, MESES_ANO_2026 } from "@/lib/realizado/projecao";

type Props = {
  mode: "matriz" | "unidade";
  organizationId?: string;
  organizationName: string;
  unitCount?: number;
  horizonteAtual?: Horizonte;
  /** Agregado por mês — usado nas seções Investimento, Receita e Time. */
  linhasRampUp: LinhaRampUp[];
  /** Detalhe por (sub-canal, mês) — usado na seção Canal × Sub-canal. */
  linhasSubCanal: LinhaSubCanal[];
  /** Cargos (de P17) — colunas da tabela de Time. */
  cargos: string[];
};

const W_LABEL = 220;
const W_MES = 116;
const W_TOTAL = 132;
const MESES = MESES_ANO_2026 as readonly string[];

function mesCurto(mes: string): string {
  return formatMesPt(mes).split(" ")[0] ?? mes;
}

/**
 * Tela /realizado (Forecast 2026) — visão unificada do funil reverso.
 * 4 seções: Canal × Sub-canal · Investimento · Receita · Time necessário.
 * Read-only; a edição do realizado mensal continua no passo do wizard.
 */
export function ForecastClient({
  mode,
  organizationName,
  unitCount = 1,
  horizonteAtual,
  linhasRampUp,
  linhasSubCanal,
  cargos,
}: Props) {
  const isMatriz = mode === "matriz";
  const eyebrow = isMatriz
    ? "V4 OS · CONSOLIDADO DA REDE · 2026"
    : `${organizationName} · FORECAST 2026`;

  const targetAno = linhasRampUp.reduce((a, l) => a + l.target, 0);
  const investAno = linhasRampUp.reduce((a, l) => a + l.investTotal, 0);
  const receitaAno = linhasRampUp.reduce((a, l) => a + l.recTotal, 0);
  const picoHc = linhasRampUp.reduce((a, l) => Math.max(a, l.hcTotal), 0);

  const subCanalByKey = new Map<string, LinhaSubCanal>();
  for (const l of linhasSubCanal) subCanalByKey.set(`${l.subcanal}|${l.mes}`, l);
  const rampUpByMes = new Map<string, LinhaRampUp>();
  for (const l of linhasRampUp) rampUpByMes.set(l.mes, l);
  // Highlight de meses fechados (vem do realizado) — alimenta a Canal × Sub-canal.
  const isFechadoByMes = new Map<string, boolean>();
  for (const l of linhasRampUp) isFechadoByMes.set(l.mes, l.isFechado);

  const subtitulo = isMatriz
    ? "Soma das unidades visíveis. Cada unidade calcula com o próprio horizonte e ancora no realizado."
    : horizonteAtual
      ? `Funil reverso 2026: meses fechados vêm do realizado; meses futuros projetados pela taxa do horizonte ${horizonteAtual} (P1).`
      : "Funil reverso 2026 a partir das premissas da unidade.";

  return (
    <>
      {/* Cabeçalho da página com largura limitada — sem isso, ele esticaria
          até a largura das tabelas (que viram muito mais largas que a viewport
          pra permitir scroll horizontal no nível da <main>). */}
      <div className="max-w-screen-2xl">
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-1">
            {eyebrow}
          </div>
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div className="flex items-end gap-3">
              <h1 className="text-2xl font-semibold text-foreground">Forecast 2026</h1>
              {!isMatriz && horizonteAtual && (
                <span className="inline-flex items-center rounded border border-border bg-muted px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {horizonteAtual}
                </span>
              )}
            </div>
            {!isMatriz && (
              <Link
                href="/iniciar/realizado-historico"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2.5 py-1"
              >
                Editar realizado mensal
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{subtitulo}</p>
        </div>

        {isMatriz && (
          <div className="mb-4 rounded border border-info/30 bg-info/5 px-3 py-2 flex items-center gap-2 text-xs text-foreground">
            <Network className="h-3.5 w-3.5 text-info shrink-0" />
            <span>
              Proxy consolidada de{" "}
              <strong>
                {unitCount} {unitCount === 1 ? "unidade" : "unidades"}
              </strong>
              . Unidades podem estar em horizontes diferentes; o consolidado soma mês a mês.
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <SummaryCard label="Target do ano" value={formatBRLk(targetAno)} help="Soma do faturamento-alvo dos 12 meses." />
          <SummaryCard label="Investimento total" value={formatBRLk(investAno)} help="Soma do investimento em mídia no ano." />
          <SummaryCard label="Receita gerada" value={formatBRLk(receitaAno)} help="Soma da receita total (IB + OB)." />
          <SummaryCard label="Pico de headcount" value={formatInt(picoHc)} help="Maior HC total exigido em um mês (P17)." />
        </div>
      </div>

      <TabelaCanalSubCanal subCanalByKey={subCanalByKey} isFechadoByMes={isFechadoByMes} />
      <TabelaReceita rampUpByMes={rampUpByMes} />
      <TabelaTime rampUpByMes={rampUpByMes} cargos={cargos} />
    </>
  );
}

// ============================================================
// Seção 1 — Canal × Sub-canal
// ============================================================

type SubCanalNumericField = "won" | "leads" | "invest" | "receita" | "saber" | "ter" | "executar";
type MetricaSub = {
  field: SubCanalNumericField;
  label: string;
  fmt: "money" | "int";
  emphasize?: boolean;
  indent?: boolean;
};

/** Won, Leads, Invest, Receita (em destaque) + Saber/Ter/Exec indentados. */
const METRICAS_SUBCANAL_INBOUND: readonly MetricaSub[] = [
  { field: "won", label: "Won", fmt: "int" },
  { field: "leads", label: "Leads", fmt: "int" },
  { field: "invest", label: "Invest", fmt: "money" },
  { field: "receita", label: "Receita", fmt: "money", emphasize: true },
  { field: "saber", label: "Saber", fmt: "money", indent: true },
  { field: "ter", label: "Ter", fmt: "money", indent: true },
  { field: "executar", label: "Executar", fmt: "money", indent: true },
];

/** MB usa "SQL" no lugar de "Leads". */
const METRICAS_SUBCANAL_MB: readonly MetricaSub[] = [
  { field: "won", label: "Won", fmt: "int" },
  { field: "leads", label: "SQL", fmt: "int" },
  { field: "invest", label: "Invest", fmt: "money" },
  { field: "receita", label: "Receita", fmt: "money", emphasize: true },
  { field: "saber", label: "Saber", fmt: "money", indent: true },
  { field: "ter", label: "Ter", fmt: "money", indent: true },
  { field: "executar", label: "Executar", fmt: "money", indent: true },
];

/** Outbound não consome mídia → sem linha de Invest. */
const METRICAS_SUBCANAL_OUTBOUND: readonly MetricaSub[] = [
  { field: "won", label: "Won", fmt: "int" },
  { field: "leads", label: "Leads", fmt: "int" },
  { field: "receita", label: "Receita", fmt: "money", emphasize: true },
  { field: "saber", label: "Saber", fmt: "money", indent: true },
  { field: "ter", label: "Ter", fmt: "money", indent: true },
  { field: "executar", label: "Executar", fmt: "money", indent: true },
];

function TabelaCanalSubCanal({
  subCanalByKey,
  isFechadoByMes,
}: {
  subCanalByKey: Map<string, LinhaSubCanal>;
  isFechadoByMes: Map<string, boolean>;
}) {
  const get = (sub: SubCanalKey, mes: string) => subCanalByKey.get(`${sub}|${mes}`);
  const inbound = SUB_CANAIS.filter((s) => s.canal === "inbound");
  const outbound = SUB_CANAIS.filter((s) => s.canal === "outbound");

  return (
    <TabelaChrome
      titulo="Canal × Sub-canal"
      subtitulo="investimento, funil e decomposição da receita por produto (P3)"
    >
      <SecaoCanal
        canalLabel="Inbound"
        subcanais={inbound}
        getMetricas={(s) => (s.key === "meeting_broker" ? METRICAS_SUBCANAL_MB : METRICAS_SUBCANAL_INBOUND)}
        getLinha={(s, mes) => get(s.key, mes)}
        isFechadoByMes={isFechadoByMes}
      />
      <SecaoCanal
        canalLabel="Outbound"
        subcanais={outbound}
        getMetricas={() => METRICAS_SUBCANAL_OUTBOUND}
        getLinha={(s, mes) => get(s.key, mes)}
        isFechadoByMes={isFechadoByMes}
      />
    </TabelaChrome>
  );
}

/**
 * Uma seção de canal (Inbound ou Outbound) — UM <tbody> que contém:
 *  - O banner do canal: sticky-top:36px (logo abaixo do thead), bg-accent sólido.
 *  - Cada sub-canal: banner sticky-top:72px (logo abaixo do banner do canal) +
 *    rows de métrica (Won/Leads/Invest/Receita + Saber/Ter/Executar).
 *
 * Como TUDO da seção vive no MESMO tbody, o canal banner (top:36) e os
 * sub-canal banners (top:72) coexistem sem precisar de tbodies aninhados (que
 * o HTML não suporta). Quando um sub-canal cede lugar pro próximo, o último
 * (no DOM) pinta por cima do anterior — o usuário vê o sub-canal correto.
 */
function SecaoCanal({
  canalLabel,
  subcanais,
  getMetricas,
  getLinha,
  isFechadoByMes,
}: {
  canalLabel: string;
  subcanais: readonly (typeof SUB_CANAIS)[number][];
  getMetricas: (s: (typeof SUB_CANAIS)[number]) => readonly MetricaSub[];
  getLinha: (s: (typeof SUB_CANAIS)[number], mes: string) => LinhaSubCanal | undefined;
  isFechadoByMes: Map<string, boolean>;
}) {
  const colSpanTotal = 1 + MESES.length + 1;
  return (
    <tbody>
      {/* Banner do CANAL — sticky-top:36 (logo abaixo do thead h-9). bg-accent
          sólido pra ficar bem visível durante todo o scroll da seção. */}
      <tr className="border-y border-border">
        <td
          colSpan={colSpanTotal}
          className="sticky top-9 z-30 bg-accent h-9 align-middle"
        >
          <span className="sticky left-0 inline-block px-3 text-[11px] uppercase tracking-wider font-semibold text-accent-foreground">
            {canalLabel}
          </span>
        </td>
      </tr>
      {subcanais.map((sub) => {
        const metricas = getMetricas(sub);
        return (
          <Fragment key={sub.key}>
            {/* Banner do SUB-CANAL — sticky-top:72 (36 thead + 36 canal). Fundo
                opaco (bg-muted) pra não vazar dados quando stickado sobre as
                linhas de outro sub-canal. */}
            <tr className="border-y border-border/50">
              <td
                colSpan={colSpanTotal}
                className="sticky top-[72px] z-30 bg-muted py-1.5"
              >
                <span className="sticky left-0 inline-block px-6 text-[11px] uppercase tracking-wider font-semibold text-foreground">
                  {sub.label}
                </span>
              </td>
            </tr>
            {metricas.map((m) => {
              const totalAno = MESES.reduce(
                (acc, mes) => acc + (getLinha(sub, mes)?.[m.field] ?? 0),
                0,
              );
              const labelBg = m.emphasize ? "bg-muted/40" : "bg-card";
              const rowBg = m.emphasize ? "bg-muted/30 font-semibold" : "hover:bg-muted/20";
              const labelPad = m.indent ? "pl-10 pr-3" : "px-6";
              return (
                <tr key={m.label} className={`border-b border-border/60 ${rowBg}`}>
                  <td className={`sticky left-0 z-10 ${labelBg} border-r border-border ${labelPad} py-2 text-xs text-foreground`}>
                    {m.label}
                  </td>
                  {MESES.map((mes) => {
                    const v = getLinha(sub, mes)?.[m.field] ?? 0;
                    return (
                      <Cell key={mes} valor={v} fmt={m.fmt} fechado={isFechadoByMes.get(mes) ?? false} />
                    );
                  })}
                  <CellTotal valor={totalAno} fmt={m.fmt} />
                </tr>
              );
            })}
          </Fragment>
        );
      })}
    </tbody>
  );
}

// ============================================================
// Seção 2 — Receita
// ============================================================

const METRICAS_RECEITA: Array<MetricRampUp> = [
  { label: "Receita Total", get: (l) => l.recTotal, fmt: "money", emphasize: true },
  { label: "Saber", get: (l) => l.saber, fmt: "money", indent: true, help: "Parcela do produto Saber (P3)." },
  { label: "Ter", get: (l) => l.ter, fmt: "money", indent: true, help: "Parcela do produto Ter (P3)." },
  { label: "Executar", get: (l) => l.executar, fmt: "money", indent: true, help: "Parcela do produto Executar (P3)." },
];

function TabelaReceita({ rampUpByMes }: { rampUpByMes: Map<string, LinhaRampUp> }) {
  return (
    <TabelaChrome titulo="Receita" subtitulo="total e por categoria de produto (P3)">
      <tbody>
        {METRICAS_RECEITA.map((m) => (
          <MetricRowRampUp key={m.label} metric={m} byMes={rampUpByMes} />
        ))}
      </tbody>
    </TabelaChrome>
  );
}

// ============================================================
// Seção 4 — Time necessário
// ============================================================

function TabelaTime({
  rampUpByMes,
  cargos,
}: {
  rampUpByMes: Map<string, LinhaRampUp>;
  cargos: string[];
}) {
  const metricas: MetricRampUp[] = [
    ...cargos.map((cargo) => ({
      label: cargo,
      get: (l: LinhaRampUp) => l.headcount[cargo] ?? 0,
      fmt: "int" as const,
      total: "max" as const,
    })),
    { label: "HC Total", get: (l) => l.hcTotal, fmt: "int", total: "max", emphasize: true },
  ];
  return (
    <TabelaChrome
      titulo="Time necessário"
      subtitulo="headcount derivado de P17 (wipLimit)"
      totalLabel="Pico 2026"
      rodape="HC = ceil(volume_estágio ÷ wipLimit). LDR=leads totais · BDR=leads OB · SDR=SQLs · CLOSER/KAM=won. Coluna “Pico 2026” = HC máximo do ano (estoque, não soma)."
    >
      <tbody>
        {metricas.map((m) => (
          <MetricRowRampUp key={m.label} metric={m} byMes={rampUpByMes} />
        ))}
      </tbody>
    </TabelaChrome>
  );
}

// ============================================================
// Chrome compartilhado (header + colgroup + tabela)
// ============================================================

function TabelaChrome({
  titulo,
  subtitulo,
  totalLabel = "Total 2026",
  rodape,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  totalLabel?: string;
  rodape?: string;
  children: React.ReactNode;
}) {
  return (
    // Sem overflow-x-auto interno: o scroll horizontal sobe pra <main> e o
    // sticky top do thead consegue se ancorar no scroll vertical da página.
    // `w-fit` faz o card encolher pra largura da tabela (não estica viewport).
    <div className="rounded border border-border bg-card mb-5 w-fit">
      {/* Header do card — texto sticky-left pra ficar visível durante scroll
          horizontal; o bg do bar acompanha a largura da tabela. */}
      <div className="border-b border-border bg-muted/20 py-2.5">
        <div className="sticky left-0 inline-flex items-baseline gap-2 px-4">
          <h2 className="text-xs uppercase tracking-wider font-semibold text-foreground">{titulo}</h2>
          {subtitulo && <span className="text-[10px] text-muted-foreground">— {subtitulo}</span>}
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
            {/* Corner cell — sticky em ambos os eixos, z-index mais alto pra cobrir
                tudo na interseção. */}
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
              {totalLabel}
            </th>
          </tr>
        </thead>
        {/* Os filhos passam seus próprios <tbody> — necessário pra sticky-top
            dos banners de sub-canal stickear DENTRO do escopo do sub-canal. */}
        {children}
      </table>
      {rodape && (
        <div className="border-t border-border bg-muted/20 py-2.5">
          <p className="sticky left-0 inline-block px-4 text-[10px] text-muted-foreground">{rodape}</p>
        </div>
      )}
    </div>
  );
}

type Fmt = "money" | "int" | "pct";

type MetricRampUp = {
  label: string;
  help?: string;
  get: (l: LinhaRampUp) => number;
  fmt: Fmt;
  total?: "sum" | "max" | "weighted";
  emphasize?: boolean;
  indent?: boolean;
};

function formatar(v: number, fmt: Fmt): string {
  if (fmt === "money") return formatBRL(v);
  if (fmt === "pct") return formatPercent(v, 1);
  return formatInt(v);
}

function totalDoAno(metric: MetricRampUp, linhas: LinhaRampUp[]): number {
  if (metric.total === "max") return linhas.reduce((a, l) => Math.max(a, metric.get(l)), 0);
  if (metric.total === "weighted") {
    const inv = linhas.reduce((a, l) => a + l.investTotal, 0);
    const tgt = linhas.reduce((a, l) => a + l.target, 0);
    return tgt > 0 ? (inv / tgt) * 100 : 0;
  }
  return linhas.reduce((a, l) => a + metric.get(l), 0);
}

function MetricRowRampUp({
  metric,
  byMes,
}: {
  metric: MetricRampUp;
  byMes: Map<string, LinhaRampUp>;
}) {
  const linhas = MESES.map((m) => byMes.get(m)).filter((l): l is LinhaRampUp => !!l);
  const tot = totalDoAno(metric, linhas);
  const labelBg = metric.emphasize ? "bg-muted/40" : "bg-card";
  const rowBg = metric.emphasize ? "bg-muted/30 font-semibold" : "hover:bg-muted/20";
  return (
    <tr className={`border-b border-border/60 ${rowBg}`}>
      <td className={`sticky left-0 z-10 ${labelBg} border-r border-border ${metric.indent ? "pl-8 pr-3" : "px-3"} py-2 text-xs text-foreground font-medium`}>
        <span className="inline-flex items-center gap-1">
          {metric.label}
          {metric.help && <FieldHelp text={metric.help} position="bottom" />}
        </span>
      </td>
      {MESES.map((mes) => {
        const linha = byMes.get(mes);
        const v = linha ? metric.get(linha) : 0;
        const isFechado = linha?.isFechado ?? false;
        return <Cell key={mes} valor={v} fmt={metric.fmt} fechado={isFechado} />;
      })}
      <CellTotal valor={tot} fmt={metric.fmt} />
    </tr>
  );
}

function Cell({ valor, fmt, fechado }: { valor: number; fmt: Fmt; fechado?: boolean }) {
  return (
    <td
      className={`px-3 py-2 text-xs text-right tabular-nums ${fechado ? "bg-info/5" : ""} ${
        valor === 0 ? "text-muted-foreground/40" : "text-muted-foreground"
      }`}
      title={fechado ? "Mês fechado (realizado)" : undefined}
    >
      {valor === 0 ? "—" : formatar(valor, fmt)}
    </td>
  );
}

function CellTotal({ valor, fmt }: { valor: number; fmt: Fmt }) {
  return (
    <td className="px-3 py-2 text-xs text-right tabular-nums bg-accent/10 font-semibold text-foreground border-l-2 border-border">
      {valor === 0 ? "—" : formatar(valor, fmt)}
    </td>
  );
}

function SummaryCard({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="rounded border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
        <FieldHelp text={help} position="bottom" />
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums text-foreground">{value}</div>
    </div>
  );
}
