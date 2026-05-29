"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, Loader2, TriangleAlert } from "lucide-react";
import { formatBRL, formatInt, formatPercent, parseBR } from "@/components/premissas/format";
import type { LinhaSubCanalTier, SubCanalKey } from "@/lib/premissas/funil-reverso";
import { SUB_CANAIS } from "@/lib/premissas/funil-reverso";
import type { Horizonte, Tier } from "@/lib/premissas/matriz-defaults";
import type { RealizadoFunilCelula } from "@/db/repositories/realizado-funil";
import {
  agregarProjetado,
  agregarRealizado,
  type BowtieFiltro,
  type CanalGrupo,
} from "@/lib/realizado/bowtie";
import { formatMesPt, getMesReferenciaAtual, MESES_ANO_2026 } from "@/lib/realizado/projecao";

type Props = {
  mode: "matriz" | "unidade";
  organizationId?: string;
  organizationName: string;
  unitCount?: number;
  /** Horizonte atual da unidade — usado pra rotular as seções de "fora do plano". */
  horizonteAtual?: Horizonte;
  /** Projetado granular (mes × subcanal × tier). Vem de `calcularPorSubCanalPorTier`. */
  linhasSubCanalTier: LinhaSubCanalTier[];
  /** Realizado granular (mes × subcanal × tier). Vem da tabela `realizado_funil`. */
  realizadoCelulas: RealizadoFunilCelula[];
  /** Tiers em que a unidade atua no horizonte atual (P4). Editor abre essas seções. */
  tiersAtivos?: Tier[];
  /** Sub-canais em que a unidade atua (P6 + P16). Editor abre essas seções. */
  subcanaisAtivos?: SubCanalKey[];
};

const MESES = MESES_ANO_2026 as readonly string[];
const TIERS: readonly Tier[] = ["Tiny", "Small", "Medium", "Large", "Enterprise"];
const CANAIS: readonly CanalGrupo[] = ["inbound", "outbound"];
const SUBCANAL_LABEL = new Map<SubCanalKey, string>(SUB_CANAIS.map((s) => [s.key, s.label]));
const SUBCANAL_CANAL = new Map<SubCanalKey, CanalGrupo>(SUB_CANAIS.map((s) => [s.key, s.canal]));

type Pivote = "tier" | "subcanal";

/**
 * /bowtie — visualização do funil bowtie (aquisição) + editor inline do realizado.
 *
 * Layout (de cima pra baixo):
 *  1. Header + barra de filtros (mês, tier, canal, sub-canal)
 *  2. Gravata SVG (lado esquerdo = aquisição com proporções; direito = expansão "em construção")
 *  3. Cards estágio MQL → SQL → SAL → Won → Faturamento (realizado vs meta)
 *  4. Tabela "Granularidade" (pivot por Tier ou Sub-canal)
 *  5. Editor inline do realizado (mostrado quando o filtro restringe a 1 mês)
 */
