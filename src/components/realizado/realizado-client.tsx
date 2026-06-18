"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ExternalLink, Network } from "lucide-react";
import { formatBRL, formatBRLk, formatInt, formatPercent } from "@/components/premissas/format";
import type {
  DistSplitHorizonte,
  Horizonte,
  InvestimentoMes,
  InvestimentoMidia,
  MixOutboundHorizonte,
  OverrideSubcanalMes,
  RealizadoMensal,
} from "@/lib/premissas/matriz-defaults";
import type {
  LinhaRampUp,
  LinhaSubCanal,
  LinhaSubCanalTier,
  SubCanalKey,
} from "@/lib/premissas/funil-reverso";
import { SUB_CANAIS } from "@/lib/premissas/funil-reverso";
import type { Tier } from "@/lib/premissas/matriz-defaults";
import { formatMesPt, MESES_ANO_2026 } from "@/lib/realizado/projecao";
import { EditorInvestimentoMensal } from "./editor-investimento-mensal";
import { EditorSubcanalMensal } from "./editor-subcanal-mensal";

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
  /** Detalhe por (sub-canal, tier, mês) — sub-bloco "Por tier" dentro de cada sub-canal. */
  linhasSubCanalTier: LinhaSubCanalTier[];
  /** P6 atual da unidade — alimenta o baseline do editor mensal de pace. */
  investimentoMidia?: InvestimentoMidia[];
  /** Override mensal atual do investimento em R$ (0–12 entradas). */
  investimentoMensal?: InvestimentoMes[];
  /** Override por subcanal × mês (R$ inbound / leads outbound). */
  overridesSubcanalMes?: OverrideSubcanalMes[];
  /** P6 da Matriz — pra mostrar delta vs baseline no editor inline. */
  matrizInvestimentoMidia?: InvestimentoMidia[];
  /** P4 da Matriz (split por tier) — define se MB está liberado (Enterprise ativo) por horizonte. */
  matrizDistSplit?: DistSplitHorizonte[];
  /** P16 da Matriz (mix outbound) — define quais subcanais outbound estão liberados por horizonte. */
  matrizMixSubcanais?: MixOutboundHorizonte[];
  /** Realizado mensal (setup wizard) — alimenta o pace dos meses fechados. */
  realizadoHistorico?: RealizadoMensal[];
  /** Data de início da unidade (YYYY-MM-DD). Meses antes ficam travados no Pace. */
  dataInicio?: string | null;
};

const TIER_ORDER: readonly Tier[] = ["Tiny", "Small", "Medium", "Large", "Enterprise"];

// Larguras em % — tabelas crescem/encolhem com o container. Label e Total
// ganham um pouco mais que cada mês (acomoda labels longos + valores
// totais). Soma: 14 + 12·6.5 + 8 = 100%.
const PCT_LABEL = "14%";
const PCT_MES = "6.5%";
const PCT_TOTAL = "8%";
// Piso pra evitar colunas ilegíveis em telas pequenas — abaixo disso o
// wrapper de scroll horizontal escora. Dimensionado pra os valores da matriz
// consolidada (casa dos bilhões) caberem em uma linha: ~100px por coluna de
// mês (6.5% · 1550); abaixo disso o wrapper rola no eixo X em vez de empilhar.
const MIN_TABLE_WIDTH = 1550;
const MESES = MESES_ANO_2026 as readonly string[];

function mesCurto(mes: string): string {
  return formatMesPt(mes).split(" ")[0] ?? mes;
}

/**
 * Tela /realizado (Forecast 2026) — visão unificada do funil reverso.
 * Seções: Receita · (Investimento total — só no consolidado da matriz) · Canal × Sub-canal.
 * O "Time necessário" virou rota própria em /time-comercial.
 * Read-only; a edição do realizado mensal continua no passo do wizard.
 */
