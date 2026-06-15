"use client";

import { useMemo, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { EditableSection, SectionBadge } from "../editable-section";
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
  type MetricaOperacional,
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
  /** CPMQL (P2) é premissa da Matriz: na visão unidade fica só-leitura. Default false (matriz edita). */
  cpmqlReadOnly?: boolean;
  /**
   * Mostra Time Comercial + Capacidade Operacional no topo (template por cargo).
   * Default true (matriz). O /premissas-unidade passa false — lá o time vive na
   * aba dedicada "Time & Capacidade", com o modelo completo por pessoa.
   */
  showTimeCapacidade?: boolean;
};

/** Mapeia o membro simplificado da tela pro shape completo do bloco (template da matriz). */
function toMembroBlock(m: Membro): TimeComercialMembro {
  return { email: "", cargo: m.cargo, salario: m.salario, comissaoPct: m.comissaoPct, capacidadePct: 100 };
}

export function PremissasModeloTab({ canEdit, horizonteAtual, cacContext, blocks, persist, cpmqlReadOnly = false, showTimeCapacidade = true }: Props) {
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

      {/* P1 — horizontes */}
      <HorizontesSection
        canEdit={canEdit}
        horizonteAtual={horizonteAtual}
        initial={blocks.horizontes}
        onPersist={(rows) => persist({ block: "horizontes", data: rows })}
      />

      {/* P6 — investimento em mídia */}
      <InvestimentoMidiaSection
        canEdit={canEdit}
        horizonteAtual={horizonteAtual}
        initial={blocks.investimentoMidia}
        onPersist={(rows) => persist({ block: "investimentoMidia", data: rows })}
      />

      {/* P2 — tiers de cliente */}
      <TiersClienteSection
        canEdit={canEdit}
        cpmqlReadOnly={cpmqlReadOnly}
        initial={blocks.tiersCliente}
        produtos={blocks.receitaProduto}
        onPersist={(rows) => persist({ block: "tiersCliente", data: rows })}
      />

      {/* P3 — receita por produto / tier */}
      <ReceitaProdutoSection
        canEdit={canEdit}
        initial={blocks.receitaProduto}
        onPersist={(rows) => persist({ block: "receitaProduto", data: rows })}
      />

      {/* P4 — distribuição de leads por tier */}
      <DistribuicaoLeadsSection
        canEdit={canEdit}
        initial={blocks.distMercado}
        onPersist={(rows) => persist({ block: "distMercado", data: rows })}
        initialSplit={blocks.distSplit}
        onPersistSplit={(rows) => persist({ block: "distSplit", data: rows })}
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
  horizonteAtual,
  initial,
  onPersist,
}: {
  canEdit: boolean;
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
  onPersist,
}: {
  canEdit: boolean;
  // null na visão matriz (consolidada): nenhuma unidade impersonada a destacar.
  horizonteAtual: Investimento["h"] | null;
  initial: Investimento[];
  onPersist: (rows: Investimento[]) => Promise<boolean>;
}) {
  const [saved, setSaved] = useState<Investimento[]>(initial);
  const [draft, setDraft] = useState<Investimento[]>(initial);
  const [isEditing, setIsEditing] = useState(false);
  const rows = isEditing ? draft : saved;

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
        % Investimento = parcela do faturamento investida em mídia. Splits LB/BB/MT/EV definem a divisão entre Lead Broker, Black Box, Meeting Broker (inbound enterprise) e Eventos (inbound multi-tier). Soma deve ser ≤ 100%.
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
                <CardField label="% Investimento">
                  <PercentCell
                    isEditing={isEditing}
                    value={r.pctProducao}
                    onChange={(v) => patch(idx, "pctProducao", v)}
                    align="left"
                  />
                </CardField>
                <CardField label="Split LB">
                  <PercentCell
                    isEditing={isEditing}
                    value={r.splitLb}
                    onChange={(v) => patch(idx, "splitLb", v)}
                    align="left"
                  />
                </CardField>
                <CardField label="Split BB">
                  <PercentCell
                    isEditing={isEditing}
                    value={r.splitBb}
                    onChange={(v) => patch(idx, "splitBb", v)}
                    lockableZero
                    align="left"
                  />
                </CardField>
                <CardField label="Split MT">
                  <PercentCell
                    isEditing={isEditing}
                    value={r.splitMt}
                    onChange={(v) => patch(idx, "splitMt", v)}
                    lockableZero
                    align="left"
                  />
                </CardField>
                <CardField label="Split EV">
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
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
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

function TiersClienteSection({
  canEdit,
  cpmqlReadOnly,
  initial,
  produtos,
  onPersist,
}: {
  canEdit: boolean;
  /** CPMQL é premissa da Matriz: na visão unidade fica só-leitura mesmo em edição. */
  cpmqlReadOnly: boolean;
  initial: TierCliente[];
  produtos: Produto[];
  onPersist: (rows: TierCliente[]) => Promise<boolean>;
}) {
  const [saved, setSaved] = useState<TierCliente[]>(initial);
  const [draft, setDraft] = useState<TierCliente[]>(initial);
  const [isEditing, setIsEditing] = useState(false);
  const rows = isEditing ? draft : saved;

  const tcvByTier = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of produtos) map.set(p.tier, tcvPonderado(p));
    return map;
  }, [produtos]);

  function patch<K extends keyof TierCliente>(idx: number, key: K, v: TierCliente[K]) {
    setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: v } : r)));
  }

  return (
    <EditableSection
      title="Tiers de Cliente"
      canEdit={canEdit}
      isEditing={isEditing}
      onEdit={() => {
        setDraft(saved);
        setIsEditing(true);
      }}
      onSave={() => {
        // TCV-Booking é ponderado pela receita realizada por produto (P3) — sobrescreve no save.
        const rowsToSave = draft.map((r) => ({
          ...r,
          tcvBooking: tcvByTier.get(r.tier) ?? r.tcvBooking,
        }));
        setSaved(rowsToSave);
        setIsEditing(false);
        void onPersist(rowsToSave);
      }}
      onCancel={() => {
        setDraft(saved);
        setIsEditing(false);
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <Th>Tier</Th>
              <Th align="right">Fat. Min</Th>
              <Th align="right">Fat. Máx</Th>
              <Th align="right">CPMQL LB{cpmqlReadOnly ? " · Matriz" : ""}</Th>
              <Th align="right">CPMQL BB{cpmqlReadOnly ? " · Matriz" : ""}</Th>
              <Th align="right">CPMQL MT{cpmqlReadOnly ? " · Matriz" : ""}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr
                key={r.tier}
                className={`${idx % 2 === 0 ? "bg-card" : "bg-muted/30"} border-b border-border/60`}
              >
                <td className="px-1.5 py-2 text-xs font-medium text-accent">{r.tier}</td>
                <td className="px-1.5 py-2 text-xs text-right">
                  <CurrencyCell
                    isEditing={isEditing}
                    value={r.faturamentoMin}
                    onChange={(v) => patch(idx, "faturamentoMin", v)}
                    step={100_000}
                  />
                </td>
                <td className="px-1.5 py-2 text-xs text-right">
                  <NullableCurrencyCell
                    isEditing={isEditing}
                    value={r.faturamentoMax}
                    onChange={(v) => patch(idx, "faturamentoMax", v)}
                    step={100_000}
                  />
                </td>
                <td className="px-1.5 py-2 text-xs text-right">
                  <CurrencyCell isEditing={isEditing && !cpmqlReadOnly} value={r.cplLb} onChange={(v) => patch(idx, "cplLb", v)} step={10} />
                </td>
                <td className="px-1.5 py-2 text-xs text-right">
                  <CurrencyCell isEditing={isEditing && !cpmqlReadOnly} value={r.cplBb} onChange={(v) => patch(idx, "cplBb", v)} step={10} />
                </td>
                <td className="px-1.5 py-2 text-xs text-right">
                  <CurrencyCell isEditing={isEditing && !cpmqlReadOnly} value={r.cpmqlMt} onChange={(v) => patch(idx, "cpmqlMt", v)} step={100} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border bg-muted/20">
        Tiny: BB piso R$30K/mês. CPMQL BB = R$700 padrão para todos os tiers. CPMQL MT = R$5.000 (custo SQL).
        {cpmqlReadOnly
          ? " CPMQL é referência da Matriz — só a Matriz edita; a unidade visualiza."
          : ""}
      </div>
    </EditableSection>
  );
}

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
  initial,
  onPersist,
}: {
  canEdit: boolean;
  initial: Produto[];
  onPersist: (rows: Produto[]) => Promise<boolean>;
}) {
  const [saved, setSaved] = useState<Produto[]>(initial);
  const [draft, setDraft] = useState<Produto[]>(initial);
  const [isEditing, setIsEditing] = useState(false);
  const rows = isEditing ? draft : saved;
  // Invariante P3: Saber% + Ter% + Executar% deve somar 100% em cada tier.
  // Bloqueia o save enquanto alguma linha estiver fora (tolerância 0.5).
  const linhasInvalidas = draft.filter((r) => Math.abs(somaAdesao(r) - 100) > 0.5);
  const podeSalvar = linhasInvalidas.length === 0;

  function patch<K extends keyof Produto>(idx: number, key: K, v: Produto[K]) {
    setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: v } : r)));
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
        setIsEditing(true);
      }}
      onSave={() => {
        if (!podeSalvar) return;
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
        % de adesão por tier × ticket médio (AT) de cada produto. TCV Pond. = soma ponderada.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <Th>Tier</Th>
              <Th align="right">Saber %</Th>
              <Th align="right">Saber TM</Th>
              <Th align="right">Ter %</Th>
              <Th align="right">Ter TM</Th>
              <Th align="right">Executar %</Th>
              <Th align="right">Executar TM</Th>
              <Th align="right">Soma %</Th>
              <Th align="right">TCV Pond.</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const soma = somaAdesao(r);
              const somaOk = Math.abs(soma - 100) < 0.5;
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
                    <CurrencyCell isEditing={isEditing} value={r.saberAt} onChange={(v) => patch(idx, "saberAt", v)} lockableZero />
                  </td>
                  <td className="px-1.5 py-2 text-xs text-right">
                    <PercentCell isEditing={isEditing} value={r.terPct} onChange={(v) => patch(idx, "terPct", v)} digits={0} lockableZero />
                  </td>
                  <td className="px-1.5 py-2 text-xs text-right">
                    <CurrencyCell isEditing={isEditing} value={r.terAt} onChange={(v) => patch(idx, "terAt", v)} lockableZero />
                  </td>
                  <td className="px-1.5 py-2 text-xs text-right">
                    <PercentCell isEditing={isEditing} value={r.execPct} onChange={(v) => patch(idx, "execPct", v)} digits={0} lockableZero />
                  </td>
                  <td className="px-1.5 py-2 text-xs text-right">
                    <CurrencyCell isEditing={isEditing} value={r.execAt} onChange={(v) => patch(idx, "execAt", v)} lockableZero />
                  </td>
                  <td
                    className={`px-1.5 py-2 text-xs text-right tabular-nums font-medium ${
                      somaOk ? "text-success" : "text-destructive"
                    }`}
                    title={somaOk ? undefined : `Soma deve ser 100% — atual ${soma.toFixed(0)}%.`}
                  >
                    {formatPercent(soma, 0)}
                  </td>
                  <td className="px-1.5 py-2 text-xs text-right tabular-nums font-medium text-success">
                    {formatBRL(tcvPonderado(r))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
  initial,
  onPersist,
  initialSplit,
  onPersistSplit,
}: {
  canEdit: boolean;
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

  return (
    <EditableSection
      title="Distribuição de Tier por Horizonte"
      badge={<SectionBadge>Benchmark V4</SectionBadge>}
      canEdit={canEdit}
      isEditing={isEditing}
      onEdit={() => {
        setDraftMercado(savedMercado);
        setDraftSplit(savedSplit);
        setIsEditing(true);
      }}
      onSave={() => {
        setSavedMercado(draftMercado);
        setSavedSplit(draftSplit);
        setIsEditing(false);
        void onPersist(draftMercado);
        void onPersistSplit(draftSplit);
      }}
      onCancel={() => {
        setDraftMercado(savedMercado);
        setDraftSplit(savedSplit);
        setIsEditing(false);
      }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
        {/* Coluna esquerda — Tier × % Mercado */}
        <div className="min-w-0 rounded border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 text-[11px] text-muted-foreground border-b border-border/60">
            Distribuição base do mercado por tier. Marque a partir de qual horizonte cada tier fica ativo — a liberação é cumulativa (vale dali até H5).
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <Th>Tier</Th>
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
                      <PercentCell
                        isEditing={isEditing}
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
                            disabled={!isEditing}
                            onClick={() => toggleHoriz(idx, h)}
                            title={
                              isEditing
                                ? `${ativo ? "Desativar" : "Liberar"} ${r.tier} a partir de ${h}`
                                : `${r.tier} ${ativo ? "ativo" : "inativo"} em ${h}`
                            }
                            className={`inline-flex h-4 w-4 items-center justify-center rounded-[3px] border transition-colors ${
                              ativo
                                ? "bg-accent border-accent text-accent-foreground"
                                : "bg-card border-border text-transparent"
                            } ${
                              isEditing
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

        {/* Coluna direita — Horizonte × Tiers (split normalizado) */}
        <div className="min-w-0 rounded border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 text-[11px] text-muted-foreground border-b border-border/60 bg-muted/10">
            Distribuição normalizada (renormalizada para 100%) considerando apenas os tiers ativos em cada horizonte.
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
                </tr>
              </thead>
              <tbody>
                {split.map((r, idx) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border bg-muted/20">
        * Os tiers ativos em cada horizonte vêm da <span className="text-foreground">grade de liberação</span> ao lado — marque/desmarque ali para liberar ou ocultar um tier num horizonte.
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

