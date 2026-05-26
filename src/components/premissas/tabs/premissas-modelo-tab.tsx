"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
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
import { FieldHelp } from "@/components/ui/field-help";
import { CargoSelect } from "@/components/iniciar/cargo-select";

type PersistBlock = (patch: PremissaBlockPatch) => Promise<boolean>;

type CacContext = {
  investido: number;
  won: number;
  unidades: number;
} | null;

type Props = {
  canEdit: boolean;
  actingAsMatriz: boolean;
  cacContext: CacContext;
  blocks: PremissasBlocks;
  persist: PersistBlock;
};

/** Mapeia o membro simplificado da tela pro shape completo do bloco (template da matriz). */
function toMembroBlock(m: Membro): TimeComercialMembro {
  return { email: "", cargo: m.cargo, salario: m.salario, comissaoPct: m.comissaoPct, capacidadePct: 100 };
}

export function PremissasModeloTab({ canEdit, actingAsMatriz, cacContext, blocks, persist }: Props) {
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
      {/* Linha unificada — TIME COMERCIAL (CAC dinâmico) + P7 (derivado, read-only).
          Ambas seções têm conteúdo estreito; lado-a-lado economiza espaço vertical. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TimeComercialSection
          canEdit={canEdit}
          team={team}
          onTeamChange={setTeam}
          cacContext={cacContext}
          onPersist={(rows) => persist({ block: "timeComercial", data: rows.map(toMembroBlock) })}
        />
        <CplTcvPondSection />
      </div>

      {/* P17 — capacidade / operação */}
      <CapacidadeSection
        canEdit={canEdit}
        cargos={cargos}
        initial={blocks.metricasOperacionais}
        onPersist={(rows) => persist({ block: "metricasOperacionais", data: rows })}
      />

      {/* P1 — horizontes */}
      <HorizontesSection
        canEdit={canEdit}
        actingAsMatriz={actingAsMatriz}
        initial={blocks.horizontes}
        onPersist={(rows) => persist({ block: "horizontes", data: rows })}
      />

      {/* P6 — investimento em mídia */}
      <InvestimentoMidiaSection
        canEdit={canEdit}
        actingAsMatriz={actingAsMatriz}
        initial={blocks.investimentoMidia}
        onPersist={(rows) => persist({ block: "investimentoMidia", data: rows })}
      />

      {/* P2 — tiers de cliente */}
      <TiersClienteSection
        canEdit={canEdit}
        initial={blocks.tiersCliente}
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

function custoMes(m: Membro): number {
  return m.salario * (1 + m.comissaoPct / 100);
}

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
              <Th help="Posição/role do time comercial.">Cargo</Th>
              <Th align="right" help="Salário mensal bruto sem comissão. Em reais.">Salário Base</Th>
              <Th align="right" help="% de comissão sobre o salário base — usada pra estimar o custo total mensal do cargo.">Comissão %</Th>
              <Th align="right" help="Salário × (1 + Comissão %). Calculado automaticamente — entra no CAC dinâmico.">Custo/Mês Est.</Th>
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
                Sem realizado preenchido. Custo time {formatBRL(custoTimeTotal)} · preencha investido + won em <em>Realizado vs Projetado</em>.
              </div>
            </>
          ) : (
            <>
              <div className="text-xl font-bold text-accent tabular-nums">{formatBRL(cacCalculado)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Custo time {formatBRL(custoTimeTotal)} · Investido {formatBRL(investidoUltMes)} ·{" "}
                {wonUltMes} won
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
  help: string;
}> = [
  {
    key: "wipLimit",
    label: "WIP Limit",
    suffix: "/mês",
    help: "Work-in-progress: capacidade máxima do cargo em plena produção. Unidade depende do cargo (MQLs para SDR, leads para BDR, reuniões para Closer).",
  },
  {
    key: "contratacao",
    label: "Contratação",
    suffix: "dias",
    help: "Tempo médio em dias entre abrir a vaga e a pessoa começar.",
  },
  {
    key: "onboarding",
    label: "Onboarding",
    suffix: "dias",
    help: "Tempo em dias de treinamento inicial — da entrada até começar a executar com supervisão.",
  },
  {
    key: "rampagem",
    label: "Rampagem",
    suffix: "meses",
    help: "Tempo em meses até a pessoa atingir produtividade plena (100% do WIP).",
  },
  {
    key: "atingimentoMes",
    label: "Atinge 100%",
    suffix: "º mês",
    help: "A partir de qual mês de casa o colaborador entrega 100% do WIP Limit.",
  },
  {
    key: "permanencia",
    label: "Permanência",
    suffix: "meses",
    help: "Tempo médio em meses que a pessoa permanece no cargo antes de sair.",
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
    extra: "",
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
      title="P17 — Capacidade Operacional"
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
              <Th>
                <span className="inline-flex items-center gap-1">
                  Cargo
                  <FieldHelp text="Posição operacional do time comercial." position="bottom" />
                </span>
              </Th>
              {CAP_NUM_COLS.map((c) => (
                <Th key={c.key as string} align="right">
                  <span className="inline-flex items-center gap-1 justify-end">
                    {c.label}
                    {c.suffix && (
                      <span className="text-table-header-foreground/60 normal-case">
                        ({c.suffix})
                      </span>
                    )}
                    <FieldHelp text={c.help} position="bottom" />
                  </span>
                </Th>
              ))}
              <Th align="right">
                <span className="inline-flex items-center gap-1 justify-end">
                  Turnover/Mês
                  <FieldHelp text="Percentual mensal de saídas do cargo. Ex: 2% = a cada 50 colaboradores, 1 sai por mês." position="bottom" />
                </span>
              </Th>
              <Th align="right">
                <span className="inline-flex items-center gap-1 justify-end">
                  Ligações/Mês
                  <FieldHelp text="Volume médio de ligações por mês. Aplica-se a cargos de prospecção; use 0 para cargos sem cadência de ligação." position="bottom" />
                </span>
              </Th>
              <Th align="right">
                <span className="inline-flex items-center gap-1 justify-end">
                  Conexão %
                  <FieldHelp text="Taxa de conexão das ligações em %. Use 0 para cargos sem cadência de ligação." position="bottom" />
                </span>
              </Th>
              <Th>
                <span className="inline-flex items-center gap-1">
                  Extra
                  <FieldHelp text="Observações qualitativas livres — não entra em fórmulas." position="bottom" />
                </span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={CAP_NUM_COLS.length + 5}
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
                  <TextCell
                    value={r.extra}
                    isEditing={isEditing}
                    onChange={(v) => patch(r.cargo, "extra", v)}
                    className="px-1.5 max-w-[8rem]"
                  />
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
  actingAsMatriz,
  initial,
  onPersist,
}: {
  canEdit: boolean;
  actingAsMatriz: boolean;
  initial: Horizonte[];
  onPersist: (rows: Horizonte[]) => Promise<boolean>;
}) {
  const [saved, setSaved] = useState<Horizonte[]>(initial);
  const [draft, setDraft] = useState<Horizonte[]>(initial);
  const [isEditing, setIsEditing] = useState(false);
  const rows = isEditing ? draft : saved;
  const horizonteAtual: Horizonte["h"] | null = actingAsMatriz ? null : "H4";

  function patch<K extends keyof Horizonte>(idx: number, key: K, v: Horizonte[K]) {
    setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: v } : r)));
  }

  return (
    <EditableSection
      title="P1 — Horizontes de Crescimento"
      badge={<SectionBadge>Premissa 01</SectionBadge>}
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
                <CardField
                  label="Faixa Min"
                  help="Piso da faixa de faturamento mensal que caracteriza este horizonte (em R$)."
                >
                  <CurrencyCell
                    isEditing={isEditing}
                    value={r.faixaMin}
                    onChange={(v) => patch(idx, "faixaMin", v)}
                    step={10_000}
                    align="left"
                  />
                </CardField>
                <CardField
                  label="Faixa Máx"
                  help="Teto da faixa de faturamento mensal (em R$). Marque 'Sem teto' em H5 (unidade já consolidada, sem teto superior)."
                >
                  <NullableCurrencyCell
                    isEditing={isEditing}
                    value={r.faixaMax}
                    onChange={(v) => patch(idx, "faixaMax", v)}
                    step={10_000}
                    align="left"
                  />
                </CardField>
                <CardField
                  label="Tempo Máx (meses)"
                  help="Tempo máximo recomendado, em meses, para a unidade passar para o próximo horizonte. Marque 'Sem prazo' em H5."
                >
                  <NullableIntegerCell
                    isEditing={isEditing}
                    value={r.tempoMaxMeses}
                    onChange={(v) => patch(idx, "tempoMaxMeses", v)}
                    align="left"
                  />
                </CardField>
                <CardField
                  label="Cresc. Mensal"
                  help="Crescimento mensal mínimo esperado dentro do horizonte para evoluir no prazo."
                >
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
      <div className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border bg-muted/20">
        Fórmula: <code className="text-foreground">[(Receita atual ÷ anterior) − 1] × 100</code>
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
  bbPiso: number; // R$ — 0 quando não se aplica
  regra: string;
};

