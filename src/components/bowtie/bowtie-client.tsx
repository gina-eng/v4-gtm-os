"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatBRL, formatInt, formatPercent } from "@/components/premissas/format";
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

type Pivote = "tier" | "subcanal" | "canal";

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
  organizationName,
  unitCount = 1,
  horizonteAtual,
  linhasSubCanalTier,
  realizadoCelulas,
  tiersAtivos,
  subcanaisAtivos,
}: Props) {
  const isMatriz = mode === "matriz";

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
    if (pivote === "canal") {
      return CANAIS.map((c) => {
        const subFiltro = { ...filtro, canais: [c] };
        return {
          key: c,
          label: c === "inbound" ? "Inbound" : "Outbound",
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
      {/* Header — título à esquerda, filtros à direita */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold text-foreground">Funil Bowtie 2026</h1>
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
      </div>

      {/* Gravata + cards de estágio — mesmo wrapper pra garantir que cada
          ponto da gravata fique alinhado com a coluna do card abaixo. */}
      <BowtieGravataCards realizado={realizado} projetado={projetado} />

      {/* Granularidade */}
      <BowtieGranularidade
        pivote={pivote}
        setPivote={setPivote}
        linhas={linhasGranularidade}
        totalProj={projetado}
        totalReal={realizado}
      />

      {/* Detalhamento do realizado por sub-canal (só unidade, 1 mês no filtro) */}
      {!isMatriz && (
        <BowtieEditor
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
      {/* Botão à ESQUERDA da barra: como o card é ancorado à direita, manter o
          "Limpar" no início mantém SUB-CANAL fixo na borda direita e evita
          empurrar os dropdowns quando ele aparece/some. */}
      {(meses.length || tiers.length || canais.length || subcanais.length) > 0 && (
        <button
          type="button"
          onClick={() => {
            setMeses([]);
            setTiers([]);
            setCanais([]);
            setSubcanais([]);
          }}
          className="self-end text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1"
        >
          Limpar filtros
        </button>
      )}
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
  // Nova estrutura (Group 529): SVG tem 8 LENTES = estágios (volumes
  // realizados) e 7 WINGS entre elas = conversões (CR1..CR7). Cada CR fica
  // DENTRO do espaço de wing correspondente, em vez de pílula separada.
  const W = 1128;
  const SVG_IMG_H = 449; // altura natural do SVG de fundo
  const H = 510;         // viewBox total: imagem em cima + custos abaixo
  const CY = 224;

  // 8 lentes = estágios. `cx` é o centro horizontal da lente (extraído do
  // path). `topY` = topo da lente, pra ancorar a linha tracejada do phase
  // label sem passar por cima do bowtie.
  // `labelX`/`labelTopY` (opcionais): override pra desenhar o phase label
  // em outro x (ex.: CLOSING fica centrado no nó da gravata, não na lente
  // do WON). Quando `phase` é string vazia, não renderiza o label/linha
  // (caso do SAL, que perdeu o phase "SHOW").
  type Cost = { label: string; proj: number | null; real: number | null };
  const stages: Array<{
    x: number;
    real: number | null;
    proj: number | null;
    phase: string;
    topY: number;
    labelX?: number;
    labelTopY?: number;
    /** y do fundo da lente — onde a linha tracejada de custo sai pra baixo. */
    bottomY: number;
    /** Custos derivados da etapa (R$). Pode ter mais de um — ex.: WON tem CAC, TM e Fechamento. */
    costs: Cost[];
  }> = [
    {
      // MQL = topo do funil (entrada de TODOS os canais). Sem estágio LEAD: os
      // leads comprados já entram como MQL (ver agregarProjetado, mql=leads).
      x: 127.838, phase: "MQL", topY: 115, bottomY: 333,
      real: realizado.mql, proj: projetado.mql,
      costs: [{ label: "CPMQL", proj: projetado.custoPorMql, real: null }],
    },
    {
      x: 252.762, phase: "SQL", topY: 139, bottomY: 310,
      real: realizado.sql, proj: projetado.sql,
      costs: [{ label: "CPSQL", proj: projetado.custoPorSql, real: null }],
    },
    {
      x: 375.489, phase: "SAL", topY: 157, bottomY: 291,
      real: realizado.sal, proj: projetado.sal,
      costs: [{ label: "CPSAL", proj: projetado.custoPorSal, real: null }],
    },
    {
      // Pescoço/cintura da gravata — sem estágio (só a forma visual).
      x: 499.089, phase: "", topY: 172, bottomY: 277,
      real: null, proj: null,
      costs: [],
    },
    {
      x: 628.716, phase: "CLOSING", topY: 172, bottomY: 277,
      labelX: 500, labelTopY: 172,
      real: realizado.won, proj: projetado.won,
      costs: [
        { label: "CAC", proj: projetado.cac, real: null },
        { label: "TM", proj: projetado.ticketMedio, real: realizado.ticketMedio || null },
        { label: "Fechamento", proj: projetado.faturamento, real: realizado.faturamento || null },
      ],
    },
    {
      x: 751.55, phase: "ONBOARDING", topY: 157, bottomY: 291,
      real: null, proj: null, costs: [],
    },
    {
      x: 874.983, phase: "RETENTION", topY: 139, bottomY: 310,
      real: null, proj: null, costs: [],
    },
    {
      x: 999.689, phase: "EXPANSION", topY: 115, bottomY: 333,
      real: null, proj: null, costs: [],
    },
  ];

  // Labels extras: rótulos que não correspondem a lentes específicas mas
  // ficam ancorados em algum ponto da forma do bowtie. Renderizam com
  // labelY próprio (mais baixo que os phase labels principais) pra não
  // colidir visualmente.
  const extraLabels: Array<{
    x: number;
    phase: string;
    real: number | null;
    proj: number | null;
    /** y do texto (eixo vertical do bloco label/real/proj). */
    labelY: number;
    /** Onde a linha tracejada toca o topo da forma do bowtie. */
    topY: number;
    anchor: "start" | "middle" | "end";
  }> = [
    {
      // Borda esquerda do wing entre WON e ONBOARDING (top-left do shape).
      // Coords extraídas do path filter9: "M645.962 170.684..." — onde a
      // linha tracejada toca exatamente o canto superior esquerdo da forma.
      x: 645,
      phase: "ACTIVATION",
      real: null,
      proj: null,
      labelY: 100,
      topY: 170,
      anchor: "start",
    },
  ];

  // % central de cada etapa = ATINGIMENTO da meta (realizado ÷ projetado). Abaixo,
  // "Proj:" mostra a CONVERSÃO PROJETADA: pra próxima etapa nas 3 primeiras
  // (MQL→SQL, SQL→SAL, SAL→WON) e o WIN RATE projetado (Won÷MQL) no WON, que é o
  // estágio final (não tem "próxima"). Funil começa no MQL — ver agregarProjetado.
  const atin = (r: number, p: number): number | null => (p > 0 ? (r / p) * 100 : null);
  const atingimentos: Array<{ x: number; pct: number | null; projPct: number | null }> = [
    { x: 190.3, pct: atin(realizado.mql, projetado.mql), projPct: projetado.cr2 }, // MQL (proj: MQL→SQL)
    { x: 314.1, pct: atin(realizado.sql, projetado.sql), projPct: projetado.cr3 }, // SQL (proj: SQL→SAL)
    { x: 437.3, pct: atin(realizado.sal, projetado.sal), projPct: projetado.cr4 }, // SAL (proj: SAL→WON)
    { x: 563.9, pct: atin(realizado.won, projetado.won), projPct: projetado.hitRate }, // WON (proj: win rate Won÷MQL)
    { x: 690.1, pct: null, projPct: null },
    { x: 813.3, pct: null, projPct: null },
    { x: 937.3, pct: null, projPct: null },
  ];

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="block w-full h-auto"
      >
        {/* SVG de fundo (design Group 529) — embedado como <image> no topo
            do viewBox. O viewBox tem altura extra abaixo (H > SVG_IMG_H)
            pra acomodar o bloco de custos por etapa. */}
        <image
          href="/bowtie-bg.svg"
          x={0}
          y={0}
          width={W}
          height={SVG_IMG_H}
          preserveAspectRatio="xMidYMid meet"
        />

        {/* Phase label + valor realizado + valor projetado acima de cada
            estágio, com linha tracejada ligando ao topo da lente. SAL não
            tem phase (string vazia) e CLOSING tem labelX override (centro
            da gravata). Alinhamento: 3 primeiras à direita da linha, CLOSING
            centro, 3 últimas à esquerda da linha. */}
        {(() => {
          const phaseY = 28;
          const realRowY = 46;
          const projRowY = 60;
          const lineStartY = 70;
          const TEXT_GAP = 6;
          return stages.map((s, i) => {
            if (!s.phase) return null;
            const lx = s.labelX ?? s.x;
            const lineEndY = s.labelTopY ?? s.topY;
            const anchor: "start" | "middle" | "end" =
              i <= 4 ? "start" : "end";
            const textX =
              anchor === "end" ? lx - TEXT_GAP : anchor === "start" ? lx + TEXT_GAP : lx;
            return (
              <g key={`phase-${i}`}>
                {/* Linha tracejada começa abaixo do bloco de texto */}
                <line
                  x1={lx}
                  y1={lineStartY}
                  x2={lx}
                  y2={lineEndY}
                  stroke="hsl(var(--accent))"
                  strokeOpacity={0.7}
                  strokeWidth={1.2}
                  strokeDasharray="4 3"
                />
                {/* Phase label */}
                <text
                  x={textX}
                  y={phaseY}
                  textAnchor={anchor}
                  dominantBaseline="central"
                  className="fill-foreground"
                  style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1.5 }}
                >
                  {s.phase}
                </text>
                {/* Realizado em destaque */}
                <text
                  x={textX}
                  y={realRowY}
                  textAnchor={anchor}
                  dominantBaseline="central"
                  className="fill-foreground"
                  style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.3 }}
                >
                  {s.real === null ? "—" : formatInt(s.real)}
                </text>
                {/* Projetado em cinza */}
                <text
                  x={textX}
                  y={projRowY}
                  textAnchor={anchor}
                  dominantBaseline="central"
                  className="fill-warning"
                  style={{ fontSize: 10, fontWeight: 500, letterSpacing: 0.3 }}
                >
                  {s.proj === null ? "Proj: —" : `Proj: ${formatInt(s.proj)}`}
                </text>
              </g>
            );
          });
        })()}

        {/* Labels extras (ACTIVATION etc.) — bloco label+real+proj com
            labelY próprio, posicionado mais baixo que os phase labels
            principais pra encaixar visualmente. */}
        {extraLabels.map((s, i) => {
          const TEXT_GAP = 6;
          const textX =
            s.anchor === "end" ? s.x - TEXT_GAP : s.anchor === "start" ? s.x + TEXT_GAP : s.x;
          return (
            <g key={`extra-${i}`}>
              <line
                x1={s.x}
                y1={s.labelY + 32}
                x2={s.x}
                y2={s.topY}
                stroke="hsl(var(--accent))"
                strokeOpacity={0.7}
                strokeWidth={1.2}
                strokeDasharray="4 3"
              />
              <text
                x={textX}
                y={s.labelY}
                textAnchor={s.anchor}
                dominantBaseline="central"
                className="fill-foreground"
                style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1.5 }}
              >
                {s.phase}
              </text>
              <text
                x={textX}
                y={s.labelY + 18}
                textAnchor={s.anchor}
                dominantBaseline="central"
                className="fill-foreground"
                style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.3 }}
              >
                {s.real === null ? "—" : formatInt(s.real)}
              </text>
              <text
                x={textX}
                y={s.labelY + 32}
                textAnchor={s.anchor}
                dominantBaseline="central"
                className="fill-warning"
                style={{ fontSize: 10, fontWeight: 500, letterSpacing: 0.3 }}
              >
                {s.proj === null ? "Proj: —" : `Proj: ${formatInt(s.proj)}`}
              </text>
            </g>
          );
        })}

        {/* % central de cada etapa = atingimento da meta (realizado ÷ projetado),
            com label "da meta" e, embaixo, a taxa de conversão PROJETADA da etapa
            ("Proj: X%"). Número grande = quanto da meta a etapa bateu (ex.: 65%). */}
        {atingimentos.map((c, i) => (
          <g key={`atin-${i}`}>
            <text
              x={c.x}
              y={CY - 14}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-foreground"
              style={{ fontSize: 18, fontWeight: 700 }}
            >
              {c.pct === null ? "—" : `${Math.round(c.pct)}%`}
            </text>
            {c.pct !== null && (
              <text
                x={c.x}
                y={CY + 4}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-muted-foreground"
                style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1 }}
              >
                da meta
              </text>
            )}
            {c.projPct !== null && (
              <text
                x={c.x}
                y={CY + 18}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-warning"
                style={{ fontSize: 10, fontWeight: 500 }}
              >
                {`Proj: ${Math.round(c.projPct)}%`}
              </text>
            )}
          </g>
        ))}

        {/* Custos abaixo de cada lente — espelha o bloco de cima: linha
            tracejada accent + label do custo + Real (em destaque) + Proj
            (cinza). WON pode ter múltiplos custos (CAC, TM, Fechamento)
            empilhados sob o nó central. */}
        {(() => {
          const lineStartGapY = 6;
          const lineEndY = 360;
          const firstBlockY = 374;
          const BLOCK_HEIGHT = 42; // altura por custo (label + real + proj + gap)
          const TEXT_GAP = 6;
          return stages.map((s, i) => {
            if (!s.costs || s.costs.length === 0) return null;
            const lx = s.labelX ?? s.x;
            const anchor: "start" | "middle" | "end" =
              i <= 4 ? "start" : "end";
            const textX =
              anchor === "end" ? lx - TEXT_GAP : anchor === "start" ? lx + TEXT_GAP : lx;
            return (
              <g key={`cost-${i}`}>
                <line
                  x1={lx}
                  y1={s.bottomY + lineStartGapY}
                  x2={lx}
                  y2={lineEndY}
                  stroke="hsl(var(--accent))"
                  strokeOpacity={0.7}
                  strokeWidth={1.2}
                  strokeDasharray="4 3"
                />
                {s.costs.map((cost, j) => {
                  const blockTop = firstBlockY + j * BLOCK_HEIGHT;
                  return (
                    <g key={`cost-${i}-${j}`}>
                      <text
                        x={textX}
                        y={blockTop}
                        textAnchor={anchor}
                        dominantBaseline="central"
                        className="fill-muted-foreground"
                        style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1 }}
                      >
                        {cost.label}
                      </text>
                      <text
                        x={textX}
                        y={blockTop + 14}
                        textAnchor={anchor}
                        dominantBaseline="central"
                        className="fill-foreground"
                        style={{ fontSize: 13, fontWeight: 700 }}
                      >
                        {cost.real === null ? "—" : formatBRL(cost.real)}
                      </text>
                      <text
                        x={textX}
                        y={blockTop + 28}
                        textAnchor={anchor}
                        dominantBaseline="central"
                        className="fill-warning"
                        style={{ fontSize: 10, fontWeight: 500 }}
                      >
                        {cost.proj === null ? "Proj: —" : `Proj: ${formatBRL(cost.proj)}`}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          });
        })()}
      </svg>
    </div>
  );
}

// ============================================================
// Cards de estágio
// ============================================================

/**
 * Wrapper da gravata bowtie. Antes tinha um grid de 8 cards embaixo com
 * realizado/projetado/derivados; agora toda essa informação foi movida pra
 * dentro do próprio SVG (acima das lentes pro volume; abaixo pros custos).
 */
function BowtieGravataCards({
  realizado,
  projetado,
}: {
  realizado: ReturnType<typeof agregarProjetado>;
  projetado: ReturnType<typeof agregarProjetado>;
}) {
  return (
    <div className="rounded border border-border bg-card overflow-hidden">
      <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold border-b border-border">
        Bowtie de aquisição & pós-venda
      </div>
      <BowtieGravata realizado={realizado} projetado={projetado} />
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
          Granularidade por {pivote === "tier" ? "Tier" : pivote === "canal" ? "Canal" : "Sub-canal"}
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
            onClick={() => setPivote("canal")}
            className={`px-2 py-1 ${pivote === "canal" ? "bg-accent text-accent-foreground" : "bg-card text-muted-foreground hover:bg-muted/40"}`}
          >
            Canal
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
              <th className="text-left px-3 py-2">{pivote === "tier" ? "Tier" : pivote === "canal" ? "Canal" : "Sub-canal"}</th>
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
// Detalhamento por sub-canal (read-only)
// ============================================================

type EditorProps = {
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

/**
 * Visão read-only do realizado — só aparece quando o filtro restringe a 1 mês.
 * Apresenta accordions Canal (Inbound/Outbound) → Sub-canal → tiers, e abre por
 * default só as seções em que a unidade atua dado o horizonte atual. Canais/
 * sub-canais fora do plano vêm fechados com selo "fora do horizonte".
 */
function BowtieEditor({
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
          Realizado por sub-canal — {formatMesPt(mes)}
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
                <th className="text-right px-2 py-1.5">MQL</th>
                <th className="text-right px-2 py-1.5">SQL</th>
                <th className="text-right px-2 py-1.5">SAL</th>
                <th className="text-right px-2 py-1.5">Won</th>
                <th className="text-right px-2 py-1.5">Faturamento</th>
              </tr>
            </thead>
            <tbody>
              {tiersVisiveis.map((tier) => (
                <EditorRow
                  key={tier}
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
  tier,
  tierAtivo,
  celula,
  proj,
}: {
  tier: Tier;
  tierAtivo: boolean;
  celula?: RealizadoFunilCelula;
  proj?: LinhaSubCanalTier;
}) {
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
      {/* MQL = entrada (leads); sem coluna LEAD separada — ver agregarProjetado. */}
      <NumCell value={celula?.leads ?? 0} meta={proj?.leads} />
      <NumCell value={celula?.sql ?? 0} meta={proj?.sql} />
      <NumCell value={celula?.sal ?? 0} meta={proj?.sal} />
      <NumCell value={celula?.won ?? 0} meta={proj?.won} />
      <NumCell value={celula?.faturamento ?? 0} meta={proj?.receita} brl />
    </tr>
  );
}

/** Célula read-only: realizado em destaque + projeção (meta) como referência. */
function NumCell({
  value,
  meta,
  brl,
}: {
  value: number;
  meta?: number;
  brl?: boolean;
}) {
  const fmt = (n: number) => (brl ? formatBRL(n) : formatInt(n));
  return (
    <td className="px-2 py-1.5 text-right tabular-nums">
      <span className="text-foreground">{value === 0 ? "—" : fmt(value)}</span>
      {meta != null && meta > 0 && (
        <span className="block text-[10px] text-muted-foreground">proj {fmt(meta)}</span>
      )}
    </td>
  );
}

// ============================================================
// Expansão (placeholder)
// ============================================================

