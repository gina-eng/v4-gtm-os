"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { usePersistBlock } from "./persist-block";
import { PremissasModeloTab } from "./tabs/premissas-modelo-tab";
import { ConversoesTab } from "./tabs/conversoes-tab";
import { TimeCapacidade } from "./time-capacidade";
import { EditableSection, SectionBadge } from "./editable-section";
import { CurrencyCell, IntegerCell } from "./editable-cell";
import { formatBRL } from "./format";
import type { PremissasBlocks } from "@/db/repositories/premissas";
import type { LinhaRampUp } from "@/lib/premissas/funil-reverso";
import type {
  Horizonte,
  InvestimentoMidia,
  MetricaOperacional,
  RealizadoMensal,
  TimeComercialMembro,
} from "@/lib/premissas/matriz-defaults";
import {
  formatMesPt,
  getMesAncora,
  MESES_ANO_2026,
  ULTIMO_MES_FECHADO,
} from "@/lib/realizado/projecao";

type CacContext = {
  investido: number;
  won: number;
  faturamento: number;
  unidades: number;
} | null;

type Tab = "time-capacidade" | "premissas" | "conversoes";

const TABS: Array<{ id: Tab; label: string; sub: string }> = [
  { id: "time-capacidade", label: "TIME & CAPACIDADE", sub: "Pessoas + capacidade" },
  { id: "premissas", label: "INVESTIMENTO, DISTRIBUIÇÃO DE TIERS & RECEITAS", sub: "Valores do modelo" },
  { id: "conversoes", label: "CONVERSÕES", sub: "CRs por canal" },
];

type Props = {
  unitName: string;
  organizationId: string;
  horizonteAtual: Horizonte;
  /** Data de inauguração da unidade — define o mês-âncora do realizado. */
  dataInicio: string | null;
  blocks: PremissasBlocks;
  cacContext: CacContext;
  /** Investimento em mídia da Matriz — referência só-leitura ("bench") ao lado do % editável da unidade. */
  investimentoMidiaMatriz: InvestimentoMidia[];
  /** Ramp-up do forecast da unidade — base da comissão por produção (aba Time & Capacidade). */
  linhasRampUp: LinhaRampUp[];
  /** Time real da unidade (modelo completo por pessoa) — aba Time & Capacidade. */
  team: TimeComercialMembro[];
  /** Métricas operacionais por cargo da unidade. */
  metrics: MetricaOperacional[];
  /** Premissa da Matriz por cargo — alimenta os badges de diferença das métricas. */
  metricsMatriz: MetricaOperacional[];
  realizadoHistorico: RealizadoMensal[];
  completedSteps: readonly string[];
  totalSteps: number;
  /** ISO string do momento em que o setup foi concluído, ou null se incompleto. */
  completedAt: string | null;
};

/**
 * Visão consolidada e EDITÁVEL do que a unidade preencheu no setup guiado
 * (/iniciar). Reúne num só item de menu os mesmos blocos editáveis de /premissas
 * (modelo + conversões) — aqui apontando para as premissas da própria unidade —
 * mais o Realizado Histórico, que só existia dentro do wizard.
 *
 * O passo-a-passo segue existindo só pra guiar o primeiro preenchimento; aqui o
 * usuário ajusta qualquer campo direto, sem reabrir o wizard. A persistência
 * reusa os mesmos endpoints: /api/premissas (blocos) e /api/units/[id]/setup
 * (realizado) — ambos já revalidam o forecast da unidade.
 */
export function PremissasUnidadeClient({
  unitName,
  organizationId,
  horizonteAtual,
  dataInicio,
  blocks,
  cacContext,
  investimentoMidiaMatriz,
  linhasRampUp,
  team,
  metrics,
  metricsMatriz,
  realizadoHistorico,
  completedSteps,
  totalSteps,
  completedAt,
}: Props) {
  const [tab, setTab] = useState<Tab>("time-capacidade");
  const persistBlock = usePersistBlock();
  const completedCount = completedSteps.length;
  const allDone = completedCount >= totalSteps;

  return (
    <>
      {/* ========== TÍTULO + STATUS ========== */}
      <div className="mb-4">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-1">
              {unitName}
            </div>
            <h1 className="text-2xl font-semibold text-foreground">Premissas da Unidade</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Edite aqui o que você configurou no setup — cada seção salva ao confirmar.
              O <em>setup guiado</em> segue disponível pra refazer o passo-a-passo.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {allDone ? (
              <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-success/15 text-success">
                  <Check className="h-3.5 w-3.5" />
                </span>
                Setup concluído
                {completedAt
                  ? ` em ${new Date(completedAt).toLocaleDateString("pt-BR", {
                      // timeZone fixo evita hydration mismatch (#418): perto da
                      // meia-noite UTC, server e browser cairiam em dias diferentes.
                      timeZone: "America/Sao_Paulo",
                    })}`
                  : ""}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                {completedCount} de {totalSteps} passos concluídos
              </div>
            )}
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success inline-block" />
              Salvo na própria unidade
            </div>
          </div>
        </div>
      </div>

      {/* ========== TABS ========== */}
      <div className="flex items-end border-b border-border mb-4">
        <div className="flex">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex flex-col items-start gap-0.5 px-5 pt-2 pb-2 -mb-px border-b-2 transition-colors ${
                  active
                    ? "border-accent text-accent"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="text-xs font-semibold uppercase tracking-wider">{t.label}</span>
                <span className="text-[10px] text-muted-foreground">{t.sub}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ========== CONTEÚDO DA TAB ========== */}
      {tab === "time-capacidade" && (
        <TimeCapacidadeEditable
          organizationId={organizationId}
          initialTeam={team}
          initialMetrics={metrics}
          metricsMatriz={metricsMatriz}
          cacContext={cacContext}
          linhasRampUp={linhasRampUp}
          dataInicio={dataInicio}
        />
      )}
      {tab === "premissas" && (
        <PremissasModeloTab
          canEdit
          tiersReadOnly
          horizontesReadOnly
          showTimeCapacidade={false}
          investimentoMidiaMatriz={investimentoMidiaMatriz}
          horizonteAtual={horizonteAtual}
          cacContext={cacContext}
          blocks={blocks}
          persist={persistBlock}
        />
      )}
      {tab === "conversoes" && (
        <ConversoesTab canEdit blocks={blocks} persist={persistBlock} />
      )}
    </>
  );
}