function InvestimentoMidiaSection({
  canEdit,
  actingAsMatriz,
  initial,
  onPersist,
}: {
  canEdit: boolean;
  actingAsMatriz: boolean;
  initial: Investimento[];
  onPersist: (rows: Investimento[]) => Promise<boolean>;
}) {
  const [saved, setSaved] = useState<Investimento[]>(initial);
  const [draft, setDraft] = useState<Investimento[]>(initial);
  const [isEditing, setIsEditing] = useState(false);
  const rows = isEditing ? draft : saved;
  // Quando a sessão é matriz (visão consolidada), nenhuma unidade está sendo
  // "impersonada", então não há horizonte atual a destacar.
  const horizonteAtual: Investimento["h"] | null = actingAsMatriz ? null : "H4";

  function patch<K extends keyof Investimento>(idx: number, key: K, v: Investimento[K]) {
    setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: v } : r)));
  }

  return (
    <EditableSection
      title="P6 — Investimento em Mídia por Horizonte"
      badge={<SectionBadge>Premissa 06 · Editável</SectionBadge>}
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
        % Produção = parcela do faturamento investida em mídia. Split LB/BB define a divisão entre Lead Broker e Black Box.
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
                <CardField
                  label="% Produção"
                  help="% do faturamento mensal investido em mídia (LB + BB)."
                >
                  <PercentCell
                    isEditing={isEditing}
                    value={r.pctProducao}
                    onChange={(v) => patch(idx, "pctProducao", v)}
                    align="left"
                  />
                </CardField>
                <CardField
                  label="Split LB"
                  help="% do investimento em mídia alocado em Lead Broker (inbound pago)."
                >
                  <PercentCell
                    isEditing={isEditing}
                    value={r.splitLb}
                    onChange={(v) => patch(idx, "splitLb", v)}
                    align="left"
                  />
                </CardField>
                <CardField
                  label="Split BB"
                  help="% do investimento em mídia alocado em Black Box (outbound estruturado)."
                >
                  <PercentCell
                    isEditing={isEditing}
                    value={r.splitBb}
                    onChange={(v) => patch(idx, "splitBb", v)}
                    lockableZero
                    align="left"
                  />
                </CardField>
                <CardField
                  label="BB Piso"
                  help="Investimento mínimo absoluto em BB. Se o split % ficar abaixo, o piso prevalece."
                >
                  <CurrencyCell
                    isEditing={isEditing}
                    value={r.bbPiso}
                    onChange={(v) => patch(idx, "bbPiso", v)}
                    step={1000}
                    lockableZero
                    align="left"
                  />
                </CardField>
                <CardField
                  label="Regra"
                  help="Observação sobre a estratégia daquele horizonte (texto livre, não entra em fórmulas)."
                >
                  {isEditing ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 border border-dashed border-warning bg-warning/5 rounded w-full">
                      <input
                        type="text"
                        value={r.regra}
                        onChange={(e) => patch(idx, "regra", e.target.value)}
                        placeholder="—"
                        className="bg-transparent text-xs focus:outline-none text-foreground w-full min-w-0"
                      />
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground break-words">
                      {r.regra ? r.regra : <span className="text-muted-foreground/40">—</span>}
                    </span>
                  )}
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
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
        <FieldHelp text={help} position="bottom" />
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
  tcvBooking: number;
  tcvProdCom: number;
  cplLb: number;
  cplBb: number;
};