export function ForecastClient({
  mode,
  organizationId,
  organizationName,
  unitCount = 1,
  horizonteAtual,
  linhasRampUp,
  linhasSubCanal,
  linhasSubCanalTier,
  investimentoMidia,
  investimentoMensal,
  overridesSubcanalMes,
  matrizInvestimentoMidia,
  matrizDistSplit,
  matrizMixSubcanais,
  realizadoHistorico,
  dataInicio,
}: Props) {
  const isMatriz = mode === "matriz";

  const targetAno = linhasRampUp.reduce((a, l) => a + l.target, 0);
  const investAno = linhasRampUp.reduce((a, l) => a + l.investTotal, 0);
  const receitaAno = linhasRampUp.reduce((a, l) => a + l.recTotal, 0);
  const picoHc = linhasRampUp.reduce((a, l) => Math.max(a, l.hcTotal), 0);

  const subCanalByKey = new Map<string, LinhaSubCanal>();
  for (const l of linhasSubCanal) subCanalByKey.set(`${l.subcanal}|${l.mes}`, l);
  const rampUpByMes = new Map<string, LinhaRampUp>();
  for (const l of linhasRampUp) rampUpByMes.set(l.mes, l);
  // Tiers por sub-canal: `${subcanal}|${tier}|${mes}` → linha. Alimenta o
  // sub-bloco "Por tier" embutido dentro de cada sub-canal.
  const subCanalTierByKey = new Map<string, LinhaSubCanalTier>();
  for (const l of linhasSubCanalTier) {
    subCanalTierByKey.set(`${l.subcanal}|${l.tier}|${l.mes}`, l);
  }
  // Set de (sub-canal, tier) com algum volume no ano — em horizontes baixos
  // alguns sub-canais ficam restritos a poucos tiers.
  const tiersAtivosPorSub = new Map<SubCanalKey, Tier[]>();
  for (const sub of SUB_CANAIS) {
    const ativos = TIER_ORDER.filter((t) =>
      linhasSubCanalTier.some(
        (l) =>
          l.subcanal === sub.key &&
          l.tier === t &&
          (l.receita > 0 || l.invest > 0 || l.won > 0 || l.leads > 0),
      ),
    );
    tiersAtivosPorSub.set(sub.key, ativos);
  }
  // Highlight de meses fechados (vem do realizado) — alimenta a Canal × Sub-canal.
  const isFechadoByMes = new Map<string, boolean>();
  for (const l of linhasRampUp) isFechadoByMes.set(l.mes, l.isFechado);

  // Detecta transições de horizonte ao longo do ano (só faz sentido na visão
  // de unidade — matriz agrega horizontes diferentes por unidade).
  const horizonteByMes: Map<string, Horizonte> | undefined = isMatriz
    ? undefined
    : new Map(linhasRampUp.map((l) => [l.mes, l.horizonte] as const));
  const transicoesHorizonte = (() => {
    if (isMatriz) return [] as Array<{ de: Horizonte; para: Horizonte; mes: string }>;
    const out: Array<{ de: Horizonte; para: Horizonte; mes: string }> = [];
    let anterior: Horizonte | null = null;
    for (const l of linhasRampUp) {
      if (l.horizonte && anterior && l.horizonte !== anterior) {
        out.push({ de: anterior, para: l.horizonte, mes: l.mes });
      }
      if (l.horizonte) anterior = l.horizonte;
    }
    return out;
  })();
  const transicoesMeses = new Set(transicoesHorizonte.map((t) => t.mes));
  const horizonteFinal = linhasRampUp[linhasRampUp.length - 1]?.horizonte ?? horizonteAtual;

  const subtitulo = isMatriz
    ? "Soma das unidades visíveis. Cada unidade calcula com o próprio horizonte e ancora no realizado."
    : horizonteAtual
      ? transicoesHorizonte.length > 0
        ? `Funil reverso 2026: meses fechados vêm do realizado; o horizonte é promovido automaticamente quando o patamar ultrapassa faixaMax. Cada faixa aplica suas próprias premissas.`
        : `Funil reverso 2026: meses fechados vêm do realizado; meses futuros projetados pela taxa do horizonte ${horizonteAtual}.`
      : "Funil reverso 2026 a partir das premissas da unidade.";

  return (
    // Wrapper full-width — tabelas são responsivas (width: 100% com
    // MIN_TABLE_WIDTH) e crescem com o espaço disponível. O scroll horizontal
    // unificado só aparece em telas menores que MIN_TABLE_WIDTH.
    <div className="w-full">
      <>
        {/* Header — divisão 50/50: esquerda com título + subtítulo + botão;
            direita com os 4 summary cards. */}
        <div className="mb-4 grid grid-cols-2 gap-6 items-start">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold text-foreground">Forecast 2026</h1>
              {!isMatriz && horizonteAtual && (
                <span
                  className="inline-flex items-center rounded border border-border bg-muted px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  title="Horizonte cadastrado da unidade (piso da projeção)"
                >
                  {horizonteAtual}
                  {horizonteFinal !== horizonteAtual && (
                    <span className="ml-1.5 text-accent">→ {horizonteFinal}</span>
                  )}
                </span>
              )}
              {!isMatriz &&
                transicoesHorizonte.map((t) => (
                  <span
                    key={`${t.de}-${t.para}-${t.mes}`}
                    className="inline-flex items-center rounded border border-accent/30 bg-accent/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent"
                    title={`Patamar de ${t.de} cruzou faixaMax — premissas de ${t.para} aplicam a partir desse mês.`}
                  >
                    {t.de} → {t.para} ({mesCurto(t.mes)})
                  </span>
                ))}
            </div>
            <p className="text-sm text-muted-foreground">{subtitulo}</p>
            {!isMatriz && (
              <Link
                href="/iniciar/realizado-historico"
                className="self-start inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2.5 py-1"
              >
                Editar realizado mensal
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard label="Target do ano" value={formatBRLk(targetAno)} />
            <SummaryCard label="Investimento total" value={formatBRLk(investAno)} />
            <SummaryCard label="Receita gerada" value={formatBRLk(receitaAno)} />
            <SummaryCard label="Pico de headcount" value={formatInt(picoHc)} />
          </div>
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

        {/* Único wrapper de scroll horizontal pra TODAS as tabelas — assim
            elas rolam em sincronia no eixo X dentro do limite da página. */}
        <div className="overflow-x-auto">
          <TabelaReceita
            rampUpByMes={rampUpByMes}
            horizonteByMes={horizonteByMes}
            transicoesMeses={transicoesMeses}
          />
          {mode === "unidade" &&
            organizationId &&
            horizonteAtual &&
            investimentoMidia &&
            investimentoMensal !== undefined && (
              <EditorInvestimentoMensal
                organizationId={organizationId}
                horizonteAtual={horizonteAtual}
                investimentoMidia={investimentoMidia}
                investimentoMensal={investimentoMensal}
                realizadoHistorico={realizadoHistorico ?? []}
                rampUpByMes={rampUpByMes}
                horizonteByMes={horizonteByMes}
                transicoesMeses={transicoesMeses}
                dataInicio={dataInicio ?? null}
              />
            )}
          {mode === "unidade" &&
            organizationId &&
            overridesSubcanalMes !== undefined && (
              <EditorSubcanalMensal
                organizationId={organizationId}
                rampUpByMes={rampUpByMes}
                subCanalByKey={subCanalByKey}
                overridesSubcanalMes={overridesSubcanalMes}
                matrizInvestimentoMidia={matrizInvestimentoMidia ?? investimentoMidia ?? []}
                matrizDistSplit={matrizDistSplit ?? []}
                matrizMixSubcanais={matrizMixSubcanais ?? []}
                horizonteByMes={horizonteByMes}
                transicoesMeses={transicoesMeses}
                dataInicio={dataInicio ?? null}
              />
            )}
          {/* Investimento total: no modo unidade a quebra por subcanal e o total
              já vivem nos editores acima (Pace + Alocação por subcanal), então a
              tabela vira redundante. No consolidado da matriz não há editor — é o
              único lugar com o investimento + quebra somados das unidades. */}
          {isMatriz && (
            <TabelaInvestimentoTotal
              rampUpByMes={rampUpByMes}
              horizonteByMes={horizonteByMes}
              transicoesMeses={transicoesMeses}
            />
          )}
          <TabelaCanalSubCanal
            subCanalByKey={subCanalByKey}
            isFechadoByMes={isFechadoByMes}
            subCanalTierByKey={subCanalTierByKey}
            tiersAtivosPorSub={tiersAtivosPorSub}
            horizonteByMes={horizonteByMes}
            transicoesMeses={transicoesMeses}
          />
        </div>
      </>
    </div>
  );
}

// ============================================================
// Seção 1 — Canal × Sub-canal
// ============================================================

/**
 * Funil reverso completo — mesma estrutura no resumo do sub-canal e no
 * detalhe por tier. Won e Receita são decompostos por produto P3.
 * Etapas inaplicáveis por canal são omitidas em `metricasParaSub`.
 */
type SubCanalNumericField =
  | "invest"
  | "leads"
  | "mql"
  | "sql"
  | "sal"
  | "won"
  | "wonSaber"
  | "wonTer"
  | "wonExecutar"
  | "receita"
  | "receitaSaber"
  | "receitaTer"
  | "receitaExecutar";
type MetricaSub = {
  field: SubCanalNumericField;
  label: string;
  fmt: "money" | "int";
  emphasize?: boolean;
  indent?: boolean;
};

const METRICA_INVEST: MetricaSub = { field: "invest", label: "Investimento", fmt: "money" };
const METRICA_LEADS: MetricaSub = { field: "leads", label: "Leads", fmt: "int" };
const METRICA_MQL: MetricaSub = { field: "mql", label: "MQL", fmt: "int" };
const METRICA_SQL: MetricaSub = { field: "sql", label: "SQL", fmt: "int" };
const METRICA_SAL: MetricaSub = { field: "sal", label: "SAL", fmt: "int" };
const METRICA_WON: MetricaSub = { field: "won", label: "Won", fmt: "int", emphasize: true };
const METRICAS_WON_P3: readonly MetricaSub[] = [
  { field: "wonSaber", label: "Saber", fmt: "int", indent: true },
  { field: "wonTer", label: "Ter", fmt: "int", indent: true },
  { field: "wonExecutar", label: "Executar", fmt: "int", indent: true },
];
const METRICA_RECEITA: MetricaSub = { field: "receita", label: "Receita", fmt: "money", emphasize: true };
const METRICAS_RECEITA_P3: readonly MetricaSub[] = [
  { field: "receitaSaber", label: "Saber", fmt: "money", indent: true },
  { field: "receitaTer", label: "Ter", fmt: "money", indent: true },
  { field: "receitaExecutar", label: "Executar", fmt: "money", indent: true },
];

function metricasParaSub(sub: (typeof SUB_CANAIS)[number]): readonly MetricaSub[] {
  if (sub.canal === "outbound") {
    // Outbound: funil curto, sem MQL e sem Invest.
    return [
      METRICA_LEADS,
      METRICA_SQL,
      METRICA_SAL,
      METRICA_WON,
      ...METRICAS_WON_P3,
      METRICA_RECEITA,
      ...METRICAS_RECEITA_P3,
    ];
  }
  if (sub.key === "meeting_broker") {
    // MB: entra direto em SQL — sem Leads de topo, sem MQL.
    return [
      METRICA_INVEST,
      METRICA_SQL,
      METRICA_SAL,
      METRICA_WON,
      ...METRICAS_WON_P3,
      METRICA_RECEITA,
      ...METRICAS_RECEITA_P3,
    ];
  }
  // LB/BB — funil longo, começa em MQL (Leads de topo é métrica de mídia,
  // não do funil de qualificação que importa pra venda).
  return [
    METRICA_INVEST,
    METRICA_MQL,
    METRICA_SQL,
    METRICA_SAL,
    METRICA_WON,
    ...METRICAS_WON_P3,
    METRICA_RECEITA,
    ...METRICAS_RECEITA_P3,
  ];
}

function TabelaCanalSubCanal({
  subCanalByKey,
  isFechadoByMes,
  subCanalTierByKey,
  tiersAtivosPorSub,
  horizonteByMes,
  transicoesMeses,
}: {
  subCanalByKey: Map<string, LinhaSubCanal>;
  isFechadoByMes: Map<string, boolean>;
  subCanalTierByKey: Map<string, LinhaSubCanalTier>;
  tiersAtivosPorSub: Map<SubCanalKey, Tier[]>;
  horizonteByMes?: Map<string, Horizonte>;
  transicoesMeses?: Set<string>;
}) {
  const get = (sub: SubCanalKey, mes: string) => subCanalByKey.get(`${sub}|${mes}`);
  const getTier = (sub: SubCanalKey, tier: Tier, mes: string) =>
    subCanalTierByKey.get(`${sub}|${tier}|${mes}`);
  const inbound = SUB_CANAIS.filter((s) => s.canal === "inbound");
  const outbound = SUB_CANAIS.filter((s) => s.canal === "outbound");

  return (
    <TabelaChrome
      titulo="Canal × Sub-canal"
      horizonteByMes={horizonteByMes}
      transicoesMeses={transicoesMeses}
      skipMesesHeader
    >
      <SecaoCanal
        canalLabel="Inbound"
        subcanais={inbound}
        getMetricas={metricasParaSub}
        getLinha={(s, mes) => get(s.key, mes)}
        getTier={getTier}
        tiersAtivosPorSub={tiersAtivosPorSub}
        isFechadoByMes={isFechadoByMes}
        horizonteByMes={horizonteByMes}
      />
      <SecaoCanal
        canalLabel="Outbound"
        subcanais={outbound}
        getMetricas={metricasParaSub}
        getLinha={(s, mes) => get(s.key, mes)}
        getTier={getTier}
        tiersAtivosPorSub={tiersAtivosPorSub}
        isFechadoByMes={isFechadoByMes}
        horizonteByMes={horizonteByMes}
      />
    </TabelaChrome>
  );
}

/**
 * Uma seção de canal (Inbound ou Outbound) — UM <tbody> que contém:
 *  - O banner do canal: sticky-top:36px (logo abaixo do thead), bg-accent sólido.
 *  - Cada sub-canal: banner sticky-top:72px (logo abaixo do banner do canal) +
 *    rows de métrica agregadas (Won/Leads/Invest/Receita + Saber/Ter/Executar)
 *    + sub-bloco "Por tier" com Won/Leads/Invest/Receita por tier ativo.
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
  getTier,
  tiersAtivosPorSub,
  isFechadoByMes,
  horizonteByMes,
}: {
  canalLabel: string;
  subcanais: readonly (typeof SUB_CANAIS)[number][];
  getMetricas: (s: (typeof SUB_CANAIS)[number]) => readonly MetricaSub[];
  getLinha: (s: (typeof SUB_CANAIS)[number], mes: string) => LinhaSubCanal | undefined;
  getTier: (sub: SubCanalKey, tier: Tier, mes: string) => LinhaSubCanalTier | undefined;
  tiersAtivosPorSub: Map<SubCanalKey, Tier[]>;
  isFechadoByMes: Map<string, boolean>;
  horizonteByMes?: Map<string, Horizonte>;
}) {
  const colSpanTotal = 1 + MESES.length + 1;
  return (
    <tbody>
      {/* Banner do CANAL — sticky-top:36 (logo abaixo do thead h-9). bg-accent
          sólido pra ficar bem visível durante todo o scroll da seção. Cada
          coluna repete o mês + horizonte vigente, com o nome do canal sticky
          à esquerda — assim a info de H1/H2/H3 acompanha cada bloco. */}
      <tr className="border-y border-border bg-accent text-accent-foreground">
        <td className="sticky top-9 left-0 z-40 bg-accent h-9 align-middle">
          <span className="inline-block px-3 text-[11px] uppercase tracking-wider font-semibold">
            {canalLabel}
          </span>
        </td>
        {MESES.map((mes) => {
          const h = horizonteByMes?.get(mes);
          return (
            <td
              key={mes}
              className="sticky top-9 z-30 bg-accent h-9 px-2 text-right text-[10px] uppercase tracking-wider tabular-nums align-middle"
            >
              <div className="flex flex-col items-end leading-tight">
                <span className="font-medium">{mesCurto(mes)}</span>
                {h && (
                  <span className="text-[9px] font-bold tracking-wider text-warning">
                    {h}
                  </span>
                )}
              </div>
            </td>
          );
        })}
        <td className="sticky top-9 z-30 bg-accent h-9 px-2 text-right text-[10px] uppercase tracking-wider font-semibold border-l-2 border-border align-middle">
          Total 2026
        </td>
      </tr>
      {subcanais.map((sub) => {
        const metricas = getMetricas(sub);
        return (
          <SubCanalBlock
            key={sub.key}
            sub={sub}
            metricas={metricas}
            tierMetricas={metricas}
            tiersAtivos={tiersAtivosPorSub.get(sub.key) ?? []}
            getLinha={getLinha}
            getTier={getTier}
            isFechadoByMes={isFechadoByMes}
            colSpanTotal={colSpanTotal}
          />
        );
      })}
    </tbody>
  );
}

