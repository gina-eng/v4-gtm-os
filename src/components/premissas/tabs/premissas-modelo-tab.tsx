"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { EditableSection, SectionBadge } from "../editable-section";
import { FieldHelp } from "@/components/ui/field-help";
import {
  CurrencyCell,
  IntegerCell,
  NullableCurrencyCell,
  NullableIntegerCell,
  PercentCell,
} from "../editable-cell";
import { formatBRL, formatPercent } from "../format";
import {
  CARGOS_COMERCIAIS,
  METRICAS_OPERACIONAIS_DEFAULT,
  type InvestimentoMidia,
  type MetricaOperacional,
  type MixOutboundHorizonte,
  type TimeComercialMembro,
} from "@/lib/premissas/matriz-defaults";
import type { PremissaBlockPatch, PremissasBlocks } from "@/db/repositories/premissas";
import { CargoSelect } from "@/components/iniciar/cargo-select";

type PersistBlock = (patch: PremissaBlockPatch) => Promise<boolean>;

type CacContext = {
  investido: number;
  won: number;
  /** Faturamento realizado do último mês fechado — base da comissão por produção. */
  faturamento: number;
  unidades: number;
} | null;

type Props = {
  canEdit: boolean;
  /** Horizonte da unidade impersonada a destacar (P1/P6). null na visão matriz consolidada. */
  horizonteAtual: Horizonte["h"] | null;
  cacContext: CacContext;
  blocks: PremissasBlocks;
  persist: PersistBlock;
  /**
   * Tiers de Cliente (P2 — faixas de faturamento, TCV, CPL/CPMQL) são premissa
   * travada da Matriz: a unidade não negocia tier, só visualiza. Quando true, a
   * seção inteira fica só-leitura (sem botão Editar). Default false (matriz edita).
   */
  tiersReadOnly?: boolean;
  /**
   * Horizontes de Crescimento (P1 — faixas de faturamento, prazo e crescimento
   * mínimo por horizonte) são premissa travada da Matriz: a unidade não negocia
   * os horizontes, só visualiza. Quando true, a seção fica só-leitura (sem botão
   * Editar) e exibe o selo "Matriz". Default false (matriz edita).
   */
  horizontesReadOnly?: boolean;
  /**
   * Mostra Time Comercial + Capacidade Operacional no topo (template por cargo).
   * Default true (matriz). O /premissas-unidade passa false — lá o time vive na
   * aba dedicada "Time & Capacidade", com o modelo completo por pessoa.
   */
  showTimeCapacidade?: boolean;
  /**
   * Mostra a seção "Receita por Produto / Tier" (P3 — adesão/ticket + CPMQL por
   * tier). Default true (matriz e wizard). O /premissas-unidade passa false: como
   * é premissa travada da Matriz que a unidade só visualizaria, a seção fica
   * oculta na aba PREMISSAS da unidade. O dado segue alimentando o forecast.
   */
  showReceitaProduto?: boolean;
  /**
   * Investimento em mídia da Matriz, exibido como referência só-leitura ("bench")
   * ao lado do % editável da unidade — pra não perder a premissa-base depois de
   * editar. Ausente na visão Matriz (lá o próprio valor já é a premissa).
   */
  investimentoMidiaMatriz?: InvestimentoMidia[];
};

/** Mapeia o membro simplificado da tela pro shape completo do bloco (template da matriz). */
function toMembroBlock(m: Membro): TimeComercialMembro {
  return { email: "", cargo: m.cargo, salario: m.salario, comissaoPct: m.comissaoPct, capacidadePct: 100 };
}

export function PremissasModeloTab({ canEdit, horizonteAtual, cacContext, blocks, persist, tiersReadOnly = false, horizontesReadOnly = false, showTimeCapacidade = true, showReceitaProduto = true, investimentoMidiaMatriz }: Props) {
  // Estado do TIME COMERCIAL fica aqui pra alimentar P17 com os mesmos cargos.
  // Cada cargo cadastrado no TIME vira uma linha na Capacidade Operacional.
  const [team, setTeam] = useState<Membro[]>(() =>
    blocks.timeComercial.map((m) => ({ cargo: m.cargo, salario: m.salario, comissaoPct: m.comissaoPct })),
  );
  const cargos = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const m of team) {
      if (!seen.has(m.cargo)) {
        seen.add(m.cargo);
        out.push(m.cargo);
      }
    }
    return out;
  }, [team]);

  // tiersCliente é UM bloco editado em DUAS seções: faixas de faturamento ficam
  // em "Tiers de Cliente"; CPMQL (LB/BB/MT) migrou pra "Receita por Produto / Tier".
  // Guardamos o array num só lugar (fonte da verdade) pra que salvar uma seção não
  // sobrescreva os campos editados na outra — setTiers é síncrono, sem flicker.
  const [tiers, setTiers] = useState<TierCliente[]>(blocks.tiersCliente);
  const persistTiers = useCallback(
    async (next: TierCliente[]) => {
      setTiers(next);
      return persist({ block: "tiersCliente", data: next });
    },
    [persist],
  );

  return (
    <>
      {showTimeCapacidade && (
        <>
          <TimeComercialSection
            canEdit={canEdit}
            team={team}
            onTeamChange={setTeam}
            cacContext={cacContext}
            onPersist={(rows) => persist({ block: "timeComercial", data: rows.map(toMembroBlock) })}
          />

          {/* P17 — capacidade / operação */}
          <CapacidadeSection
            canEdit={canEdit}
            cargos={cargos}
            initial={blocks.metricasOperacionais}
            onPersist={(rows) => persist({ block: "metricasOperacionais", data: rows })}
          />
        </>
      )}

      {/* P1 — horizontes (premissa travada da Matriz: a unidade só visualiza) */}
      <HorizontesSection
        canEdit={canEdit && !horizontesReadOnly}
        matrizLocked={horizontesReadOnly}
        horizonteAtual={horizonteAtual}
        initial={blocks.horizontes}
        onPersist={(rows) => persist({ block: "horizontes", data: rows })}
      />

      {/* P6 — investimento em mídia */}
      <InvestimentoMidiaSection
        canEdit={canEdit}
        horizonteAtual={horizonteAtual}
        initial={blocks.investimentoMidia}
        matriz={investimentoMidiaMatriz}
        onPersist={(rows) => persist({ block: "investimentoMidia", data: rows })}
      />

      {/* P3 — receita por produto / tier (+ CPMQL por tier, travado na Matriz).
          Oculto na aba PREMISSAS da unidade (showReceitaProduto=false): premissa
          da Matriz que a unidade só visualizaria. */}
      {showReceitaProduto && (
        <ReceitaProdutoSection
          canEdit={canEdit}
          cpmqlReadOnly={tiersReadOnly}
          tiers={tiers}
          initial={blocks.receitaProduto}
          onPersist={(rows) => persist({ block: "receitaProduto", data: rows })}
          onPersistTiers={persistTiers}
          meetingBrokerCustoSql={blocks.conversoesInbound.meetingBroker.custoSql}
          eventosCustoSql={blocks.conversoesInbound.eventosCusto.custoSql}
          onPersistMeetingBrokerCusto={(custoSql) =>
            persist({
              block: "meetingBroker",
              data: { ...blocks.conversoesInbound.meetingBroker, custoSql },
            })
          }
          onPersistEventosCusto={(custoSql) =>
            persist({
              block: "eventosCusto",
              data: { ...blocks.conversoesInbound.eventosCusto, custoSql },
            })
          }
        />
      )}

      {/* P4 — distribuição de tier por horizonte. À esquerda, premissa travada da
          Matriz: faixas de faturamento (FAT. MIN/MÁX), % de mercado e grade de
          liberação por tier (antiga seção "Tiers de Cliente", agora embutida aqui).
          À direita, o split por horizonte que a unidade ajusta (linha = 100%). */}
      <DistribuicaoLeadsSection
        canEdit={canEdit}
        mercadoReadOnly={tiersReadOnly}
        tiers={tiers}
        produtos={blocks.receitaProduto}
        onPersistTiers={persistTiers}
        initial={blocks.distMercado}
        onPersist={(rows) => persist({ block: "distMercado", data: rows })}
        initialSplit={blocks.distSplit}
        onPersistSplit={(rows) => persist({ block: "distSplit", data: rows })}
      />

      {/* P16 — mix de subcanais outbound (% de leads) por horizonte */}
      <MixSubcanaisSection
        canEdit={canEdit}
        seed={blocks.mixSubcanais}
        onPersist={(data) => persist({ block: "mixSubcanais", data })}
      />
    </>
  );
}