// ============================================================
// Time & Capacidade (editável) — time real por pessoa + capacidade operacional.
// Persiste os dois blocos pelo setup endpoint (que revalida o forecast da
// unidade) e dá router.refresh() pra refletir na hora — mesmo padrão dos outros
// editores. A UI (tabelas + cards ao vivo) vem do TimeCapacidade compartilhado.
// ============================================================

async function patchSetupStep(
  organizationId: string,
  step: "time-comercial" | "metricas-operacionais",
  data: unknown,
): Promise<string | null> {
  try {
    const res = await fetch(`/api/units/${organizationId}/setup`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step, data }),
    });
    if (res.ok) return null;
    const body = await res.json().catch(() => ({}));
    return body.error ?? "Não foi possível salvar.";
  } catch (err) {
    return err instanceof Error ? err.message : "Erro de rede ao salvar.";
  }
}

function TimeCapacidadeEditable({
  organizationId,
  initialTeam,
  initialMetrics,
  metricsMatriz,
  cacContext,
  linhasRampUp,
  dataInicio,
}: {
  organizationId: string;
  initialTeam: TimeComercialMembro[];
  initialMetrics: MetricaOperacional[];
  metricsMatriz: MetricaOperacional[];
  cacContext: CacContext;
  linhasRampUp: LinhaRampUp[];
  dataInicio: string | null;
}) {
  const router = useRouter();
  const [team, setTeam] = useState<TimeComercialMembro[]>(initialTeam);
  const [metrics, setMetrics] = useState<MetricaOperacional[]>(initialMetrics);
  const [savedTeam, setSavedTeam] = useState<TimeComercialMembro[]>(initialTeam);
  const [savedMetrics, setSavedMetrics] = useState<MetricaOperacional[]>(initialMetrics);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const dirty =
    JSON.stringify(team) !== JSON.stringify(savedTeam) ||
    JSON.stringify(metrics) !== JSON.stringify(savedMetrics);

  async function handleSave() {
    if (status === "saving" || !dirty) return;
    setStatus("saving");
    setErrorMsg(null);
    const e1 = await patchSetupStep(organizationId, "time-comercial", team);
    if (e1) {
      setErrorMsg(e1);
      setStatus("error");
      return;
    }
    const e2 = await patchSetupStep(organizationId, "metricas-operacionais", metrics);
    if (e2) {
      setErrorMsg(e2);
      setStatus("error");
      return;
    }
    setSavedTeam(team);
    setSavedMetrics(metrics);
    setStatus("saved");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <TimeCapacidade
        team={team}
        metrics={metrics}
        onTeamChange={(rows) => {
          setTeam(rows);
          setStatus("idle");
        }}
        onMetricsChange={(rows) => {
          setMetrics(rows);
          setStatus("idle");
        }}
        metricsMatriz={metricsMatriz}
        cacContext={cacContext}
        linhasRampUp={linhasRampUp}
        dataInicio={dataInicio}
      />
      <div className="sticky bottom-0 flex items-center justify-end gap-3 rounded border border-border bg-card/95 backdrop-blur px-4 py-2.5">
        {errorMsg && <span className="mr-auto text-xs text-destructive">{errorMsg}</span>}
        {status === "saved" && !dirty && (
          <span className="mr-auto inline-flex items-center gap-1.5 text-xs text-success">
            <Check className="h-3.5 w-3.5" /> Salvo na própria unidade
          </span>
        )}
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setTeam(savedTeam);
              setMetrics(savedMetrics);
              setStatus("idle");
              setErrorMsg(null);
            }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Descartar
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || status === "saving"}
          className="inline-flex h-8 items-center gap-1.5 rounded bg-accent px-4 text-xs font-medium text-accent-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === "saving" ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>
    </div>
  );
}