/**
 * Um sub-canal completo: banner sticky + linhas agregadas + sub-bloco "Por tier"
 * collapsible (fechado por padrão). Cada instância mantém seu próprio
 * `tierOpen` — assim o usuário abre só o que quer comparar.
 */
function SubCanalBlock({
  sub,
  metricas,
  tierMetricas,
  tiersAtivos,
  getLinha,
  getTier,
  isFechadoByMes,
  colSpanTotal,
}: {
  sub: (typeof SUB_CANAIS)[number];
  metricas: readonly MetricaSub[];
  tierMetricas: readonly MetricaSub[];
  tiersAtivos: Tier[];
  getLinha: (s: (typeof SUB_CANAIS)[number], mes: string) => LinhaSubCanal | undefined;
  getTier: (sub: SubCanalKey, tier: Tier, mes: string) => LinhaSubCanalTier | undefined;
  isFechadoByMes: Map<string, boolean>;
  colSpanTotal: number;
}) {
  const [tierOpen, setTierOpen] = useState(false);
  const Chevron = tierOpen ? ChevronDown : ChevronRight;
  return (
    <Fragment>
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
          <tr key={m.field} className={`border-b border-border/60 ${rowBg}`}>
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
      {tiersAtivos.length > 0 && (
        <>
          {/* Toggle do sub-bloco "Por tier" — botão sticky-left dentro do td.
              Default fechado; ao abrir, renderiza as linhas de detalhe. */}
          <tr className="border-t border-border/60 bg-muted/15">
            <td colSpan={colSpanTotal} className="py-0">
              <button
                type="button"
                onClick={() => setTierOpen((v) => !v)}
                aria-expanded={tierOpen}
                className="sticky left-0 inline-flex items-center gap-1.5 pl-9 pr-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium hover:text-foreground transition-colors"
              >
                <Chevron className="h-3 w-3" />
                Por tier de cliente
                <span className="text-muted-foreground/60 normal-case tracking-normal">
                  · {tiersAtivos.length} tier{tiersAtivos.length > 1 ? "s" : ""}
                </span>
              </button>
            </td>
          </tr>
          {tierOpen &&
            tiersAtivos.map((tier) => (
              <Fragment key={`${sub.key}-${tier}`}>
                <tr className="border-y border-accent/30">
                  <td colSpan={colSpanTotal} className="bg-accent/10 py-1.5">
                    <span className="sticky left-0 inline-block pl-12 pr-3 text-[11px] uppercase tracking-wider text-accent font-semibold">
                      {tier}
                    </span>
                  </td>
                </tr>
                {tierMetricas.map((m) => {
                  const totalAno = MESES.reduce(
                    (acc, mes) => acc + (getTier(sub.key, tier, mes)?.[m.field] ?? 0),
                    0,
                  );
                  const labelBg = m.emphasize ? "bg-muted/30" : "bg-card";
                  const rowBg = m.emphasize ? "bg-muted/20 font-semibold" : "hover:bg-muted/15";
                  const labelPad = m.indent ? "pl-20 pr-3" : "pl-16 pr-3";
                  return (
                    <tr
                      key={`${sub.key}-${tier}-${m.field}`}
                      className={`border-b border-border/40 ${rowBg}`}
                    >
                      <td className={`sticky left-0 z-10 ${labelBg} border-r border-border ${labelPad} py-1.5 text-[11px] text-muted-foreground`}>
                        {m.label}
                      </td>
                      {MESES.map((mes) => {
                        const v = getTier(sub.key, tier, mes)?.[m.field] ?? 0;
                        return (
                          <Cell
                            key={mes}
                            valor={v}
                            fmt={m.fmt}
                            fechado={isFechadoByMes.get(mes) ?? false}
                          />
                        );
                      })}
                      <CellTotal valor={totalAno} fmt={m.fmt} />
                    </tr>
                  );
                })}
              </Fragment>
            ))}
        </>
      )}
    </Fragment>
  );
}