export function BowtieClient({
  mode,
  organizationId,
  organizationName,
  unitCount = 1,
  horizonteAtual,
  linhasSubCanalTier,
  realizadoCelulas,
  tiersAtivos,
  subcanaisAtivos,
}: Props) {
  const isMatriz = mode === "matriz";
  const eyebrow = isMatriz
    ? "V4 OS · CONSOLIDADO DA REDE · 2026"
    : `${organizationName} · FUNIL BOWTIE 2026`;

  // ---------- Estado dos filtros ----------
  // Default: mês vigente já selecionado pra facilitar o uso. O usuário pode
  // limpar o filtro com "Limpar filtros" pra ver o ano todo.
  const [meses, setMeses] = useState<string[]>(() => [getMesReferenciaAtual()]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [canais, setCanais] = useState<CanalGrupo[]>([]);
  const [subcanais, setSubcanais] = useState<SubCanalKey[]>([]);
  const [pivote, setPivote] = useState<Pivote>("tier");

  // Sub-canais permitidos dado o filtro de canal (default: todos).
  const subcanaisDisponiveis = useMemo<SubCanalKey[]>(() => {
    if (canais.length === 0) return SUB_CANAIS.map((s) => s.key);
    return SUB_CANAIS.filter((s) => canais.includes(s.canal)).map((s) => s.key);
  }, [canais]);

  // Quando o usuário troca canal, descarta sub-canais que não pertencem mais.
  useEffect(() => {
    setSubcanais((prev) => prev.filter((k) => subcanaisDisponiveis.includes(k)));
  }, [subcanaisDisponiveis]);

  const filtro: BowtieFiltro = useMemo(
    () => ({ meses, tiers, canais, subcanais }),
    [meses, tiers, canais, subcanais],
  );

  // ---------- Agregações ----------
  const projetado = useMemo(
    () => agregarProjetado(linhasSubCanalTier, filtro),
    [linhasSubCanalTier, filtro],
  );
  const realizado = useMemo(
    () => agregarRealizado(realizadoCelulas, filtro),
    [realizadoCelulas, filtro],
  );

  // ---------- Granularidade (tabela com pivot) ----------
  const linhasGranularidade = useMemo(() => {
    if (pivote === "tier") {
      return TIERS.map((tier) => {
        const subFiltro = { ...filtro, tiers: [tier] };
        return {
          key: tier,
          label: tier,
          projetado: agregarProjetado(linhasSubCanalTier, subFiltro),
          realizado: agregarRealizado(realizadoCelulas, subFiltro),
        };
      });
    }
    return subcanaisDisponiveis.map((s) => ({
      key: s,
      label: SUBCANAL_LABEL.get(s) ?? s,
      projetado: agregarProjetado(linhasSubCanalTier, { ...filtro, subcanais: [s] }),
      realizado: agregarRealizado(realizadoCelulas, { ...filtro, subcanais: [s] }),
    }));
  }, [pivote, filtro, linhasSubCanalTier, realizadoCelulas, subcanaisDisponiveis]);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-1">
          {eyebrow}
        </div>
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold text-foreground">Funil Bowtie 2026</h1>
          {isMatriz ? (
            <span className="text-xs text-muted-foreground">
              {unitCount} unidade{unitCount === 1 ? "" : "s"} consolidadas — read-only
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Edição do realizado disponível na tabela abaixo
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded border border-accent/60 bg-accent/15" />
            <span>
              <strong className="text-foreground">Projetado</strong> — input do modelo (Premissas + Forecast)
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded bg-accent" />
            <span>
              <strong className="text-foreground">Realizado</strong> — output preenchido na tabela abaixo
            </span>
          </span>
        </div>
      </div>

      {/* Filtros */}
      <BowtieFiltros
        meses={meses}
        setMeses={setMeses}
        tiers={tiers}
        setTiers={setTiers}
        canais={canais}
        setCanais={setCanais}
        subcanais={subcanais}
        setSubcanais={setSubcanais}
        subcanaisDisponiveis={subcanaisDisponiveis}
      />

      {/* Gravata + cards de estágio — mesmo wrapper pra garantir que cada
          ponto da gravata fique alinhado com a coluna do card abaixo. */}
      <BowtieGravataCards realizado={realizado} projetado={projetado} />

      {/* Conversões + Hit rate (bloco resumo, fora do wrapper da gravata). */}
      <BowtieCardsConversoes realizado={realizado} projetado={projetado} />

      {/* Granularidade */}
      <BowtieGranularidade
        pivote={pivote}
        setPivote={setPivote}
        linhas={linhasGranularidade}
        totalProj={projetado}
        totalReal={realizado}
      />

      {/* Editor inline (só pra unidade, e quando o filtro restringe a 1 mês) */}
      {!isMatriz && organizationId && (
        <BowtieEditor
          organizationId={organizationId}
          horizonteAtual={horizonteAtual}
          meses={meses}
          tiers={tiers}
          canais={canais}
          subcanais={subcanais}
          subcanaisDisponiveis={subcanaisDisponiveis}
          realizadoCelulas={realizadoCelulas}
          linhasSubCanalTier={linhasSubCanalTier}
          tiersAtivos={tiersAtivos ?? []}
          subcanaisAtivos={subcanaisAtivos ?? []}
        />
      )}
    </div>
  );
}

// ============================================================
// Filtros
// ============================================================

type FiltrosProps = {
  meses: string[];
  setMeses: (v: string[]) => void;
  tiers: Tier[];
  setTiers: (v: Tier[]) => void;
  canais: CanalGrupo[];
  setCanais: (v: CanalGrupo[]) => void;
  subcanais: SubCanalKey[];
  setSubcanais: (v: SubCanalKey[]) => void;
  subcanaisDisponiveis: SubCanalKey[];
};

function BowtieFiltros({
  meses, setMeses,
  tiers, setTiers,
  canais, setCanais,
  subcanais, setSubcanais,
  subcanaisDisponiveis,
}: FiltrosProps) {
  return (
    <div className="rounded border border-border bg-card p-3 flex flex-wrap items-start gap-3">
      <MultiSelect
        label="Mês"
        options={MESES.map((m) => ({ value: m, label: formatMesPt(m) }))}
        value={meses}
        onChange={setMeses}
        placeholderTodos="Todos os meses"
      />
      <MultiSelect
        label="Tier"
        options={TIERS.map((t) => ({ value: t, label: t }))}
        value={tiers}
        onChange={(v) => setTiers(v as Tier[])}
        placeholderTodos="Todos os tiers"
      />
      <MultiSelect
        label="Canal"
        options={CANAIS.map((c) => ({
          value: c,
          label: c === "inbound" ? "Inbound" : "Outbound",
        }))}
        value={canais}
        onChange={(v) => setCanais(v as CanalGrupo[])}
        placeholderTodos="Inbound + Outbound"
      />
      <MultiSelect
        label="Sub-canal"
        options={subcanaisDisponiveis.map((s) => ({
          value: s,
          label: SUBCANAL_LABEL.get(s) ?? s,
        }))}
        value={subcanais}
        onChange={(v) => setSubcanais(v as SubCanalKey[])}
        placeholderTodos="Todos os sub-canais"
      />
      {(meses.length || tiers.length || canais.length || subcanais.length) > 0 && (
        <button
          type="button"
          onClick={() => {
            setMeses([]);
            setTiers([]);
            setCanais([]);
            setSubcanais([]);
          }}
          className="ml-auto self-end text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}

type Option = { value: string; label: string };

/** Multi-select inline simples — dropdown com checkbox por opção. */
function MultiSelect({
  label,
  options,
  value,
  onChange,
  placeholderTodos,
}: {
  label: string;
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholderTodos: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const resumo =
    value.length === 0
      ? placeholderTodos
      : value.length === 1
        ? options.find((o) => o.value === value[0])?.label ?? value[0]
        : `${value.length} selecionados`;

  function toggle(v: string) {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  }

  return (
    <div className="flex flex-col gap-1" ref={ref}>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </span>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center justify-between gap-2 min-w-40 rounded border border-border bg-background px-2.5 py-1.5 text-sm text-foreground hover:border-accent/50"
        >
          <span className={value.length === 0 ? "text-muted-foreground" : ""}>
            {resumo}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
        {open && (
          <div className="absolute z-30 mt-1 max-h-72 w-56 overflow-y-auto rounded border border-border bg-card shadow-lg">
            {options.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma opção</div>
            ) : (
              options.map((o) => (
                <label
                  key={o.value}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm text-foreground cursor-pointer hover:bg-muted/40"
                >
                  <input
                    type="checkbox"
                    checked={value.includes(o.value)}
                    onChange={() => toggle(o.value)}
                  />
                  <span>{o.label}</span>
                </label>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Gravata SVG
// ============================================================

function BowtieGravata({
  realizado,
  projetado,
}: {
  realizado: ReturnType<typeof agregarProjetado>;
  projetado: ReturnType<typeof agregarProjetado>;
}) {
  // Modo mínimo: SVG do design como fundo + APENAS o valor realizado
  // centralizado dentro de cada pétala (espaço LARGO entre as lentes finas).
  // Os centros foram extraídos dos paths dos 8 wings (filter16, 14, 13, 11, 3, 5, 6, 8).
  const W = 1317;
  const H = 508;
  const CY = 254;

  // Centros das 8 pétalas (wings) do SVG — os espaços largos onde as
  // métricas devem ficar. `topY` é o y onde a linha tracejada do phase label
  // toca o topo da pétala (pra não passar por cima do bowtie).
  const stages: Array<{ x: number; real: number | null; phase: string; topY: number }> = [
    { x: 209, real: realizado.leads, phase: "AWARENESS", topY: 117 },
    { x: 347, real: realizado.mql, phase: "EDUCATION", topY: 145 },
    { x: 471, real: realizado.sql, phase: "SELECTION", topY: 170 },
    { x: 593, real: realizado.sal, phase: "SHOW", topY: 188 },
    { x: 723, real: realizado.won, phase: "CLOSING", topY: 188 },
    { x: 845, real: null, phase: "ACTIVATION", topY: 170 },
    { x: 969, real: null, phase: "RETENTION", topY: 145 },
    { x: 1107, real: null, phase: "EXPANSION", topY: 117 },
  ];

  // Conversões CR1..CR7 — uma entre cada par de estágios adjacentes,
  // posicionadas nas lentes finas. `bottomY` é o y onde a linha tracejada
  // da tag CR toca a base da pétala (pra não passar por cima do bowtie).
  const safeDiv = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
  const conversions: Array<{ x: number; label: string; pct: number | null; bottomY: number }> = [
    { x: 286, label: "CR1", pct: safeDiv(realizado.mql, realizado.leads), bottomY: 365 },
    { x: 411, label: "CR2", pct: realizado.cr2, bottomY: 340 },
    { x: 533, label: "CR3", pct: realizado.cr3, bottomY: 322 },
    { x: 657, label: "CR4", pct: realizado.cr4, bottomY: 308 },
    { x: 783, label: "CR5", pct: null, bottomY: 322 },
    { x: 905, label: "CR6", pct: null, bottomY: 340 },
    { x: 1030, label: "CR7", pct: null, bottomY: 365 },
  ];

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="block w-full h-auto"
      >
        {/* SVG de fundo (design fornecido) — embedado como <image>. */}
        <image
          href="/bowtie-bg.svg"
          x={0}
          y={0}
          width={W}
          height={H}
          preserveAspectRatio="xMidYMid meet"
        />

        {/* Phase labels acima de cada estágio + linha tracejada accent
            ligando o label ao topo do valor realizado. */}
        {(() => {
          const labelY = 50; // centro vertical do texto do label
          return stages.map((s, i) => (
            <g key={`phase-${i}`}>
              <line
                x1={s.x}
                y1={labelY + 10}
                x2={s.x}
                y2={s.topY}
                stroke="hsl(var(--accent))"
                strokeOpacity={0.7}
                strokeWidth={1.2}
                strokeDasharray="4 3"
              />
              <text
                x={s.x}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-foreground"
                style={{ fontSize: 13, fontWeight: 600, letterSpacing: 1.8 }}
              >
                {s.phase}
              </text>
            </g>
          ));
        })()}

        {/* Valor realizado centralizado em cada pétala — fonte adapta o
            tamanho ao comprimento do número pra caber dentro da pétala (que
            tem ~117px de largura). */}
        {stages.map((s, i) => {
          if (s.real === null) return null;
          const txt = formatInt(s.real);
          // Largura útil da pétala ≈ 110px no viewBox. Em fontSize 1px cada
          // dígito ocupa ~0.55px de largura no font default. Calcula tamanho
          // pra ocupar no máximo ~70px (margem boa pros números não ficarem
          // poluindo a pétala). Cap em 24px pros valores curtos não inflarem.
          const fontSize = Math.min(24, Math.floor(70 / (txt.length * 0.55)));
          return (
            <text
              key={`val-${i}`}
              x={s.x}
              y={CY}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-foreground"
              style={{ fontSize, fontWeight: 700 }}
            >
              {txt}
            </text>
          );
        })}

        {/* Tags CR1..CR7 — descidas pra abaixo do bowtie pra não competir com
            os valores realizados. Cada tag tem uma linha tracejada accent
            ligando o eixo dos valores (y=CY) ao topo da tag. */}
        {(() => {
          const tagY = 455; // centro vertical da tag (abaixo do bowtie body)
          const tagHalfH = 19;
          return conversions.map((c, i) => (
            <g key={`cr-${i}`}>
              {/* Linha tracejada: da base do bowtie até o topo da tag */}
              <line
                x1={c.x}
                y1={c.bottomY}
                x2={c.x}
                y2={tagY - tagHalfH}
                stroke="hsl(var(--accent))"
                strokeOpacity={0.7}
                strokeWidth={1.2}
                strokeDasharray="4 3"
              />
              {/* Pílula da tag */}
              <g transform={`translate(${c.x}, ${tagY})`}>
                <rect
                  x={-24}
                  y={-tagHalfH}
                  width={48}
                  height={tagHalfH * 2}
                  rx={8}
                  fill="hsl(var(--accent))"
                />
                <text
                  y={-5}
                  textAnchor="middle"
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: 0.5,
                    fill: "hsl(var(--accent-foreground))",
                  }}
                >
                  {c.label}
                </text>
                <text
                  y={12}
                  textAnchor="middle"
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    fill: "hsl(var(--accent-foreground))",
                  }}
                >
                  {c.pct === null ? "—" : `${Math.round(c.pct)}%`}
                </text>
              </g>
            </g>
          ));
        })()}
      </svg>
    </div>
  );
}

// ============================================================
// Cards de estágio
// ============================================================

/**
 * Wrapper que junta a gravata e os 7 cards de estágio no MESMO grid de 7
 * colunas (sem gap), garantindo que cada ponto do funil fique exatamente sobre
 * a coluna do card correspondente. As bordas internas (`border-l`) separam os
 * cards visualmente sem usar `gap` (que distorceria o alinhamento).
 */
function BowtieGravataCards({
  realizado,
  projetado,
}: {
  realizado: ReturnType<typeof agregarProjetado>;
  projetado: ReturnType<typeof agregarProjetado>;
}) {
  // 8 estágios em sequência. WON é o 5º (centro do funil). Ticket médio e
  // faturamento entram como métricas derivadas DENTRO do card WON (não como
  // estágios separados). Ativação / Retenção / Expansão ficam em construção.
  const cards: Array<
    | {
        kind: "estagio";
        label: string;
        value: number;
        meta: number;
        formato: "int" | "brl";
        derivados?: Array<{ label: string; meta: number; value: number | null; formato: "int" | "brl" }>;
      }
    | { kind: "placeholder"; label: string }
  > = [
    {
      kind: "estagio",
      label: "LEADS",
      value: realizado.leads,
      meta: projetado.leads,
      formato: "int",
      derivados: [
        { label: "Custo / lead", meta: projetado.custoPorLead, value: null, formato: "brl" },
      ],
    },
    {
      kind: "estagio",
      label: "MQL",
      value: realizado.mql,
      meta: projetado.mql,
      formato: "int",
      derivados: [
        { label: "Custo / MQL", meta: projetado.custoPorMql, value: null, formato: "brl" },
      ],
    },
    {
      kind: "estagio",
      label: "SQL",
      value: realizado.sql,
      meta: projetado.sql,
      formato: "int",
      derivados: [
        { label: "Custo / SQL", meta: projetado.custoPorSql, value: null, formato: "brl" },
      ],
    },
    {
      kind: "estagio",
      label: "SAL",
      value: realizado.sal,
      meta: projetado.sal,
      formato: "int",
      derivados: [
        { label: "Custo / SAL", meta: projetado.custoPorSal, value: null, formato: "brl" },
      ],
    },
    {
      kind: "estagio",
      label: "WON (LOGOS)",
      value: realizado.won,
      meta: projetado.won,
      formato: "int",
      derivados: [
        { label: "CAC", meta: projetado.cac, value: null, formato: "brl" },
        { label: "Ticket médio", meta: projetado.ticketMedio, value: realizado.ticketMedio, formato: "brl" },
        { label: "Faturamento", meta: projetado.faturamento, value: realizado.faturamento, formato: "brl" },
      ],
    },
    { kind: "placeholder", label: "ATIVAÇÃO" },
    { kind: "placeholder", label: "RETENÇÃO" },
    { kind: "placeholder", label: "EXPANSÃO" },
  ];

  return (
    <div className="rounded border border-border bg-card overflow-hidden">
      <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold border-b border-border">
        Bowtie de aquisição & pós-venda
      </div>
      {/* Gravata: largura cheia, sem padding lateral pra ocupar exatamente o
          mesmo span horizontal das 8 colunas abaixo. */}
      <BowtieGravata realizado={realizado} projetado={projetado} />
      {/* Cards de estágio: grid sem gap; cada card ganha border-l (exceto o
          primeiro) e border-t pra separar do SVG acima. */}
      <div className="grid grid-cols-8 border-t border-border">
        {cards.map((c, i) =>
          c.kind === "estagio" ? (
            <CardEstagio
              key={c.label}
              label={c.label}
              value={c.value}
              meta={c.meta}
              formato={c.formato}
              withLeftBorder={i > 0}
              derivados={c.derivados}
            />
          ) : (
            <CardEstagioPlaceholder
              key={c.label}
              label={c.label}
              withLeftBorder={i > 0}
            />
          ),
        )}
      </div>
    </div>
  );
}

function CardEstagioPlaceholder({
  label,
  withLeftBorder,
}: {
  label: string;
  withLeftBorder?: boolean;
}) {
  return (
    <div className={`p-2 flex flex-col gap-2 ${withLeftBorder ? "border-l border-border" : ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold">
          {label}
        </span>
        <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">—</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="rounded border border-dashed border-border bg-muted/30 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
            Projetado
          </div>
          <div className="text-xs font-semibold text-muted-foreground tabular-nums leading-tight">
            em construção
          </div>
        </div>
        <div className="rounded border border-dashed border-border bg-muted/30 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
            Realizado
          </div>
          <div className="text-xs font-semibold text-muted-foreground tabular-nums leading-tight">
            em construção
          </div>
        </div>
      </div>
      <div className="h-1 rounded bg-muted/60 overflow-hidden" />
    </div>
  );
}

/** Cards de conversão (CR2/CR3/CR4) + Hit rate em uma linha separada. */
function BowtieCardsConversoes({
  realizado,
  projetado,
}: {
  realizado: ReturnType<typeof agregarProjetado>;
  projetado: ReturnType<typeof agregarProjetado>;
}) {
  const conversoes: Array<{ label: string; sub: string; real: number; meta: number }> = [
    { label: "CR2", sub: "MQL → SQL", real: realizado.cr2, meta: projetado.cr2 },
    { label: "CR3", sub: "SQL → SAL", real: realizado.cr3, meta: projetado.cr3 },
    { label: "CR4", sub: "SAL → WON", real: realizado.cr4, meta: projetado.cr4 },
    { label: "HIT RATE", sub: "WON ÷ MQL", real: realizado.hitRate, meta: projetado.hitRate },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {conversoes.map((c) => (
        <ConversaoBadge
          key={c.label}
          label={c.label}
          sub={c.sub}
          real={c.real}
          meta={c.meta}
        />
      ))}
    </div>
  );
}

function CardEstagio({
  label,
  value,
  meta,
  formato,
  withLeftBorder,
  derivados,
}: {
  label: string;
  value: number;
  meta: number;
  formato: "int" | "brl";
  withLeftBorder?: boolean;
  /**
   * Métricas derivadas exibidas como mini-linhas no rodapé do card (ex.: ticket
   * médio dentro do WON ou custo por estágio nos cards de aquisição). Quando
   * `value` (realizado) é null, mostra "—" no lugar — útil pra métricas que
   * ainda só têm projetado (ex.: custo realizado por estágio).
   */
  derivados?: Array<{ label: string; meta: number; value: number | null; formato: "int" | "brl" }>;
}) {
  const aderencia = meta > 0 ? (value / meta) * 100 : 0;
  const ok = aderencia >= 100;
  const fmt = formato === "brl" ? formatBRL : formatInt;
  return (
    <div className={`p-2 flex flex-col gap-2 ${withLeftBorder ? "border-l border-border" : ""}`}>
      {/* Cabeçalho com nome do estágio + aderência (canto direito). */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold">
          {label}
        </span>
        <span
          className={`text-[10px] font-semibold tabular-nums ${
            ok ? "text-[hsl(142,71%,35%)]" : "text-muted-foreground"
          }`}
        >
          {formatPercent(aderencia, 0)}
        </span>
      </div>
      {/* Dois sub-cards empilhados: Projetado em cima (cinza), Realizado embaixo (accent). */}
      <div className="flex flex-col gap-1.5">
        <div className="rounded border border-border bg-muted/30 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
            Projetado
          </div>
          <div className="text-sm font-semibold text-foreground tabular-nums leading-tight">
            {fmt(meta)}
          </div>
        </div>
        <div className="rounded border border-accent/40 bg-accent/10 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wider text-accent font-semibold">
            Realizado
          </div>
          <div className="text-sm font-semibold text-accent tabular-nums leading-tight">
            {fmt(value)}
          </div>
        </div>
      </div>
      {/* Barra de aderência fininha embaixo. */}
      <div className="h-1 rounded bg-muted/60 overflow-hidden">
        <div
          className={`h-full ${ok ? "bg-[hsl(142,71%,45%)]" : "bg-accent"}`}
          style={{ width: `${Math.min(100, aderencia)}%` }}
        />
      </div>
      {/* Métricas derivadas (ex.: ticket médio + faturamento dentro do WON,
          custo médio por estágio nos cards de aquisição). */}
      {derivados && derivados.length > 0 && (
        <div className="mt-1 pt-1.5 border-t border-dashed border-border flex flex-col gap-1">
          {derivados.map((d) => {
            const dfmt = d.formato === "brl" ? formatBRL : formatInt;
            return (
              <div key={d.label} className="flex flex-col gap-0.5">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {d.label}
                </span>
                <div className="flex items-baseline justify-between gap-1 tabular-nums">
                  <span className="text-[10px] text-muted-foreground">{dfmt(d.meta)}</span>
                  <span className="text-[10px] font-semibold text-accent">
                    {d.value === null ? "—" : dfmt(d.value)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConversaoBadge({
  label,
  sub,
  real,
  meta,
}: {
  label: string;
  sub: string;
  real: number;
  meta: number;
}) {
  return (
    <div className="rounded border border-border bg-card p-2 flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold">
          {label}
        </span>
        <span className="text-[9px] text-muted-foreground">{sub}</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded border border-border bg-muted/30 px-2 py-1 text-center">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
            Proj
          </div>
          <div className="text-sm font-semibold text-foreground tabular-nums leading-tight">
            {formatPercent(meta, 0)}
          </div>
        </div>
        <div className="rounded border border-accent/40 bg-accent/10 px-2 py-1 text-center">
          <div className="text-[9px] uppercase tracking-wider text-accent font-semibold">
            Real
          </div>
          <div className="text-sm font-semibold text-accent tabular-nums leading-tight">
            {formatPercent(real, 0)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Granularidade
// ============================================================

type LinhaGran = {
  key: string;
  label: string;
  projetado: ReturnType<typeof agregarProjetado>;
  realizado: ReturnType<typeof agregarProjetado>;
};

function BowtieGranularidade({
  pivote,
  setPivote,
  linhas,
  totalProj,
  totalReal,
}: {
  pivote: Pivote;
  setPivote: (p: Pivote) => void;
  linhas: LinhaGran[];
  totalProj: ReturnType<typeof agregarProjetado>;
  totalReal: ReturnType<typeof agregarProjetado>;
}) {
  return (
    <div className="rounded border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-foreground">
          Granularidade por {pivote === "tier" ? "Tier" : "Sub-canal"}
        </div>
        <div className="inline-flex rounded border border-border overflow-hidden text-[11px]">
          <button
            type="button"
            onClick={() => setPivote("tier")}
            className={`px-2 py-1 ${pivote === "tier" ? "bg-accent text-accent-foreground" : "bg-card text-muted-foreground hover:bg-muted/40"}`}
          >
            Tier
          </button>
          <button
            type="button"
            onClick={() => setPivote("subcanal")}
            className={`px-2 py-1 ${pivote === "subcanal" ? "bg-accent text-accent-foreground" : "bg-card text-muted-foreground hover:bg-muted/40"}`}
          >
            Sub-canal
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="text-sm border-collapse w-full table-fixed" style={{ minWidth: 1100 }}>
          <colgroup>
            <col style={{ width: 160 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 120 }} />
          </colgroup>
          <thead>
            <tr className="bg-table-header text-table-header-foreground text-[10px] uppercase tracking-wider">
              <th className="text-left px-3 py-2">{pivote === "tier" ? "Tier" : "Sub-canal"}</th>
              <th className="text-right px-2 py-2">MQL</th>
              <th className="text-right px-2 py-2">MQL→SQL</th>
              <th className="text-right px-2 py-2">SQL</th>
              <th className="text-right px-2 py-2">SQL→SAL</th>
              <th className="text-right px-2 py-2">SAL</th>
              <th className="text-right px-2 py-2">SAL→WON</th>
              <th className="text-right px-2 py-2">WON</th>
              <th className="text-right px-2 py-2">Hit rate</th>
              <th className="text-right px-2 py-2">Faturamento</th>
              <th className="text-right px-2 py-2">Ticket médio</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <LinhaGranularidade key={l.key} linha={l} />
            ))}
            <tr className="bg-muted/30 font-semibold">
              <td className="px-3 py-2">Total</td>
              <td className="text-right px-2 py-2 tabular-nums">
                <DualValue real={formatInt(totalReal.mql)} meta={formatInt(totalProj.mql)} />
              </td>
              <td className="text-right px-2 py-2 text-muted-foreground tabular-nums">
                {formatPercent(totalReal.cr2, 0)}
              </td>
              <td className="text-right px-2 py-2 tabular-nums">
                <DualValue real={formatInt(totalReal.sql)} meta={formatInt(totalProj.sql)} />
              </td>
              <td className="text-right px-2 py-2 text-muted-foreground tabular-nums">
                {formatPercent(totalReal.cr3, 0)}
              </td>
              <td className="text-right px-2 py-2 tabular-nums">
                <DualValue real={formatInt(totalReal.sal)} meta={formatInt(totalProj.sal)} />
              </td>
              <td className="text-right px-2 py-2 text-muted-foreground tabular-nums">
                {formatPercent(totalReal.cr4, 0)}
              </td>
              <td className="text-right px-2 py-2 tabular-nums">
                <DualValue real={formatInt(totalReal.won)} meta={formatInt(totalProj.won)} />
              </td>
              <td className="text-right px-2 py-2 tabular-nums">
                {formatPercent(totalReal.hitRate, 1)}
              </td>
              <td className="text-right px-2 py-2 tabular-nums">
                <DualValue real={formatBRL(totalReal.faturamento)} meta={formatBRL(totalProj.faturamento)} />
              </td>
              <td className="text-right px-2 py-2 tabular-nums">
                {formatBRL(totalReal.ticketMedio)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LinhaGranularidade({ linha }: { linha: LinhaGran }) {
  const r = linha.realizado;
  const m = linha.projetado;
  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2 font-medium text-foreground">{linha.label}</td>
      <td className="text-right px-2 py-2 tabular-nums">
        <DualValue real={formatInt(r.mql)} meta={formatInt(m.mql)} />
      </td>
      <td className="text-right px-2 py-2 text-muted-foreground tabular-nums">
        {formatPercent(r.cr2, 0)}
      </td>
      <td className="text-right px-2 py-2 tabular-nums">
        <DualValue real={formatInt(r.sql)} meta={formatInt(m.sql)} />
      </td>
      <td className="text-right px-2 py-2 text-muted-foreground tabular-nums">
        {formatPercent(r.cr3, 0)}
      </td>
      <td className="text-right px-2 py-2 tabular-nums">
        <DualValue real={formatInt(r.sal)} meta={formatInt(m.sal)} />
      </td>
      <td className="text-right px-2 py-2 text-muted-foreground tabular-nums">
        {formatPercent(r.cr4, 0)}
      </td>
      <td className="text-right px-2 py-2 tabular-nums">
        <DualValue real={formatInt(r.won)} meta={formatInt(m.won)} />
      </td>
      <td className="text-right px-2 py-2 tabular-nums">{formatPercent(r.hitRate, 1)}</td>
      <td className="text-right px-2 py-2 tabular-nums">
        <DualValue real={formatBRL(r.faturamento)} meta={formatBRL(m.faturamento)} />
      </td>
      <td className="text-right px-2 py-2 tabular-nums">{formatBRL(r.ticketMedio)}</td>
    </tr>
  );
}

function DualValue({ real, meta }: { real: string; meta: string }) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-muted-foreground text-[10px] uppercase tracking-wider">proj</span>
      <span className="text-foreground tabular-nums -mt-0.5">{meta}</span>
      <span className="text-accent text-[10px] uppercase tracking-wider mt-1">real</span>
      <span className="text-accent font-semibold tabular-nums -mt-0.5">{real}</span>
    </div>
  );
}

// ============================================================
// Editor inline
// ============================================================

type EditorProps = {
  organizationId: string;
  horizonteAtual?: Horizonte;
  meses: string[];
  tiers: Tier[];
  canais: CanalGrupo[];
  subcanais: SubCanalKey[];
  subcanaisDisponiveis: SubCanalKey[];
  realizadoCelulas: RealizadoFunilCelula[];
  linhasSubCanalTier: LinhaSubCanalTier[];
  /** Tiers ativos no horizonte atual (P4) — define quais ficam expandidos. */
  tiersAtivos: Tier[];
  /** Sub-canais ativos no horizonte atual (P6 + P16) — define quais ficam expandidos. */
  subcanaisAtivos: SubCanalKey[];
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Editor inline — só aparece quando o filtro restringe a 1 mês. Apresenta
 * accordions Canal (Inbound/Outbound) → Sub-canal → tiers, e abre por default
 * só as seções em que a unidade atua dado o horizonte atual. Canais/sub-canais
 * fora do plano vêm fechados com selo "fora do horizonte" — o usuário ainda
 * pode abrir e preencher (caso tenha realizado fora do plano).
 *
 * Cada linha de tier salva em debounce via POST /api/bowtie.
 */
function BowtieEditor({
  organizationId,
  horizonteAtual,
  meses,
  tiers,
  canais,
  subcanais,
  subcanaisDisponiveis,
  realizadoCelulas,
  linhasSubCanalTier,
  tiersAtivos,
  subcanaisAtivos,
}: EditorProps) {
  if (meses.length !== 1) {
    return (
      <div className="rounded border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        Selecione <strong>um único mês</strong> no filtro acima para abrir o editor de realizado.
      </div>
    );
  }
  const mes = meses[0];

  // Filtros do topo restringem o que aparece no editor; "ativos" do horizonte
  // só decidem o estado inicial (aberto/fechado) das seções que aparecem.
  const subcanaisVisiveis = useMemo<SubCanalKey[]>(() => {
    let base = subcanais.length > 0 ? subcanais : subcanaisDisponiveis;
    if (base.length === 0) base = SUB_CANAIS.map((s) => s.key);
    return base;
  }, [subcanais, subcanaisDisponiveis]);

  const tiersVisiveis = useMemo<Tier[]>(
    () => (tiers.length > 0 ? tiers : ([...TIERS] as Tier[])),
    [tiers],
  );

  const canaisVisiveis = useMemo<CanalGrupo[]>(() => {
    const baseFiltro = canais.length > 0 ? canais : ([...CANAIS] as CanalGrupo[]);
    return baseFiltro.filter((c) =>
      subcanaisVisiveis.some((s) => SUBCANAL_CANAL.get(s) === c),
    );
  }, [canais, subcanaisVisiveis]);

  // Sets pra lookup O(1) ao decidir o "ativo no horizonte" das seções.
  const subcanaisAtivosSet = useMemo(
    () => new Set<SubCanalKey>(subcanaisAtivos),
    [subcanaisAtivos],
  );
  const tiersAtivosSet = useMemo(() => new Set<Tier>(tiersAtivos), [tiersAtivos]);

  // Estado de abertura — `undefined` significa "default do horizonte"; após o
  // user clicar, fica explícito true/false e não muda mais sozinho.
  const [canalOpen, setCanalOpen] = useState<Partial<Record<CanalGrupo, boolean>>>({});
  const [subOpen, setSubOpen] = useState<Partial<Record<SubCanalKey, boolean>>>({});

  function canalAberto(c: CanalGrupo): boolean {
    if (canalOpen[c] != null) return canalOpen[c]!;
    // Aberto por default se há algum sub-canal ativo dentro do canal.
    return subcanaisVisiveis.some(
      (s) => SUBCANAL_CANAL.get(s) === c && subcanaisAtivosSet.has(s),
    );
  }
  function subAberto(s: SubCanalKey): boolean {
    if (subOpen[s] != null) return subOpen[s]!;
    return subcanaisAtivosSet.has(s);
  }

  return (
    <div className="rounded border border-border bg-card">
      <div className="border-b border-border bg-muted/20 px-3 py-2 flex items-center gap-2 flex-wrap">
        <h2 className="text-xs uppercase tracking-wider font-semibold text-foreground">
          Editor de realizado — {formatMesPt(mes)}
        </h2>
        {horizonteAtual && (
          <span className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {horizonteAtual}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground">
          — só os canais/sub-canais do plano vêm abertos; o resto começa colapsado.
        </span>
      </div>

      <div className="divide-y divide-border">
        {canaisVisiveis.map((canal) => {
          const subsDoCanal = subcanaisVisiveis.filter(
            (s) => SUBCANAL_CANAL.get(s) === canal,
          );
          const algumAtivo = subsDoCanal.some((s) => subcanaisAtivosSet.has(s));
          const open = canalAberto(canal);
          const totalSubs = subsDoCanal.length;
          const ativos = subsDoCanal.filter((s) => subcanaisAtivosSet.has(s)).length;

          return (
            <div key={canal}>
              <button
                type="button"
                onClick={() =>
                  setCanalOpen((m) => ({ ...m, [canal]: !canalAberto(canal) }))
                }
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
              >
                <ChevronRight
                  className={`h-4 w-4 text-muted-foreground transition-transform ${
                    open ? "rotate-90" : ""
                  }`}
                />
                <span className="text-sm font-semibold text-foreground uppercase tracking-wider">
                  {canal === "inbound" ? "Inbound" : "Outbound"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {ativos} de {totalSubs} sub-canais no plano
                </span>
                {!algumAtivo && (
                  <span className="ml-2 inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                    fora do horizonte
                  </span>
                )}
              </button>
              {open && (
                <div className="divide-y divide-border border-t border-border">
                  {subsDoCanal.map((sub) => (
                    <SubcanalSection
                      key={sub}
                      organizationId={organizationId}
                      mes={mes}
                      subcanal={sub}
                      tiersVisiveis={tiersVisiveis}
                      tiersAtivosSet={tiersAtivosSet}
                      isAtivo={subcanaisAtivosSet.has(sub)}
                      open={subAberto(sub)}
                      onToggle={() =>
                        setSubOpen((m) => ({ ...m, [sub]: !subAberto(sub) }))
                      }
                      realizadoCelulas={realizadoCelulas}
                      linhasSubCanalTier={linhasSubCanalTier}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {canaisVisiveis.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nenhum canal selecionado. Ajuste o filtro acima.
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Bloco de um sub-canal dentro do canal pai. Mostra resumo na linha do header
 * (mesmo quando colapsado: "X de N tiers no plano") e abre uma mini-tabela
 * com os tiers visíveis quando expandido.
 */
function SubcanalSection({
  organizationId,
  mes,
  subcanal,
  tiersVisiveis,
  tiersAtivosSet,
  isAtivo,
  open,
  onToggle,
  realizadoCelulas,
  linhasSubCanalTier,
}: {
  organizationId: string;
  mes: string;
  subcanal: SubCanalKey;
  tiersVisiveis: Tier[];
  tiersAtivosSet: Set<Tier>;
  isAtivo: boolean;
  open: boolean;
  onToggle: () => void;
  realizadoCelulas: RealizadoFunilCelula[];
  linhasSubCanalTier: LinhaSubCanalTier[];
}) {
  const tiersAtivosCount = tiersVisiveis.filter((t) => tiersAtivosSet.has(t)).length;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 pl-8 pr-3 py-1.5 text-left hover:bg-muted/30"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
            open ? "rotate-90" : ""
          }`}
        />
        <span className="text-sm text-foreground font-medium">
          {SUBCANAL_LABEL.get(subcanal) ?? subcanal}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {tiersAtivosCount} de {tiersVisiveis.length} tiers no plano
        </span>
        {!isAtivo && (
          <span className="ml-2 inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            fora do horizonte
          </span>
        )}
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="text-sm border-collapse w-full" style={{ minWidth: 980 }}>
            <thead>
              <tr className="bg-muted/40 text-foreground/80 text-[10px] uppercase tracking-wider">
                <th className="text-left px-3 py-1.5 pl-12">Tier</th>
                <th className="text-right px-2 py-1.5">Leads</th>
                <th className="text-right px-2 py-1.5">MQL</th>
                <th className="text-right px-2 py-1.5">SQL</th>
                <th className="text-right px-2 py-1.5">SAL</th>
                <th className="text-right px-2 py-1.5">Won</th>
                <th className="text-right px-2 py-1.5">Faturamento</th>
                <th className="text-right px-2 py-1.5 w-16">Status</th>
              </tr>
            </thead>
            <tbody>
              {tiersVisiveis.map((tier) => (
                <EditorRow
                  key={tier}
                  organizationId={organizationId}
                  mes={mes}
                  subcanal={subcanal}
                  tier={tier}
                  tierAtivo={tiersAtivosSet.has(tier)}
                  celula={realizadoCelulas.find(
                    (c) => c.mes === mes && c.subcanal === subcanal && c.tier === tier,
                  )}
                  proj={linhasSubCanalTier.find(
                    (l) => l.mes === mes && l.subcanal === subcanal && l.tier === tier,
                  )}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EditorRow({
  organizationId,
  mes,
  subcanal,
  tier,
  tierAtivo,
  celula,
  proj,
}: {
  organizationId: string;
  mes: string;
  subcanal: SubCanalKey;
  tier: Tier;
  tierAtivo: boolean;
  celula?: RealizadoFunilCelula;
  proj?: LinhaSubCanalTier;
}) {
  const router = useRouter();
  const [values, setValues] = useState({
    leads: celula?.leads ?? 0,
    mql: celula?.mql ?? 0,
    sql: celula?.sql ?? 0,
    sal: celula?.sal ?? 0,
    won: celula?.won ?? 0,
    faturamento: celula?.faturamento ?? 0,
  });
  const lastSavedRef = useRef(values);
  const [status, setStatus] = useState<SaveStatus>("idle");

  // Resync se o snapshot do server mudar (router.refresh após save).
  useEffect(() => {
    const next = {
      leads: celula?.leads ?? 0,
      mql: celula?.mql ?? 0,
      sql: celula?.sql ?? 0,
      sal: celula?.sal ?? 0,
      won: celula?.won ?? 0,
      faturamento: celula?.faturamento ?? 0,
    };
    lastSavedRef.current = next;
    setValues(next);
  }, [celula?.leads, celula?.mql, celula?.sql, celula?.sal, celula?.won, celula?.faturamento]);

  useEffect(() => {
    const dirty = (Object.keys(values) as Array<keyof typeof values>).some(
      (k) => Math.abs(values[k] - lastSavedRef.current[k]) > 0.001,
    );
    if (!dirty) return;
    const timer = setTimeout(async () => {
      setStatus("saving");
      try {
        const res = await fetch(`/api/bowtie`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            mes,
            subcanal,
            tier,
            ...values,
          }),
        });
        if (!res.ok) {
          setStatus("error");
          return;
        }
        lastSavedRef.current = values;
        setStatus("saved");
        router.refresh();
      } catch {
        setStatus("error");
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [values, organizationId, mes, subcanal, tier, router]);

  return (
    <tr className={`border-t border-border ${tierAtivo ? "" : "opacity-60"}`}>
      <td className="px-3 py-1.5 pl-12 text-foreground">
        <span className="inline-flex items-center gap-1.5">
          {tier}
          {!tierAtivo && (
            <span className="inline-flex items-center rounded border border-border bg-muted px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              fora
            </span>
          )}
        </span>
      </td>
      <NumCell value={values.leads} meta={proj?.leads} onChange={(n) => setValues((v) => ({ ...v, leads: n }))} />
      <NumCell value={values.mql} meta={proj?.mql} onChange={(n) => setValues((v) => ({ ...v, mql: n }))} />
      <NumCell value={values.sql} meta={proj?.sql} onChange={(n) => setValues((v) => ({ ...v, sql: n }))} />
      <NumCell value={values.sal} meta={proj?.sal} onChange={(n) => setValues((v) => ({ ...v, sal: n }))} />
      <NumCell value={values.won} meta={proj?.won} onChange={(n) => setValues((v) => ({ ...v, won: n }))} />
      <NumCell
        value={values.faturamento}
        meta={proj?.receita}
        onChange={(n) => setValues((v) => ({ ...v, faturamento: n }))}
        brl
      />
      <td className="px-2 py-1.5 text-right">
        <StatusBadge status={status} />
      </td>
    </tr>
  );
}

function NumCell({
  value,
  meta,
  onChange,
  brl,
}: {
  value: number;
  meta?: number;
  onChange: (n: number) => void;
  brl?: boolean;
}) {
  const [draft, setDraft] = useState(value === 0 ? "" : brl ? formatBRL(value) : formatInt(value));
  useEffect(() => {
    setDraft(value === 0 ? "" : brl ? formatBRL(value) : formatInt(value));
  }, [value, brl]);
  return (
    <td className="px-1 py-1 text-right">
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = parseBR(draft);
          onChange(n);
          setDraft(n === 0 ? "" : brl ? formatBRL(n) : formatInt(n));
        }}
        placeholder={meta != null && meta > 0 ? (brl ? formatBRL(meta) : formatInt(meta)) : "0"}
        className="w-full text-right tabular-nums rounded border border-transparent bg-transparent px-1.5 py-1 text-sm focus:border-accent focus:bg-background outline-none placeholder:text-muted-foreground/50"
      />
    </td>
  );
}

function StatusBadge({ status }: { status: SaveStatus }) {
  if (status === "saving") {
    return <Loader2 className="inline h-3.5 w-3.5 animate-spin text-muted-foreground" />;
  }
  if (status === "saved") {
    return <Check className="inline h-3.5 w-3.5 text-[hsl(142,71%,35%)]" />;
  }
  if (status === "error") {
    return <TriangleAlert className="inline h-3.5 w-3.5 text-accent" />;
  }
  return null;
}

// ============================================================
// Expansão (placeholder)
// ============================================================