// ============================================================
// TIME COMERCIAL (extra de UI — alimenta CAC dinâmico)
// ============================================================

type Membro = { cargo: string; salario: number; comissaoPct: number };

function TimeComercialSection({
  canEdit,
  team,
  onTeamChange,
  cacContext,
  onPersist,
}: {
  canEdit: boolean;
  team: Membro[];
  onTeamChange: (next: Membro[]) => void;
  cacContext: CacContext;
  onPersist: (rows: Membro[]) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Membro[]>(team);
  const [isEditing, setIsEditing] = useState(false);
  const rows = isEditing ? draft : team;

  // Investido e Won vêm do último mês fechado do Realizado Histórico.
  // - Unidade: dados da própria unidade.
  // - Matriz: soma de todas as unidades visíveis.
  // - Sem dado preenchido (cacContext=null): CAC não é exibido.
  const investidoUltMes = cacContext?.investido ?? 0;
  const wonUltMes = cacContext?.won ?? 0;
  // Comissão incide sobre a produção (faturamento realizado do último mês
  // fechado), trazida pra escala de UMA unidade — o time aqui é template por
  // unidade, mas o faturamento pode vir somado de N unidades (visão matriz).
  // Cada cargo (1 pessoa, capacidade cheia no template) incide sobre a produção
  // do cargo, então comissão da linha = comissão% × produção/cargo.
  const faturamentoUltMes = cacContext?.faturamento ?? 0;
  const producaoPorCargo = faturamentoUltMes / Math.max(cacContext?.unidades ?? 1, 1);
  const custoMes = (m: Membro): number => m.salario + (m.comissaoPct / 100) * producaoPorCargo;
  const custoTimeTotal = rows.reduce((acc, m) => acc + custoMes(m), 0);
  const cacCalculado = wonUltMes > 0 ? (custoTimeTotal + investidoUltMes) / wonUltMes : 0;
  const cacIndisponivel = cacContext === null;

  return (
    <EditableSection
      title="TIME COMERCIAL"
      badge={<SectionBadge>Calculado → CAC dinâmico</SectionBadge>}
      canEdit={canEdit}
      isEditing={isEditing}
      onEdit={() => {
        setDraft(team);
        setIsEditing(true);
      }}
      onSave={() => {
        onTeamChange(draft);
        setIsEditing(false);
        void onPersist(draft);
      }}
      onCancel={() => {
        setDraft(team);
        setIsEditing(false);
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <Th>Cargo</Th>
              <Th align="right">Salário Base</Th>
              <Th align="right">Comissão %</Th>
              <Th align="right">Custo/Mês Est.</Th>
              <Th align="right"> </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, idx) => {
              const isPrincipal = (CARGOS_COMERCIAIS as readonly string[]).includes(m.cargo);
              return (
                <tr
                  key={`row-${idx}`}
                  className={`${idx % 2 === 0 ? "bg-card" : "bg-muted/30"} border-b border-border/60`}
                >
                  <td className="px-1.5 py-2 text-xs font-medium text-accent">
                    {isEditing && !isPrincipal ? (
                      <CargoSelect
                        value={m.cargo}
                        onChange={(v) =>
                          setDraft((p) => p.map((r, i) => (i === idx ? { ...r, cargo: v } : r)))
                        }
                      />
                    ) : (
                      <span
                        className="inline-flex items-center gap-1"
                        title={isPrincipal ? "Cargo padrão da Matriz — não pode ser removido nem renomeado" : undefined}
                      >
                        {m.cargo || <span className="text-muted-foreground/60">—</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-1.5 py-2 text-xs text-right">
                    <CurrencyCell
                      isEditing={isEditing}
                      value={m.salario}
                      onChange={(v) =>
                        setDraft((p) => p.map((r, i) => (i === idx ? { ...r, salario: v } : r)))
                      }
                    />
                  </td>
                  <td className="px-1.5 py-2 text-xs text-right">
                    <PercentCell
                      isEditing={isEditing}
                      value={m.comissaoPct}
                      onChange={(v) =>
                        setDraft((p) =>
                          p.map((r, i) => (i === idx ? { ...r, comissaoPct: v } : r)),
                        )
                      }
                    />
                  </td>
                  <td className="px-1.5 py-2 text-xs text-right tabular-nums text-success font-medium">
                    {formatBRL(custoMes(m))}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isEditing && !isPrincipal ? (
                      <button
                        type="button"
                        onClick={() => setDraft((p) => p.filter((_, i) => i !== idx))}
                        className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-destructive"
                        aria-label="Remover cargo customizado"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            CAC calculado (últ. mês fechado)
          </div>
          {cacIndisponivel ? (
            <>
              <div className="text-xl font-bold text-muted-foreground tabular-nums">—</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Sem realizado preenchido. Custo time {formatBRL(custoTimeTotal)} · preencha investido + won em <em>Forecast</em>.
              </div>
            </>
          ) : (
            <>
              <div className="text-xl font-bold text-accent tabular-nums">{formatBRL(cacCalculado)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Custo time {formatBRL(custoTimeTotal)} · Investido {formatBRL(investidoUltMes)} ·{" "}
                {wonUltMes} won · comissão s/ produção {formatBRL(producaoPorCargo)}/cargo
                {cacContext && cacContext.unidades > 1 ? ` · soma de ${cacContext.unidades} unidades` : ""}
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            if (!isEditing) return;
            // Cargo vazio cai no estado OUTRO do CargoSelect, abrindo o input
            // de texto pra digitar um cargo customizado. Os 5 principais já estão
            // sempre seedados e travados, então "adicionar" sempre cria um custom.
            setDraft((p) => [...p, { cargo: "", salario: 0, comissaoPct: 0 }]);
          }}
          disabled={!isEditing}
          title="Adiciona um cargo customizado — os 5 principais (LDR, BDR, SDR, CLOSER, KAM) já são fixos da Matriz."
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[11px] font-medium border border-dashed border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/40 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-3 w-3" />
          Adicionar cargo custom
        </button>
      </div>
    </EditableSection>
  );
}

// ============================================================
// P17 — CAPACIDADE OPERACIONAL (Closer / SDR / BDR)
// Todos os campos quantitativos exceto `extra` (qualitativo livre).
// ============================================================

const CAP_NUM_COLS: Array<{
  key: keyof MetricaOperacional;
  label: string;
  suffix?: string;
}> = [
  {
    key: "wipLimit",
    label: "WIP Limit",
    suffix: "/mês",
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

function defaultMetricFor(cargo: string): MetricaOperacional {
  const known = METRICAS_OPERACIONAIS_DEFAULT.find((m) => m.cargo === cargo);
  if (known) return { ...known };
  return {
    cargo,
    wipLimit: 0,
    contratacao: 60,
    onboarding: 30,
    rampagem: 5,
    atingimentoMes: 6,
    permanencia: 24,
    turnoverMesPct: 1.7,
    ligacoesMes: 0,
    conexaoPct: 0,
  };
}

function CapacidadeSection({
  canEdit,
  cargos,
  initial,
  onPersist,
}: {
  canEdit: boolean;
  cargos: string[];
  initial: MetricaOperacional[];
  onPersist: (rows: MetricaOperacional[]) => Promise<boolean>;
}) {
  // Métricas guardadas por cargo. Linhas exibidas vêm de `cargos` (TIME COMERCIAL);
  // cargos novos aparecem com defaults; cargos removidos somem da tabela.
  const [savedMap, setSavedMap] = useState<Record<string, MetricaOperacional>>(() => {
    const m: Record<string, MetricaOperacional> = {};
    for (const def of initial) m[def.cargo] = { ...def };
    return m;
  });
  const [draftMap, setDraftMap] = useState<Record<string, MetricaOperacional>>(savedMap);
  const [isEditing, setIsEditing] = useState(false);

  const source = isEditing ? draftMap : savedMap;
  const rows: MetricaOperacional[] = cargos.map(
    (c) => source[c] ?? defaultMetricFor(c),
  );

  function patch<K extends keyof MetricaOperacional>(
    cargo: string,
    key: K,
    v: MetricaOperacional[K],
  ) {
    setDraftMap((prev) => {
      const existing = prev[cargo] ?? defaultMetricFor(cargo);
      return { ...prev, [cargo]: { ...existing, [key]: v } };
    });
  }

  return (
    <EditableSection
      title="Capacidade Operacional"
      badge={<SectionBadge>Linha por cargo · WIP · Ramp · Turnover</SectionBadge>}
      canEdit={canEdit}
      isEditing={isEditing}
      onEdit={() => {
        // Garante que todo cargo atual tem entrada no draft antes de editar.
        const next: Record<string, MetricaOperacional> = { ...savedMap };
        for (const c of cargos) if (!next[c]) next[c] = defaultMetricFor(c);
        setDraftMap(next);
        setIsEditing(true);
      }}
      onSave={() => {
        setSavedMap(draftMap);
        setIsEditing(false);
        void onPersist(cargos.map((c) => draftMap[c] ?? defaultMetricFor(c)));
      }}
      onCancel={() => {
        setDraftMap(savedMap);
        setIsEditing(false);
      }}
    >
      <div className="px-4 py-2.5 text-[11px] text-muted-foreground border-b border-border/60">
        Uma linha por cargo cadastrado em <span className="text-foreground">TIME COMERCIAL</span>. WIP Limit = capacidade máxima em plena produção. Tempos em meses.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <Th>Cargo</Th>
              {CAP_NUM_COLS.map((c) => (
                <Th key={c.key as string} align="right">
                  <span className="inline-flex items-center gap-1 justify-end">
                    {c.label}
                    {c.suffix && (
                      <span className="text-table-header-foreground/60 normal-case">
                        ({c.suffix})
                      </span>
                    )}
                  </span>
                </Th>
              ))}
              <Th align="right">Turnover/Mês</Th>
              <Th align="right">Ligações/Mês</Th>
              <Th align="right">Conexão %</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={CAP_NUM_COLS.length + 4}
                  className="px-4 py-6 text-center text-xs text-muted-foreground"
                >
                  Nenhum cargo cadastrado no TIME COMERCIAL. Adicione um membro acima para liberar a edição.
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => (
                <tr
                  key={r.cargo}
                  className={`${idx % 2 === 0 ? "bg-card" : "bg-muted/30"} border-b border-border/60`}
                >
                  <td className="px-1.5 py-2 text-xs font-medium text-accent">{r.cargo}</td>
                  {CAP_NUM_COLS.map((c) => (
                    <td key={c.key as string} className="px-1.5 py-2 text-xs text-right">
                      <IntegerCell
                        isEditing={isEditing}
                        value={r[c.key] as number}
                        onChange={(v) =>
                          patch(r.cargo, c.key, v as MetricaOperacional[typeof c.key])
                        }
                      />
                    </td>
                  ))}
                  <td className="px-1.5 py-2 text-xs text-right">
                    <PercentCell
                      isEditing={isEditing}
                      value={r.turnoverMesPct}
                      onChange={(v) => patch(r.cargo, "turnoverMesPct", v)}
                      digits={1}
                    />
                  </td>
                  <td className="px-1.5 py-2 text-xs text-right">
                    <IntegerCell
                      isEditing={isEditing}
                      value={r.ligacoesMes}
                      onChange={(v) => patch(r.cargo, "ligacoesMes", v)}
                      inputClassName="w-14"
                    />
                  </td>
                  <td className="px-1.5 py-2 text-xs text-right">
                    <PercentCell
                      isEditing={isEditing}
                      value={r.conexaoPct}
                      onChange={(v) => patch(r.cargo, "conexaoPct", v)}
                      digits={0}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </EditableSection>
  );
}

// ============================================================
// P1 — HORIZONTES DE CRESCIMENTO (apenas faixa + tempo + cresc.)
// ============================================================

// Faixa de faturamento mensal em R$. faixaMax: null = aberto à direita (H5 R$1,5M+).
// tempoMaxMeses: null = sem prazo (H5 — unidade já está consolidada).
type Horizonte = {
  h: "H1" | "H2" | "H3" | "H4" | "H5";
  faixaMin: number;
  faixaMax: number | null;
  tempoMaxMeses: number | null;
  crescMensalPct: number;
};

function HorizontesSection({
  canEdit,
  matrizLocked,
  horizonteAtual,
  initial,
  onPersist,
}: {
  canEdit: boolean;
  /**
   * Horizontes de Crescimento são premissa travada da Matriz. Na visão unidade
   * isto vem true: a seção inteira fica só-leitura (sem botão Editar) e exibe o
   * selo "Matriz".
   */
  matrizLocked: boolean;
  horizonteAtual: Horizonte["h"] | null;
  initial: Horizonte[];
  onPersist: (rows: Horizonte[]) => Promise<boolean>;
}) {
  const [saved, setSaved] = useState<Horizonte[]>(initial);
  const [draft, setDraft] = useState<Horizonte[]>(initial);
  const [isEditing, setIsEditing] = useState(false);
  const rows = isEditing ? draft : saved;

  function patch<K extends keyof Horizonte>(idx: number, key: K, v: Horizonte[K]) {
    setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: v } : r)));
  }

  return (
    <EditableSection
      title="Horizontes de Crescimento"
      badge={matrizLocked ? <SectionBadge>Somente leitura · Matriz</SectionBadge> : undefined}
      canEdit={canEdit}
      isEditing={isEditing}
      onEdit={() => {
        setDraft(saved);
        setIsEditing(true);
      }}
      onSave={() => {
        setSaved(draft);
        setIsEditing(false);
        void onPersist(draft);
      }}
      onCancel={() => {
        setDraft(saved);
        setIsEditing(false);
      }}
    >
      <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {rows.map((r, idx) => {
          const isAtual = r.h === horizonteAtual;
          return (
            <div
              key={r.h}
              className={`rounded border ${
                isAtual
                  ? "border-accent/60 bg-accent/5 ring-1 ring-accent/30"
                  : "border-border bg-card"
              } overflow-hidden flex flex-col`}
            >
              <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between bg-accent text-accent-foreground">
                <span className="text-sm font-semibold tracking-wide">{r.h}</span>
                {isAtual && (
                  <span className="text-[8px] uppercase tracking-widest font-semibold bg-accent-foreground text-accent px-1.5 py-0.5 rounded">
                    Atual
                  </span>
                )}
              </div>
              <dl className="px-3 py-2.5 text-xs flex-1 space-y-2">
                <CardField label="Faixa Min">
                  <CurrencyCell
                    isEditing={isEditing}
                    value={r.faixaMin}
                    onChange={(v) => patch(idx, "faixaMin", v)}
                    step={10_000}
                    align="left"
                  />
                </CardField>
                <CardField label="Faixa Máx">
                  <NullableCurrencyCell
                    isEditing={isEditing}
                    value={r.faixaMax}
                    onChange={(v) => patch(idx, "faixaMax", v)}
                    step={10_000}
                    align="left"
                  />
                </CardField>
                <CardField label="Tempo Máx (meses)">
                  <NullableIntegerCell
                    isEditing={isEditing}
                    value={r.tempoMaxMeses}
                    onChange={(v) => patch(idx, "tempoMaxMeses", v)}
                    align="left"
                  />
                </CardField>
                <CardField label="Cresc. Mensal">
                  <span className="inline-flex items-center gap-1 text-success font-medium">
                    <PercentCell
                      isEditing={isEditing}
                      value={r.crescMensalPct}
                      onChange={(v) => patch(idx, "crescMensalPct", v)}
                      align="left"
                    />
                    <span className="text-success/80">≥</span>
                  </span>
                </CardField>
              </dl>
            </div>
          );
        })}
      </div>
      {matrizLocked && (
        <div className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border bg-muted/20">
          Horizontes de Crescimento são premissa da Matriz — só a Matriz edita; a unidade visualiza.
        </div>
      )}
    </EditableSection>
  );
}

// ============================================================
// P6 — INVESTIMENTO EM MÍDIA POR HORIZONTE
// ============================================================

type Investimento = {
  h: "H1" | "H2" | "H3" | "H4" | "H5";
  pctProducao: number;
  splitLb: number;
  splitBb: number;
  /** % alocado em Meeting Broker (inbound enterprise funil curto). 0 = não liberado p/ horizonte. */
  splitMt: number;
  /** % alocado em Eventos (inbound multi-tier funil curto). 0 = não liberado p/ horizonte. */
  splitEv: number;
  bbPiso: number; // R$ — 0 quando não se aplica
  regra: string;
};

function InvestimentoMidiaSection({
  canEdit,
  horizonteAtual,
  initial,
  matriz,
  onPersist,
}: {
  canEdit: boolean;
  // null na visão matriz (consolidada): nenhuma unidade impersonada a destacar.
  horizonteAtual: Investimento["h"] | null;
  initial: Investimento[];
  /** Premissa da Matriz por horizonte — referência só-leitura ao lado do %
   *  editável da unidade. Ausente na própria visão Matriz. */
  matriz?: Investimento[];
  onPersist: (rows: Investimento[]) => Promise<boolean>;
}) {
  const [saved, setSaved] = useState<Investimento[]>(initial);
  const [draft, setDraft] = useState<Investimento[]>(initial);
  const [isEditing, setIsEditing] = useState(false);
  const rows = isEditing ? draft : saved;

  // Mapa horizonte → % Investimento da Matriz, pra mostrar como bench ao lado.
  const matrizPctByH = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of matriz ?? []) m.set(r.h, r.pctProducao);
    return m;
  }, [matriz]);

  function patch<K extends keyof Investimento>(idx: number, key: K, v: Investimento[K]) {
    setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: v } : r)));
  }

  return (
    <EditableSection
      title="Investimento em Mídia por Horizonte"
      badge={<SectionBadge>Editável</SectionBadge>}
      canEdit={canEdit}
      isEditing={isEditing}
      onEdit={() => {
        setDraft(saved);
        setIsEditing(true);
      }}
      onSave={() => {
        const invalidos = draft.filter(
          (r) => r.splitLb + r.splitBb + r.splitMt + r.splitEv > 100.5,
        );
        if (invalidos.length > 0) {
          alert(
            `Soma Split LB + BB + MT + EV deve ser ≤ 100% em cada horizonte. Ajuste: ${invalidos
              .map(
                (r) =>
                  `${r.h} (${(r.splitLb + r.splitBb + r.splitMt + r.splitEv).toFixed(1)}%)`,
              )
              .join(", ")}.`,
          );
          return;
        }
        setSaved(draft);
        setIsEditing(false);
        void onPersist(draft);
      }}
      onCancel={() => {
        setDraft(saved);
        setIsEditing(false);
      }}
    >
      <div className="px-4 py-2.5 text-[11px] text-muted-foreground border-b border-border/60">
        Percentual do faturamento mensal investido em mídia via canais Inbound (LB, BB, MT ou Eventos)
      </div>
      <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {rows.map((r, idx) => {
          const isAtual = r.h === horizonteAtual;
          return (
            <div
              key={r.h}
              className={`rounded border ${
                isAtual
                  ? "border-accent/60 bg-accent/5 ring-1 ring-accent/30"
                  : "border-border bg-card"
              } overflow-hidden flex flex-col`}
            >
              <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between bg-accent text-accent-foreground">
                <span className="text-sm font-semibold tracking-wide">{r.h}</span>
                {isAtual && (
                  <span className="text-[8px] uppercase tracking-widest font-semibold bg-accent-foreground text-accent px-1.5 py-0.5 rounded">
                    Atual
                  </span>
                )}
              </div>
              <dl className="px-3 py-2.5 text-xs flex-1 space-y-2">
                <CardField label="% Investimento" help="% Investimento = parcela do faturamento investida em mídia. Define a divisão entre Lead Broker, Black Box, Meeting Broker e Eventos.">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <PercentCell
                      isEditing={isEditing}
                      value={r.pctProducao}
                      onChange={(v) => patch(idx, "pctProducao", v)}
                      align="left"
                    />
                    {matrizPctByH.has(r.h) && (
                      <span
                        className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground tabular-nums"
                        title="Premissa da Matriz — referência (não editável)"
                      >
                        <span className="uppercase tracking-wider">Matriz</span>
                        {formatPercent(matrizPctByH.get(r.h)!, 1)}
                      </span>
                    )}
                  </div>
                </CardField>
                <CardField label="Split LB" help="% do investimento de mídia alocado em Leadbroker.">
                  <PercentCell
                    isEditing={isEditing}
                    value={r.splitLb}
                    onChange={(v) => patch(idx, "splitLb", v)}
                    align="left"
                  />
                </CardField>
                <CardField label="Split BB" help="% do investimento de mídia alocado em Blackbox.">
                  <PercentCell
                    isEditing={isEditing}
                    value={r.splitBb}
                    onChange={(v) => patch(idx, "splitBb", v)}
                    lockableZero
                    align="left"
                  />
                </CardField>
                <CardField label="Split MT" help="% do investimento de mídia alocado em Meetingbroker.">
                  <PercentCell
                    isEditing={isEditing}
                    value={r.splitMt}
                    onChange={(v) => patch(idx, "splitMt", v)}
                    lockableZero
                    align="left"
                  />
                </CardField>
                <CardField label="Split EV" help="% do investimento de mídia alocado em Eventos.">
                  <PercentCell
                    isEditing={isEditing}
                    value={r.splitEv}
                    onChange={(v) => patch(idx, "splitEv", v)}
                    lockableZero
                    align="left"
                  />
                </CardField>
              </dl>
            </div>
          );
        })}
      </div>
    </EditableSection>
  );
}

function CardField({
  label,
  help,
  children,
}: {
  label: string;
  /** Texto do tooltip de ajuda (?) ao lado do label. Omitido = sem ícone. */
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
        {help && <FieldHelp text={help} />}
      </dt>
      <dd className="text-xs text-foreground">{children}</dd>
    </div>
  );
}

// ============================================================
// P2 — TIERS DE CLIENTE
// ============================================================

// Faturamento agora numérico (R$ anual). faturamentoMax: null = aberto à direita.
type TierCliente = {
  tier: "Tiny" | "Small" | "Medium" | "Large" | "Enterprise";
  faturamentoMin: number;
  faturamentoMax: number | null;
  /** Ponderado pela receita realizada por produto (P3). Calculado automaticamente. */
  tcvBooking: number;
  cplLb: number;
  cplBb: number;
  cpmqlMt: number;
};

// `TiersClienteSection` foi removida: as faixas de faturamento (FAT. MIN/MÁX)
// agora vivem dentro da tabela "Mercado por Tier" da seção "Distribuição de Tier
// por Horizonte" (DistribuicaoLeadsSection). O type `TierCliente` acima segue
// sendo a fonte da verdade do bloco tiersCliente (CPMQL etc.).

// ============================================================
// P3 — RECEITA POR PRODUTO / TIER
// ============================================================

type Produto = {
  tier: "Tiny" | "Small" | "Medium" | "Large" | "Enterprise";
  saberPct: number;
  saberAt: number;
  terPct: number;
  terAt: number;
  execPct: number;
  execAt: number;
};

function tcvPonderado(p: Produto): number {
  return (
    (p.saberPct / 100) * p.saberAt +
    (p.terPct / 100) * p.terAt +
    (p.execPct / 100) * p.execAt
  );
}

function somaAdesao(p: Produto): number {
  return p.saberPct + p.terPct + p.execPct;
}

function ReceitaProdutoSection({
  canEdit,
  cpmqlReadOnly,
  tiers,
  initial,
  onPersist,
  onPersistTiers,
  meetingBrokerCustoSql,
  eventosCustoSql,
  onPersistMeetingBrokerCusto,
  onPersistEventosCusto,
}: {
  canEdit: boolean;
  /** CPMQL (LB/BB/MT) é premissa travada da Matriz: só-leitura na unidade, mesmo em edição. */
  cpmqlReadOnly: boolean;
  /** Fonte da verdade dos tiers (compartilhada com "Tiers de Cliente", que edita o faturamento). */
  tiers: TierCliente[];
  initial: Produto[];
  onPersist: (rows: Produto[]) => Promise<boolean>;
  onPersistTiers: (rows: TierCliente[]) => Promise<boolean>;
  /**
   * Custo/SQL do funil curto inbound, movidos das Conversões pra cá (todo custo num
   * lugar só): Meeting Broker (Enterprise) e Eventos. Singletons — não mexem no
   * cálculo (o forecast segue lendo os mesmos campos). Edição só na Matriz (como CPMQL).
   */
  meetingBrokerCustoSql: number;
  eventosCustoSql: number;
  onPersistMeetingBrokerCusto: (custoSql: number) => Promise<boolean>;
  onPersistEventosCusto: (custoSql: number) => Promise<boolean>;
}) {
  const [saved, setSaved] = useState<Produto[]>(initial);
  const [draft, setDraft] = useState<Produto[]>(initial);
  // Draft do CPMQL — só editado na Matriz; semeado da fonte da verdade ao entrar em edição.
  const [tierDraft, setTierDraft] = useState<TierCliente[]>(tiers);
  const [isEditing, setIsEditing] = useState(false);
  // Custo/SQL (funil curto inbound) — só editável na Matriz, como CPMQL/CPL.
  const [draftMbCusto, setDraftMbCusto] = useState(meetingBrokerCustoSql);
  const [draftEvCusto, setDraftEvCusto] = useState(eventosCustoSql);
  const custoEditing = isEditing && !cpmqlReadOnly;
  const mbCusto = custoEditing ? draftMbCusto : meetingBrokerCustoSql;
  const evCusto = custoEditing ? draftEvCusto : eventosCustoSql;
  const rows = isEditing ? draft : saved;
  const tierRows = isEditing ? tierDraft : tiers;
  const cpmqlByTier = useMemo(() => {
    const m = new Map<string, TierCliente>();
    for (const t of tierRows) m.set(t.tier, t);
    return m;
  }, [tierRows]);
  // Invariante P3: Saber% + Ter% + Executar% deve somar 100% em cada tier.
  // Bloqueia o save enquanto alguma linha estiver fora (tolerância 0.5).
  const linhasInvalidas = draft.filter((r) => Math.abs(somaAdesao(r) - 100) > 0.5);
  const podeSalvar = linhasInvalidas.length === 0;

  function patch<K extends keyof Produto>(idx: number, key: K, v: Produto[K]) {
    setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: v } : r)));
  }
  function patchTier(tier: TierCliente["tier"], key: "cplLb" | "cplBb" | "cpmqlMt", v: number) {
    setTierDraft((prev) => prev.map((t) => (t.tier === tier ? { ...t, [key]: v } : t)));
  }

  return (
    <EditableSection
      title="Receita por Produto / Tier"
      canEdit={canEdit}
      isEditing={isEditing}
      canSave={podeSalvar}
      saveDisabledHint={
        podeSalvar
          ? undefined
          : `Ajuste a adesão dos tiers: ${linhasInvalidas
              .map((r) => `${r.tier} (${somaAdesao(r).toFixed(0)}%)`)
              .join(", ")} — cada tier deve somar 100%.`
      }
      onEdit={() => {
        setDraft(saved);
        setTierDraft(tiers);
        setDraftMbCusto(meetingBrokerCustoSql);
        setDraftEvCusto(eventosCustoSql);
        setIsEditing(true);
      }}
      onSave={() => {
        if (!podeSalvar) return;
        setSaved(draft);
        setIsEditing(false);
        void onPersist(draft);
        // CPMQL só persiste quando editável (Matriz). Recalcula o TCV-Booking
        // ponderado a partir da receita por produto recém-salva.
        if (!cpmqlReadOnly) {
          const tcvBy = new Map(draft.map((p) => [p.tier, tcvPonderado(p)] as const));
          const nextTiers = tierDraft.map((t) => ({
            ...t,
            tcvBooking: tcvBy.get(t.tier) ?? t.tcvBooking,
          }));
          void onPersistTiers(nextTiers);
          // Custo/SQL (Meeting Broker / Eventos): persiste só o que mudou.
          if (draftMbCusto !== meetingBrokerCustoSql) void onPersistMeetingBrokerCusto(draftMbCusto);
          if (draftEvCusto !== eventosCustoSql) void onPersistEventosCusto(draftEvCusto);
        }
      }}
      onCancel={() => {
        setDraft(saved);
        setTierDraft(tiers);
        setDraftMbCusto(meetingBrokerCustoSql);
        setDraftEvCusto(eventosCustoSql);
        setIsEditing(false);
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <Th>Tier</Th>
              <Th align="right">Saber %</Th>
              <Th align="right">Ter %</Th>
              <Th align="right">Executar %</Th>
              <Th align="right">Saber R$</Th>
              <Th align="right">Ter R$</Th>
              <Th align="right">Executar R$</Th>
              <Th align="right">
                <span className="inline-flex items-center gap-1 justify-end">
                  CPMQL LB{cpmqlReadOnly ? " · Matriz" : ""}
                  <FieldHelp text="Custo por MQL via Leadbroker (leads de mídia paga) com opção de escolha." />
                </span>
              </Th>
              <Th align="right">
                <span className="inline-flex items-center gap-1 justify-end">
                  CPMQL BB{cpmqlReadOnly ? " · Matriz" : ""}
                  <FieldHelp text="Custo por MQL via Black Box (leads de mídia paga) sem opção de escolha." />
                </span>
              </Th>
              <Th align="right">
                <span className="inline-flex items-center gap-1 justify-end">
                  CPMQL MT{cpmqlReadOnly ? " · Matriz" : ""}
                  <FieldHelp text="Custo por MQL via Meeting Broker (leads enterprise) com opção de escolha." />
                </span>
              </Th>
              <Th align="right">Soma %</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const soma = somaAdesao(r);
              const somaOk = Math.abs(soma - 100) < 0.5;
              const cpmql = cpmqlByTier.get(r.tier);
              return (
                <tr
                  key={r.tier}
                  className={`${idx % 2 === 0 ? "bg-card" : "bg-muted/30"} border-b border-border/60`}
                >
                  <td className="px-1.5 py-2 text-xs font-medium text-accent">{r.tier}</td>
                  <td className="px-1.5 py-2 text-xs text-right">
                    <PercentCell isEditing={isEditing} value={r.saberPct} onChange={(v) => patch(idx, "saberPct", v)} digits={0} lockableZero />
                  </td>
                  <td className="px-1.5 py-2 text-xs text-right">
                    <PercentCell isEditing={isEditing} value={r.terPct} onChange={(v) => patch(idx, "terPct", v)} digits={0} lockableZero />
                  </td>
                  <td className="px-1.5 py-2 text-xs text-right">
                    <PercentCell isEditing={isEditing} value={r.execPct} onChange={(v) => patch(idx, "execPct", v)} digits={0} lockableZero />
                  </td>
                  <td className="px-1.5 py-2 text-xs text-right">
                    <CurrencyCell isEditing={isEditing} value={r.saberAt} onChange={(v) => patch(idx, "saberAt", v)} lockableZero />
                  </td>
                  <td className="px-1.5 py-2 text-xs text-right">
                    <CurrencyCell isEditing={isEditing} value={r.terAt} onChange={(v) => patch(idx, "terAt", v)} lockableZero />
                  </td>
                  <td className="px-1.5 py-2 text-xs text-right">
                    <CurrencyCell isEditing={isEditing} value={r.execAt} onChange={(v) => patch(idx, "execAt", v)} lockableZero />
                  </td>
                  <td className="px-1.5 py-2 text-xs text-right">
                    <CurrencyCell isEditing={isEditing && !cpmqlReadOnly} value={cpmql?.cplLb ?? 0} onChange={(v) => patchTier(r.tier, "cplLb", v)} step={10} />
                  </td>
                  <td className="px-1.5 py-2 text-xs text-right">
                    <CurrencyCell isEditing={isEditing && !cpmqlReadOnly} value={cpmql?.cplBb ?? 0} onChange={(v) => patchTier(r.tier, "cplBb", v)} step={10} />
                  </td>
                  <td className="px-1.5 py-2 text-xs text-right">
                    <CurrencyCell isEditing={isEditing && !cpmqlReadOnly} value={cpmql?.cpmqlMt ?? 0} onChange={(v) => patchTier(r.tier, "cpmqlMt", v)} step={100} />
                  </td>
                  <td
                    className={`px-1.5 py-2 text-xs text-right tabular-nums font-medium ${
                      somaOk ? "text-success" : "text-destructive"
                    }`}
                    title={somaOk ? undefined : `Soma deve ser 100% — atual ${soma.toFixed(0)}%.`}
                  >
                    {formatPercent(soma, 0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 border-t border-border bg-muted/10">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2 inline-flex items-center gap-2">
          Custo/SQL · funil curto inbound
          {cpmqlReadOnly && <SectionBadge>Somente leitura · Matriz</SectionBadge>}
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs items-center">
          <div className="inline-flex items-center gap-2">
            <span className="text-muted-foreground">Meeting Broker (Enterprise)</span>
            <CurrencyCell isEditing={custoEditing} value={mbCusto} onChange={setDraftMbCusto} step={500} lockableZero />
          </div>
          <div className="inline-flex items-center gap-2">
            <span className="text-muted-foreground">Eventos (todos os tiers)</span>
            <CurrencyCell isEditing={custoEditing} value={evCusto} onChange={setDraftEvCusto} step={500} lockableZero />
          </div>
        </div>
      </div>
      <div className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border bg-muted/20">
        BB piso R$30K/mês. CPMQL BB = R$700 padrão para todos os tiers. CPMQL MT = R$5.000 (custo SQL).
        {cpmqlReadOnly
          ? " CPMQL é premissa da Matriz — só a Matriz edita; a unidade visualiza."
          : ""}
      </div>
      {isEditing && !podeSalvar && (
        <div className="px-4 py-2 text-[11px] text-destructive border-t border-border bg-destructive/5">
          A adesão por produto deve somar 100% em cada tier. Ajuste antes de salvar: {linhasInvalidas
            .map((r) => `${r.tier} (${somaAdesao(r).toFixed(0)}%)`)
            .join(", ")}.
        </div>
      )}
    </EditableSection>
  );
}

// ============================================================
// P4 — DISTRIBUIÇÃO DE LEADS POR TIER
// ============================================================

const TIER_COLS = ["Tiny", "Small", "Medium", "Large", "Enterprise"] as const;
type TierName = (typeof TIER_COLS)[number];

const HORIZ_LIST = ["H1", "H2", "H3", "H4", "H5"] as const;
type HorizonteName = (typeof HORIZ_LIST)[number];

// "Entra em" é a chave-mestra: define a partir de qual horizonte o tier aparece
// na tabela de split à direita. Editar aqui libera/oculta a célula correspondente.
type DistMercado = { tier: TierName; pctMercado: number; entraHorizonte: HorizonteName };

type SplitHoriz = {
  h: HorizonteName;
  // Guarda o valor por tier; a exibição é controlada pela coluna "Entra em" da
  // tabela à esquerda (tier só aparece em horizontes >= entraHorizonte).
  pcts: Partial<Record<TierName, number>>;
};

function DistribuicaoLeadsSection({
  canEdit,
  mercadoReadOnly,
  tiers,
  produtos,
  onPersistTiers,
  initial,
  onPersist,
  initialSplit,
  onPersistSplit,
}: {
  canEdit: boolean;
  /**
   * Faixas de faturamento + % de mercado por tier + grade de liberação por horizonte
   * (tabela da esquerda) são premissa da Matriz. Quando true (unidade), a esquerda
   * fica só-leitura e a unidade ajusta apenas o split por horizonte (tabela da direita).
   */
  mercadoReadOnly: boolean;
  /** Faixas de faturamento por tier (bloco tiersCliente) — embutidas na tabela da esquerda. */
  tiers: TierCliente[];
  /** Receita por produto (P3) — usada pra recalcular o TCV-Booking no save dos tiers. */
  produtos: Produto[];
  onPersistTiers: (rows: TierCliente[]) => Promise<boolean>;
  initial: DistMercado[];
  onPersist: (rows: DistMercado[]) => Promise<boolean>;
  initialSplit: SplitHoriz[];
  onPersistSplit: (rows: SplitHoriz[]) => Promise<boolean>;
}) {
  const [savedMercado, setSavedMercado] = useState<DistMercado[]>(initial);
  const [draftMercado, setDraftMercado] = useState<DistMercado[]>(initial);
  const [savedSplit, setSavedSplit] = useState<SplitHoriz[]>(initialSplit);
  const [draftSplit, setDraftSplit] = useState<SplitHoriz[]>(initialSplit);
  const [isEditing, setIsEditing] = useState(false);
  const [draftTiers, setDraftTiers] = useState<TierCliente[]>(tiers);

  // A esquerda (mercado + grade) só é editável na Matriz; a direita (split) é
  // editável também pela unidade.
  const mercadoEditing = isEditing && !mercadoReadOnly;

  // Faixas de faturamento por tier (premissa da Matriz, junto da grade de mercado).
  // Fora de edição mostra a fonte da verdade (`tiers`), que reflete o CPMQL salvo
  // pela seção Receita por Produto.
  const tiersAtuais = mercadoEditing ? draftTiers : tiers;
  const tierByName = new Map(tiersAtuais.map((t) => [t.tier, t] as const));
  function patchTier<K extends keyof TierCliente>(tier: string, key: K, v: TierCliente[K]) {
    setDraftTiers((prev) => prev.map((r) => (r.tier === tier ? { ...r, [key]: v } : r)));
  }

  const mercado = isEditing ? draftMercado : savedMercado;
  const split = isEditing ? draftSplit : savedSplit;
  const totalMercado = mercado.reduce((acc, r) => acc + r.pctMercado, 0);

  function patchMercado(idx: number, v: number) {
    setDraftMercado((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, pctMercado: v } : r)),
    );
  }
  function patchEntra(idx: number, v: HorizonteName) {
    setDraftMercado((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, entraHorizonte: v } : r)),
    );
  }
  // Grade cumulativa: cada tier fica ativo de `entraHorizonte` em diante.
  // Clicar um horizonte ainda inativo antecipa a entrada para ali; clicar um
  // já ativo empurra a entrada para o próximo (mantém o bloco contíguo até H5,
  // que é sempre ativo — não dá pra desligar um tier por completo).
  function toggleHoriz(idx: number, h: HorizonteName) {
    const atual = draftMercado[idx]?.entraHorizonte;
    if (!atual) return;
    const hi = HORIZ_LIST.indexOf(h);
    const ci = HORIZ_LIST.indexOf(atual);
    if (hi < ci) {
      patchEntra(idx, h);
    } else {
      const prox = Math.min(hi + 1, HORIZ_LIST.length - 1);
      patchEntra(idx, HORIZ_LIST[prox]);
    }
  }
  function patchSplit(idx: number, tier: TierName, v: number) {
    setDraftSplit((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, pcts: { ...r.pcts, [tier]: v } } : r)),
    );
  }

  function isTierAtivoEm(tier: TierName, h: HorizonteName): boolean {
    const entra = mercado.find((m) => m.tier === tier)?.entraHorizonte;
    if (!entra) return false;
    return HORIZ_LIST.indexOf(h) >= HORIZ_LIST.indexOf(entra);
  }

  // Soma do split por horizonte considerando só os tiers ativos na linha.
  // Invariante exigido: cada horizonte (linha) deve somar 100%.
  function somaSplit(r: SplitHoriz): number {
    return TIER_COLS.reduce(
      (acc, t) => acc + (isTierAtivoEm(t, r.h) ? r.pcts[t] ?? 0 : 0),
      0,
    );
  }
  const splitInvalidas = split.filter((r) => Math.abs(somaSplit(r) - 100) > 0.5);
  const splitValido = splitInvalidas.length === 0;

  return (
    <EditableSection
      title="Distribuição de Tier por Horizonte"
      badge={<SectionBadge>Benchmark V4</SectionBadge>}
      canEdit={canEdit}
      isEditing={isEditing}
      canSave={splitValido}
      saveDisabledHint={
        splitValido
          ? undefined
          : `Cada horizonte deve somar 100%. Ajuste: ${splitInvalidas
              .map((r) => `${r.h} (${somaSplit(r).toFixed(0)}%)`)
              .join(", ")}.`
      }
      onEdit={() => {
        setDraftMercado(savedMercado);
        setDraftSplit(savedSplit);
        setDraftTiers(tiers);
        setIsEditing(true);
      }}
      onSave={() => {
        if (!splitValido) return;
        setSavedSplit(draftSplit);
        void onPersistSplit(draftSplit);
        // A grade de mercado só persiste na Matriz; na unidade fica só-leitura.
        if (!mercadoReadOnly) {
          setSavedMercado(draftMercado);
          void onPersist(draftMercado);
          // Faixas de faturamento: TCV-Booking é ponderado pela receita por produto
          // (P3) — recalcula no save, como fazia a antiga seção Tiers de Cliente.
          const tcvByTier = new Map(produtos.map((p) => [p.tier, tcvPonderado(p)] as const));
          void onPersistTiers(
            draftTiers.map((r) => ({ ...r, tcvBooking: tcvByTier.get(r.tier) ?? r.tcvBooking })),
          );
        }
        setIsEditing(false);
      }}
      onCancel={() => {
        setDraftMercado(savedMercado);
        setDraftSplit(savedSplit);
        setDraftTiers(tiers);
        setIsEditing(false);
      }}
    >
      <div className="px-4 pt-3 pb-1 text-[11px] text-muted-foreground">
        Painel de gerenciamento e distribuição de tiers por horizontes a definir pelo franqueado — o total de cada linha (horizonte) deve somar 100%.
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 pt-2">
        {/* Coluna esquerda — Tier × % Mercado (premissa da Matriz) */}
        <div className="min-w-0 rounded border border-border bg-card overflow-hidden">
          <div className="px-3 py-2 border-b border-border/60 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Mercado por Tier
            </span>
            {mercadoReadOnly && <SectionBadge>Somente leitura · Matriz</SectionBadge>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <Th>Tier</Th>
                  <Th align="right">Fat. Min</Th>
                  <Th align="right">Fat. Máx</Th>
                  <Th align="right">% Distribuição</Th>
                  {HORIZ_LIST.map((h) => (
                    <Th key={h} align="center">
                      {h}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mercado.map((r, idx) => (
                  <tr
                    key={r.tier}
                    className={`${idx % 2 === 0 ? "bg-card" : "bg-muted/30"} border-b border-border/60`}
                  >
                    <td className="px-1.5 py-2 text-xs font-medium text-accent">{r.tier}</td>
                    <td className="px-1.5 py-2 text-xs text-right">
                      <CurrencyCell
                        isEditing={mercadoEditing}
                        value={tierByName.get(r.tier)?.faturamentoMin ?? 0}
                        onChange={(v) => patchTier(r.tier, "faturamentoMin", v)}
                        step={100_000}
                      />
                    </td>
                    <td className="px-1.5 py-2 text-xs text-right">
                      <NullableCurrencyCell
                        isEditing={mercadoEditing}
                        value={tierByName.get(r.tier)?.faturamentoMax ?? null}
                        onChange={(v) => patchTier(r.tier, "faturamentoMax", v)}
                        step={100_000}
                      />
                    </td>
                    <td className="px-1.5 py-2 text-xs text-right">
                      <PercentCell
                        isEditing={mercadoEditing}
                        value={r.pctMercado}
                        onChange={(v) => patchMercado(idx, v)}
                        digits={1}
                      />
                    </td>
                    {HORIZ_LIST.map((h) => {
                      const ativo = isTierAtivoEm(r.tier, h);
                      return (
                        <td key={h} className="px-1 py-2 text-center">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={ativo}
                            disabled={!mercadoEditing}
                            onClick={() => toggleHoriz(idx, h)}
                            title={
                              mercadoEditing
                                ? `${ativo ? "Desativar" : "Liberar"} ${r.tier} a partir de ${h}`
                                : `${r.tier} ${ativo ? "ativo" : "inativo"} em ${h}`
                            }
                            className={`inline-flex h-4 w-4 items-center justify-center rounded-[3px] border transition-colors ${
                              ativo
                                ? "bg-accent border-accent text-accent-foreground"
                                : "bg-card border-border text-transparent"
                            } ${
                              mercadoEditing
                                ? "cursor-pointer hover:border-accent/70"
                                : "cursor-default"
                            }`}
                          >
                            <Check className="h-2.5 w-2.5" strokeWidth={3} />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="bg-muted/40 font-medium">
                  <td className="px-1.5 py-2 text-xs text-foreground">TOTAL</td>
                  <td />
                  <td />
                  <td
                    className={`px-1.5 py-2 text-xs text-right tabular-nums ${
                      Math.abs(totalMercado - 100) < 0.5 ? "text-success" : "text-destructive"
                    }`}
                  >
                    {formatPercent(totalMercado, 1)}
                  </td>
                  <td colSpan={HORIZ_LIST.length} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Coluna direita — Horizonte × Tiers (split editável pela unidade) */}
        <div className="min-w-0 rounded border border-border bg-card overflow-hidden">
          <div className="px-3 py-2 border-b border-border/60">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Distribuição por Horizonte
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <Th>Horizonte</Th>
                  {TIER_COLS.map((t) => (
                    <Th key={t} align="right">
                      {t}
                    </Th>
                  ))}
                  <Th align="right">Soma</Th>
                </tr>
              </thead>
              <tbody>
                {split.map((r, idx) => {
                  const soma = somaSplit(r);
                  const somaOk = Math.abs(soma - 100) < 0.5;
                  return (
                    <tr
                      key={r.h}
                      className={`${idx % 2 === 0 ? "bg-card" : "bg-muted/30"} border-b border-border/60`}
                    >
                      <td className="px-1.5 py-2 text-xs font-medium text-accent">{r.h}</td>
                      {TIER_COLS.map((t) => {
                        if (!isTierAtivoEm(t, r.h)) {
                          return (
                            <td
                              key={t}
                              className="px-1.5 py-2 text-xs text-right text-muted-foreground/40"
                              title={`Tier ${t} entra a partir de ${
                                mercado.find((m) => m.tier === t)?.entraHorizonte ?? "—"
                              }`}
                            >
                              —
                            </td>
                          );
                        }
                        return (
                          <td key={t} className="px-1.5 py-2 text-xs text-right">
                            <PercentCell
                              isEditing={isEditing}
                              value={r.pcts[t] ?? 0}
                              onChange={(nv) => patchSplit(idx, t, nv)}
                              digits={1}
                            />
                          </td>
                        );
                      })}
                      <td
                        className={`px-1.5 py-2 text-xs text-right tabular-nums font-medium ${
                          somaOk ? "text-success" : "text-destructive"
                        }`}
                        title={somaOk ? undefined : `Soma deve ser 100% — atual ${soma.toFixed(1)}%.`}
                      >
                        {formatPercent(soma, 1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {isEditing && !splitValido && (
        <div className="px-4 py-2 text-[11px] text-destructive border-t border-border bg-destructive/5">
          Cada horizonte deve somar 100% entre os tiers ativos. Ajuste antes de salvar: {splitInvalidas
            .map((r) => `${r.h} (${somaSplit(r).toFixed(0)}%)`)
            .join(", ")}.
        </div>
      )}
    </EditableSection>
  );
}


// ============================================================
// P16 — MIX SUBCANAIS OUTBOUND (% DE LEADS) POR HORIZONTE
// ============================================================

function mixTotal(r: MixOutboundHorizonte): number {
  return r.indicacao + r.recovery + r.recomendacao + r.prospeccao;
}

function MixSubcanaisSection({
  canEdit,
  seed,
  onPersist,
}: {
  canEdit: boolean;
  seed: MixOutboundHorizonte[];
  onPersist: (data: MixOutboundHorizonte[]) => Promise<boolean>;
}) {
  const [saved, setSaved] = useState<MixOutboundHorizonte[]>(seed);
  const [draft, setDraft] = useState<MixOutboundHorizonte[]>(seed);
  const [isEditing, setIsEditing] = useState(false);
  const rows = isEditing ? draft : saved;

  function patch<K extends keyof MixOutboundHorizonte>(idx: number, key: K, v: MixOutboundHorizonte[K]) {
    setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: v } : r)));
  }

  return (
    <EditableSection
      title="Mix de Subcanais Outbound por Horizonte"
      badge={<SectionBadge>% de Leads</SectionBadge>}
      canEdit={canEdit}
      isEditing={isEditing}
      onEdit={() => {
        setDraft(saved);
        setIsEditing(true);
      }}
      onSave={() => {
        setSaved(draft);
        setIsEditing(false);
        void onPersist(draft);
      }}
      onCancel={() => {
        setDraft(saved);
        setIsEditing(false);
      }}
    >
      <div className="px-4 py-2.5 text-[11px] text-muted-foreground border-b border-border/60">
        Distribuição dos leads outbound entre subcanais em cada horizonte. Total deve somar 100%.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <Th>Horizonte</Th>
              <Th align="right">
                <span className="inline-flex items-center gap-1 justify-end">
                  Indicação
                  <FieldHelp text="% dos leads outbound originados de indicações de clientes/parceiros atuais." />
                </span>
              </Th>
              <Th align="right">
                <span className="inline-flex items-center gap-1 justify-end">
                  Recovery
                  <FieldHelp text="% dos leads outbound originados de recuperação de leads inativos." />
                </span>
              </Th>
              <Th align="right">
                <span className="inline-flex items-center gap-1 justify-end">
                  Recomendação
                  <FieldHelp text="% dos leads outbound originados através de reuniões realizadas com potenciais clientes." />
                </span>
              </Th>
              <Th align="right">
                <span className="inline-flex items-center gap-1 justify-end">
                  Prospecção
                  <FieldHelp text="% dos leads outbound originados de prospecção ativa (cold outreach)." />
                </span>
              </Th>
              <Th align="right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const total = mixTotal(r);
              const totalOk = Math.abs(total - 100) < 0.5;
              return (
                <tr
                  key={r.h}
                  className={`${idx % 2 === 0 ? "bg-card" : "bg-muted/30"} border-b border-border/60`}
                >
                  <td className="px-2 py-2 text-xs font-medium text-accent">{r.h}</td>
                  {(["indicacao", "recovery", "recomendacao", "prospeccao"] as const).map((key) => (
                    <td key={key} className="px-2 py-2 text-xs text-right">
                      <PercentCell
                        isEditing={isEditing}
                        value={r[key]}
                        onChange={(v) => patch(idx, key, v)}
                        digits={0}
                        lockableZero
                      />
                    </td>
                  ))}
                  <td
                    className={`px-2 py-2 text-xs text-right tabular-nums font-medium ${
                      totalOk ? "text-success" : "text-destructive"
                    }`}
                  >
                    {formatPercent(total, 0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </EditableSection>
  );
}

// ============================================================
// Helpers internos
// ============================================================

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
      className={`bg-table-header text-table-header-foreground h-8 font-medium px-1.5 py-1.5 text-[10px] uppercase tracking-wider whitespace-nowrap ${alignClass}`}
    >
      {children}
    </th>
  );
}