function TiersClienteSection({
  canEdit,
  initial,
  onPersist,
}: {
  canEdit: boolean;
  initial: TierCliente[];
  onPersist: (rows: TierCliente[]) => Promise<boolean>;
}) {
  const [saved, setSaved] = useState<TierCliente[]>(initial);
  const [draft, setDraft] = useState<TierCliente[]>(initial);
  const [isEditing, setIsEditing] = useState(false);
  const rows = isEditing ? draft : saved;

  function patch<K extends keyof TierCliente>(idx: number, key: K, v: TierCliente[K]) {
    setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: v } : r)));
  }

  return (
    <EditableSection
      title="P2 — Tiers de Cliente"
      badge={<SectionBadge>Premissa 02</SectionBadge>}
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
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <Th help="Classificação do cliente por porte: Tiny → Small → Medium → Large → Enterprise.">Tier</Th>
              <Th align="right" help="Piso da faixa de faturamento anual do cliente neste tier (em R$).">Fat. Min</Th>
              <Th align="right" help="Teto da faixa de faturamento anual (em R$). Marque 'Sem teto' para faixas abertas à direita (ex: Enterprise R$500M+).">Fat. Máx</Th>
              <Th align="right" help="Total Contract Value no momento do fechamento — soma de todos os produtos contratados.">TCV-Booking</Th>
              <Th align="right" help="TCV considerando apenas Produção Comercial (sem upsells ou renovação).">TCV Prod.Com.</Th>
              <Th align="right" help="Custo Por Lead via Lead Broker — leads de mídia paga inbound (Meta/Google).">CPL LB</Th>
              <Th align="right" help="Custo Por Lead via Black Box — outbound estruturado. Padrão R$700.">CPL BB</Th>
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
                  <CurrencyCell isEditing={isEditing} value={r.tcvBooking} onChange={(v) => patch(idx, "tcvBooking", v)} />
                </td>
                <td className="px-1.5 py-2 text-xs text-right">
                  <CurrencyCell isEditing={isEditing} value={r.tcvProdCom} onChange={(v) => patch(idx, "tcvProdCom", v)} />
                </td>
                <td className="px-1.5 py-2 text-xs text-right">
                  <CurrencyCell isEditing={isEditing} value={r.cplLb} onChange={(v) => patch(idx, "cplLb", v)} step={10} />
                </td>
                <td className="px-1.5 py-2 text-xs text-right">
                  <CurrencyCell isEditing={isEditing} value={r.cplBb} onChange={(v) => patch(idx, "cplBb", v)} step={10} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border bg-muted/20">
        Tiny: BB piso R$30K/mês. CPL BB = R$700 padrão para todos os tiers.
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

  function patch<K extends keyof Produto>(idx: number, key: K, v: Produto[K]) {
    setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: v } : r)));
  }

  return (
    <EditableSection
      title="P3 — Receita por Produto / Tier"
      badge={<SectionBadge>Premissa 03</SectionBadge>}
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
        % de adesão por tier × ticket médio (AT) de cada produto. TCV Pond. = soma ponderada.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <Th help="Tier de cliente (mesmo da seção anterior).">Tier</Th>
              <Th align="right" help="% dos clientes deste tier que adquirem o produto Saber.">Saber %</Th>
              <Th align="right" help="Average Ticket — ticket médio do produto Saber neste tier.">Saber AT</Th>
              <Th align="right" help="% dos clientes deste tier que adquirem o produto Ter.">Ter %</Th>
              <Th align="right" help="Average Ticket — ticket médio do produto Ter neste tier.">Ter AT</Th>
              <Th align="right" help="% dos clientes deste tier que adquirem o produto Executar.">Executar %</Th>
              <Th align="right" help="Average Ticket — ticket médio do produto Executar neste tier.">Executar AT</Th>
              <Th align="right" help="TCV Ponderado = (Saber% × Saber AT) + (Ter% × Ter AT) + (Executar% × Executar AT). Calculado automaticamente.">TCV Pond.</Th>
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
                <td className="px-1.5 py-2 text-xs text-right tabular-nums font-medium text-success">
                  {formatBRL(tcvPonderado(r))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
      title="P4 — Distribuição de Leads por Tier"
      badge={<SectionBadge>Premissa 04 · Benchmark V4</SectionBadge>}
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
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4 p-4">
        {/* Coluna esquerda — Tier × % Mercado */}
        <div className="min-w-0 rounded border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 text-[11px] text-muted-foreground border-b border-border/60">
            Distribuição base do mercado por tier e em qual horizonte cada tier passa a ser ativo.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <Th help="Tier de cliente por porte.">Tier</Th>
                  <Th align="right" help="Parcela do mercado endereçável deste tier. A soma de todos deve totalizar 100%.">% Mercado</Th>
                  <Th help="Horizonte a partir do qual este tier passa a ser ativo na unidade.">Entra em</Th>
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
                    <td className="px-1.5 py-2 text-xs">
                      {isEditing ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 border border-dashed border-warning bg-warning/5 rounded">
                          <select
                            value={r.entraHorizonte}
                            onChange={(e) => patchEntra(idx, e.target.value as HorizonteName)}
                            className="bg-transparent text-xs focus:outline-none text-foreground"
                          >
                            {HORIZ_LIST.map((h) => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{r.entraHorizonte}</span>
                      )}
                    </td>
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
                  <td />
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
                  <Th help="Horizonte da unidade (H1–H5).">Horizonte</Th>
                  {TIER_COLS.map((t) => (
                    <Th key={t} align="right" help={`% normalizada de leads alocados ao tier ${t} neste horizonte. A soma da linha deve dar 100%.`}>
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
        * Tiers ativos em cada horizonte vêm da coluna <span className="text-foreground">Entra em</span> ao lado — edite ali para liberar ou ocultar um tier num horizonte.
      </div>
    </EditableSection>
  );
}

// ============================================================
// P7 — CPL e TCV MÉDIO PONDERADO POR HORIZONTE (read-only / derivado)
// ============================================================

function CplTcvPondSection() {
  const linhas = [
    { h: "H1", cplLbPond: 637, tcvMedPond: 22_389 },
    { h: "H2", cplLbPond: 637, tcvMedPond: 22_389 },
    { h: "H3", cplLbPond: 843, tcvMedPond: 27_233 },
    { h: "H4", cplLbPond: 971, tcvMedPond: 30_944 },
    { h: "H5", cplLbPond: 1_042, tcvMedPond: 34_316 },
  ];
  return (
    <EditableSection
      title="P7 — CPL e TCV Médio Ponderado por Horizonte"
      badge={<SectionBadge>Premissa 07 · Derivado</SectionBadge>}
      canEdit={false}
      isEditing={false}
      onEdit={() => {}}
      onSave={() => {}}
      onCancel={() => {}}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <Th help="Horizonte da unidade (H1–H5).">Horizonte</Th>
              <Th align="right" help="CPL Lead Broker ponderado pelo mix de tiers ativos no horizonte. Derivado de P2 + P4 — não editável.">CPL LB Pond.</Th>
              <Th align="right" help="TCV médio ponderado pelo mix de tiers ativos no horizonte. Derivado de P3 + P4 — não editável.">TCV Médio Pond.</Th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((r, idx) => (
              <tr
                key={r.h}
                className={`${idx % 2 === 0 ? "bg-card" : "bg-muted/30"} border-b border-border/60`}
              >
                <td className="px-1.5 py-2 text-xs font-medium text-accent">{r.h}</td>
                <td className="px-1.5 py-2 text-xs text-right tabular-nums">{formatBRL(r.cplLbPond)}</td>
                <td className="px-1.5 py-2 text-xs text-right tabular-nums">{formatBRL(r.tcvMedPond)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border bg-muted/20">
        Calculado automaticamente a partir de P2 (CPL por tier) e P4 (split de tier por horizonte). Não é editável.
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
      className={`bg-table-header text-table-header-foreground h-8 font-medium px-1.5 py-1.5 text-[10px] uppercase tracking-wider whitespace-nowrap ${alignClass}`}
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

/** Célula de texto genérica — read-only vira span, editing vira input. */
function TextCell({
  value,
  isEditing,
  onChange,
  placeholder = "—",
  className = "px-1.5 py-2",
}: {
  value: string;
  isEditing: boolean;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  if (!isEditing) {
    return (
      <td className={`${className} text-xs text-muted-foreground`}>
        {value ? value : <span className="text-muted-foreground/40">{placeholder}</span>}
      </td>
    );
  }
  return (
    <td className={`${className} text-xs`}>
      <span className="inline-flex items-center px-1.5 py-0.5 border border-dashed border-warning bg-warning/5 rounded w-full">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="bg-transparent text-xs focus:outline-none text-foreground w-full min-w-0"
        />
      </span>
    </td>
  );
}