// ============================================================
// Seção 2 — Receita
// ============================================================

const METRICAS_RECEITA: Array<MetricRampUp> = [
  {
    label: "Meta Matriz",
    get: (l) => l.metaMatriz,
    fmt: "money",
    emphasize: true,
  },
  {
    label: "Δ vs Meta",
    get: (l) => l.deltaMeta,
    fmt: "money",
    signed: true,
    indent: true,
  },
  {
    label: "Receita Total",
    get: (l) => l.recTotal,
    fmt: "money",
    emphasize: true,
  },
  { label: "Saber", get: (l) => l.saber, fmt: "money", indent: true },
  { label: "Ter", get: (l) => l.ter, fmt: "money", indent: true },
  { label: "Executar", get: (l) => l.executar, fmt: "money", indent: true },
  { label: "Receita Inbound", get: (l) => l.recInbound, fmt: "money", muted: true },
  { label: "Receita Outbound", get: (l) => l.recOutbound, fmt: "money", muted: true },
];

function TabelaReceita({
  rampUpByMes,
  horizonteByMes,
  transicoesMeses,
}: {
  rampUpByMes: Map<string, LinhaRampUp>;
  horizonteByMes?: Map<string, Horizonte>;
  transicoesMeses?: Set<string>;
}) {
  return (
    <TabelaChrome
      titulo="Receita"
      horizonteByMes={horizonteByMes}
      transicoesMeses={transicoesMeses}
    >
      <tbody>
        {METRICAS_RECEITA.map((m) => (
          <MetricRowRampUp key={m.label} metric={m} byMes={rampUpByMes} />
        ))}
      </tbody>
    </TabelaChrome>
  );
}

// ============================================================
// Seção 3 — Investimento total
// ============================================================

const METRICAS_INVESTIMENTO: Array<MetricRampUp> = [
  { label: "Investimento Total", get: (l) => l.investTotal, fmt: "money", emphasize: true },
  { label: "Lead Broker", get: (l) => l.investLb, fmt: "money", indent: true },
  { label: "Black Box", get: (l) => l.investBb, fmt: "money", indent: true },
  { label: "Meeting Broker", get: (l) => l.investMb, fmt: "money", indent: true },
  { label: "Eventos", get: (l) => l.investEv, fmt: "money", indent: true },
];

function TabelaInvestimentoTotal({
  rampUpByMes,
  horizonteByMes,
  transicoesMeses,
}: {
  rampUpByMes: Map<string, LinhaRampUp>;
  horizonteByMes?: Map<string, Horizonte>;
  transicoesMeses?: Set<string>;
}) {
  return (
    <TabelaChrome
      titulo="Investimento total"
      horizonteByMes={horizonteByMes}
      transicoesMeses={transicoesMeses}
    >
      <tbody>
        {METRICAS_INVESTIMENTO.map((m) => (
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
  horizonteByMes,
  transicoesMeses,
  /** Quando true, omite o thead com os meses — útil quando o tbody já tem
   *  um banner (ex.: Canal × Sub-canal) que duplica essa info. */
  skipMesesHeader = false,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  totalLabel?: string;
  rodape?: string;
  /** Horizonte efetivo por mês — quando definido, exibe badge sob o nome do mês. */
  horizonteByMes?: Map<string, Horizonte>;
  /** Conjunto de meses onde houve transição de horizonte — recebem borda accent. */
  transicoesMeses?: Set<string>;
  skipMesesHeader?: boolean;
  children: React.ReactNode;
}) {
  const showH = horizonteByMes !== undefined;
  return (
    // Card full-width (w-full) — tabela interna usa width: 100% com
    // MIN_TABLE_WIDTH. O scroll horizontal unificado fica num wrapper externo
    // que abraça todas as tabelas, então elas rolam juntas se preciso.
    <div className="rounded border border-border bg-card mb-5 w-full">
      {/* Header do card — texto sticky-left pra ficar visível durante scroll
          horizontal; o bg do bar acompanha a largura da tabela. */}
      <div className="border-b border-border bg-muted/20 py-2.5">
        <div className="sticky left-0 inline-flex items-baseline gap-2 px-4">
          <h2 className="text-xs uppercase tracking-wider font-semibold text-foreground">{titulo}</h2>
          {subtitulo && <span className="text-[10px] text-muted-foreground">— {subtitulo}</span>}
        </div>
      </div>
      <table
        className="text-sm border-collapse table-fixed w-full"
        style={{ minWidth: MIN_TABLE_WIDTH }}
      >
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
        {!skipMesesHeader && (
          <thead>
            <tr>
              {/* Corner cell — sticky em ambos os eixos, z-index mais alto pra cobrir
                  tudo na interseção. */}
              <th className="sticky top-0 left-0 z-50 bg-table-header text-table-header-foreground px-3 py-2 text-left text-[10px] uppercase tracking-wider border-r border-border"></th>
              {MESES.map((mes) => {
                const h = horizonteByMes?.get(mes);
                const isTransition = transicoesMeses?.has(mes) ?? false;
                return (
                  <th
                    key={mes}
                    className={`sticky top-0 z-40 bg-table-header text-table-header-foreground h-auto font-medium px-2 py-2 text-right text-[10px] uppercase tracking-wider tabular-nums whitespace-nowrap ${
                      isTransition ? "border-l-2 border-l-accent" : ""
                    }`}
                    title={
                      h
                        ? `${formatMesPt(mes)} — premissas aplicadas: ${h}`
                        : formatMesPt(mes)
                    }
                  >
                    <div className="flex flex-col items-end leading-tight">
                      <span>{mesCurto(mes)}</span>
                      {showH && h && (
                        <span
                          className={`text-[9px] font-bold mt-0.5 tracking-wider ${
                            isTransition ? "text-warning" : "text-warning/85"
                          }`}
                        >
                          {h}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
              <th className="sticky top-0 z-40 bg-accent/15 text-accent h-auto px-2 py-2 text-right text-[10px] uppercase tracking-wider tabular-nums font-semibold border-l-2 border-border whitespace-nowrap">
                {totalLabel}
              </th>
            </tr>
          </thead>
        )}
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
  get: (l: LinhaRampUp) => number;
  fmt: Fmt;
  total?: "sum" | "max" | "weighted";
  emphasize?: boolean;
  indent?: boolean;
  /** Colore o valor: positivo em verde, negativo em bordô (linhas de delta). */
  signed?: boolean;
  /** Linha cinza de rodapé — visualmente destacada do bloco principal
   *  (ex.: receita por canal, somada à parte da decomposição por produto). */
  muted?: boolean;
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
  const labelBg = metric.muted ? "bg-muted/60" : metric.emphasize ? "bg-muted/40" : "bg-card";
  const rowBg = metric.muted
    ? "bg-muted/40 text-muted-foreground"
    : metric.emphasize
      ? "bg-muted/30 font-semibold"
      : "hover:bg-muted/20";
  // Linhas cinza de canal ganham um separador superior pra ler como rodapé.
  const sep = metric.muted ? "border-t border-border" : "";
  return (
    <tr className={`border-b border-border/60 ${sep} ${rowBg}`}>
      <td className={`sticky left-0 z-10 ${labelBg} border-r border-border ${metric.indent ? "pl-8 pr-3" : "px-3"} py-2 text-xs text-foreground font-medium`}>
        <span className="inline-flex items-center gap-1">
          {metric.label}
        </span>
      </td>
      {MESES.map((mes) => {
        const linha = byMes.get(mes);
        const v = linha ? metric.get(linha) : 0;
        const isFechado = linha?.isFechado ?? false;
        return <Cell key={mes} valor={v} fmt={metric.fmt} fechado={isFechado} signed={metric.signed} />;
      })}
      <CellTotal valor={tot} fmt={metric.fmt} signed={metric.signed} />
    </tr>
  );
}

/** Cor do valor em linhas signed: positivo = success, negativo = bordô (destructive). */
function signedColor(valor: number): string {
  return valor > 0 ? "text-success" : valor < 0 ? "text-destructive" : "text-muted-foreground/40";
}

function Cell({
  valor,
  fmt,
  fechado,
  signed,
}: {
  valor: number;
  fmt: Fmt;
  fechado?: boolean;
  signed?: boolean;
}) {
  const cor = signed
    ? signedColor(valor)
    : valor === 0
      ? "text-muted-foreground/40"
      : "text-muted-foreground";
  return (
    <td
      className={`px-2 py-2 text-[11px] text-right tabular-nums whitespace-nowrap ${fechado ? "bg-info/5" : ""} ${cor}`}
      title={fechado ? "Mês fechado (realizado)" : undefined}
    >
      {valor === 0 ? "—" : formatar(valor, fmt)}
    </td>
  );
}

function CellTotal({ valor, fmt, signed }: { valor: number; fmt: Fmt; signed?: boolean }) {
  const cor = signed ? signedColor(valor) : "text-foreground";
  return (
    <td className={`px-2 py-2 text-[11px] text-right tabular-nums whitespace-nowrap bg-accent/10 font-semibold ${cor} border-l-2 border-border`}>
      {valor === 0 ? "—" : formatar(valor, fmt)}
    </td>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums text-foreground">{value}</div>
    </div>
  );
}
