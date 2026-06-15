"use client";

import { useState } from "react";
import { EditableSection, SectionBadge } from "../editable-section";
import { CurrencyCell, PercentCell } from "../editable-cell";
import { formatBRL, formatPercent } from "../format";
import {
  type ConversaoEventos,
  type ConversaoInbound,
  type ConversaoMeetingBroker,
  type ConversaoOutbound,
  type EventosCusto,
  type MixOutboundHorizonte,
  type Tier,
} from "@/lib/premissas/matriz-defaults";
import type { PremissaBlockPatch, PremissasBlocks } from "@/db/repositories/premissas";

type PersistBlock = (patch: PremissaBlockPatch) => Promise<boolean>;

type Props = { canEdit: boolean; blocks: PremissasBlocks; persist: PersistBlock };

export function ConversoesTab({ canEdit, blocks, persist }: Props) {
  const inbound = blocks.conversoesInbound;
  const outbound = blocks.conversoesOutbound;
  return (
    <>
      {/* INBOUND — canais que iniciam em Lead/MQL */}
      <InboundCRSection
        title="CRs Lead Broker por Tier"
        seed={inbound.leadBroker}
        canEdit={canEdit}
        onPersist={(data) => persist({ block: "conversaoInbound", canal: "lead_broker", data })}
      />
      <InboundCRSection
        title="CRs Black Box por Tier"
        seed={inbound.blackBox}
        canEdit={canEdit}
        onPersist={(data) => persist({ block: "conversaoInbound", canal: "black_box", data })}
      />
      <MeetingBrokerSection
        canEdit={canEdit}
        seed={inbound.meetingBroker}
        onPersist={(data) => persist({ block: "meetingBroker", data })}
      />
      <EventosSection
        canEdit={canEdit}
        custoSeed={inbound.eventosCusto}
        crSeed={inbound.eventos}
        onPersistCusto={(data) => persist({ block: "eventosCusto", data })}
        onPersistCr={(data) => persist({ block: "conversaoEventos", data })}
      />

      {/* OUTBOUND — canais que iniciam em Lead → SQL (sem etapa MQL) */}
      <OutboundCRSection
        title="Outbound: Indicação"
        seed={outbound.indicacao}
        canEdit={canEdit}
        onPersist={(data) => persist({ block: "conversaoOutbound", subcanal: "indicacao", data })}
      />
      <OutboundCRSection
        title="Outbound: Recovery"
        seed={outbound.recovery}
        canEdit={canEdit}
        onPersist={(data) => persist({ block: "conversaoOutbound", subcanal: "recovery", data })}
      />
      <OutboundCRSection
        title="Outbound: Recomendação"
        seed={outbound.recomendacao}
        canEdit={canEdit}
        onPersist={(data) => persist({ block: "conversaoOutbound", subcanal: "recomendacao", data })}
      />
      <OutboundCRSection
        title="Outbound: Prospecção Ativa"
        seed={outbound.prospeccao}
        canEdit={canEdit}
        onPersist={(data) => persist({ block: "conversaoOutbound", subcanal: "prospeccao", data })}
      />

      {/* MIX */}
      <MixSubcanaisSection
        canEdit={canEdit}
        seed={blocks.mixSubcanais}
        onPersist={(data) => persist({ block: "mixSubcanais", data })}
      />
    </>
  );
}

// ============================================================
// INBOUND (Lead → MQL → SQL → SAL → Won) — P8 / P9
// ============================================================

function InboundCRSection({
  title,
  badge,
  seed,
  canEdit,
  onPersist,
}: {
  title: string;
  badge?: React.ReactNode;
  seed: ConversaoInbound[];
  canEdit: boolean;
  onPersist: (data: ConversaoInbound[]) => Promise<boolean>;
}) {
  const [saved, setSaved] = useState<ConversaoInbound[]>(seed);
  const [draft, setDraft] = useState<ConversaoInbound[]>(seed);
  const [isEditing, setIsEditing] = useState(false);
  const rows = isEditing ? draft : saved;

  function patch<K extends keyof ConversaoInbound>(idx: number, key: K, v: ConversaoInbound[K]) {
    setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: v } : r)));
  }

  return (
    <EditableSection
      title={title}
      badge={badge}
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
              <Th>Tier</Th>
              <Th align="right">CR1 L→MQL</Th>
              <Th align="right">CR2 MQL→SQL</Th>
              <Th align="right">CR3 SQL→SAL</Th>
              <Th align="right">CR4 SAL→Won</Th>
              <th className="bg-table-header text-table-header-foreground/70 h-8 font-medium px-2 py-1.5 text-[10px] uppercase tracking-wider text-right border-l border-table-header-foreground/20">
                <span className="inline-flex items-center gap-1 justify-end">
                  CR5 W→At
                </span>
              </th>
              <Th align="right">CR6 At→Ren</Th>
              <Th align="right">CR7 Ren→Exp</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr
                key={r.tier}
                className={`${idx % 2 === 0 ? "bg-card" : "bg-muted/30"} border-b border-border/60`}
              >
                <td className="px-2 py-2 text-xs font-medium text-accent">{r.tier}</td>
                {(["cr1", "cr2", "cr3", "cr4"] as const).map((key) => (
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
                <td className="px-2 py-2 text-xs text-right border-l border-border/60">
                  <PercentCell isEditing={isEditing} value={r.cr5} onChange={(v) => patch(idx, "cr5", v)} digits={0} lockableZero />
                </td>
                <td className="px-2 py-2 text-xs text-right">
                  <PercentCell isEditing={isEditing} value={r.cr6} onChange={(v) => patch(idx, "cr6", v)} digits={0} lockableZero />
                </td>
                <td className="px-2 py-2 text-xs text-right">
                  <PercentCell isEditing={isEditing} value={r.cr7} onChange={(v) => patch(idx, "cr7", v)} digits={0} lockableZero />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border bg-muted/20">
        CR1–CR4 = funil de aquisição. CR5–CR7 = pós-venda (ativação, renovação, expansão).
      </div>
    </EditableSection>
  );
}

// ============================================================
// P10 — MEETING BROKER (Enterprise only — SQL → SAL → Won)
// ============================================================

function MeetingBrokerSection({
  canEdit,
  seed,
  onPersist,
}: {
  canEdit: boolean;
  seed: ConversaoMeetingBroker;
  onPersist: (data: ConversaoMeetingBroker) => Promise<boolean>;
}) {
  const [saved, setSaved] = useState<ConversaoMeetingBroker>(seed);
  const [draft, setDraft] = useState<ConversaoMeetingBroker>(seed);
  const [isEditing, setIsEditing] = useState(false);
  const r = isEditing ? draft : saved;

  function patch<K extends keyof ConversaoMeetingBroker>(key: K, v: ConversaoMeetingBroker[K]) {
    setDraft((prev) => ({ ...prev, [key]: v }));
  }

  return (
    <EditableSection
      title="Meeting Broker (Enterprise)"
      badge={<SectionBadge>SQL → SAL → Won</SectionBadge>}
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
        Canal exclusivo para tier Enterprise. Funil curto (sem MQL): paga por SQL qualificado.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <Th>Canal</Th>
              <Th align="right">Custo/SQL</Th>
              <Th align="right">CR3 SQL→SAL</Th>
              <Th align="right">CR4 SAL→Won</Th>
              <Th>Meta</Th>
              <Th>Pipeline</Th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-card border-b border-border/60">
              <td className="px-2 py-2 text-xs font-medium text-accent">Meeting Broker</td>
              <td className="px-2 py-2 text-xs text-right">
                <CurrencyCell isEditing={isEditing} value={r.custoSql} onChange={(v) => patch("custoSql", v)} step={500} lockableZero />
              </td>
              <td className="px-2 py-2 text-xs text-right">
                <PercentCell isEditing={isEditing} value={r.cr3} onChange={(v) => patch("cr3", v)} digits={0} lockableZero />
              </td>
              <td className="px-2 py-2 text-xs text-right">
                <PercentCell isEditing={isEditing} value={r.cr4} onChange={(v) => patch("cr4", v)} digits={0} lockableZero />
              </td>
              <TextCell value={r.meta} isEditing={isEditing} onChange={(v) => patch("meta", v)} />
              <TextCell value={r.pipeline} isEditing={isEditing} onChange={(v) => patch("pipeline", v)} />
            </tr>
          </tbody>
        </table>
      </div>
    </EditableSection>
  );
}

// ============================================================
// EVENTOS — inbound funil curto multi-tier (custoSql singleton + CR3/CR4 por tier)
// ============================================================

const TIER_ORDER_EV: Tier[] = ["Tiny", "Small", "Medium", "Large", "Enterprise"];

function EventosSection({
  canEdit,
  custoSeed,
  crSeed,
  onPersistCusto,
  onPersistCr,
}: {
  canEdit: boolean;
  custoSeed: EventosCusto;
  crSeed: ConversaoEventos[];
  onPersistCusto: (data: EventosCusto) => Promise<boolean>;
  onPersistCr: (data: ConversaoEventos[]) => Promise<boolean>;
}) {
  const [savedCusto, setSavedCusto] = useState<EventosCusto>(custoSeed);
  const [draftCusto, setDraftCusto] = useState<EventosCusto>(custoSeed);
  const [savedCr, setSavedCr] = useState<ConversaoEventos[]>(crSeed);
  const [draftCr, setDraftCr] = useState<ConversaoEventos[]>(crSeed);
  const [isEditing, setIsEditing] = useState(false);
  const c = isEditing ? draftCusto : savedCusto;
  const rows = isEditing ? draftCr : savedCr;

  function patchCusto<K extends keyof EventosCusto>(key: K, v: EventosCusto[K]) {
    setDraftCusto((prev) => ({ ...prev, [key]: v }));
  }
  function patchCr<K extends keyof ConversaoEventos>(idx: number, key: K, v: ConversaoEventos[K]) {
    setDraftCr((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: v } : r)));
  }

  return (
    <EditableSection
      title="Eventos (multi-tier)"
      badge={<SectionBadge>SQL → SAL → Won</SectionBadge>}
      canEdit={canEdit}
      isEditing={isEditing}
      onEdit={() => {
        setDraftCusto(savedCusto);
        setDraftCr(savedCr);
        setIsEditing(true);
      }}
      onSave={() => {
        setSavedCusto(draftCusto);
        setSavedCr(draftCr);
        setIsEditing(false);
        void onPersistCusto(draftCusto);
        void onPersistCr(draftCr);
      }}
      onCancel={() => {
        setDraftCusto(savedCusto);
        setDraftCr(savedCr);
        setIsEditing(false);
      }}
    >
      <div className="px-4 py-2.5 text-[11px] text-muted-foreground border-b border-border/60">
        Eventos próprios/de mercado — inbound funil curto (sem MQL). Custo/SQL é único; CR3/CR4 variam por tier. Orçamento vem do Split EV.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <Th>Configuração</Th>
              <Th align="right">Custo/SQL</Th>
              <Th>Meta</Th>
              <Th>Pipeline</Th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-card border-b border-border/60">
              <td className="px-2 py-2 text-xs font-medium text-accent">Eventos</td>
              <td className="px-2 py-2 text-xs text-right">
                <CurrencyCell isEditing={isEditing} value={c.custoSql} onChange={(v) => patchCusto("custoSql", v)} step={500} lockableZero />
              </td>
              <TextCell value={c.meta} isEditing={isEditing} onChange={(v) => patchCusto("meta", v)} />
              <TextCell value={c.pipeline} isEditing={isEditing} onChange={(v) => patchCusto("pipeline", v)} />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto border-t border-border/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <Th>Tier</Th>
              <Th align="right">CR3 SQL→SAL</Th>
              <Th align="right">CR4 SAL→Won</Th>
            </tr>
          </thead>
          <tbody>
            {TIER_ORDER_EV.map((tier) => {
              const idx = rows.findIndex((r) => r.tier === tier);
              const r = idx >= 0 ? rows[idx] : { tier, cr3: 0, cr4: 0 };
              return (
                <tr key={tier} className="bg-card border-b border-border/60">
                  <td className="px-2 py-2 text-xs font-medium text-accent">{tier}</td>
                  <td className="px-2 py-2 text-xs text-right">
                    <PercentCell isEditing={isEditing} value={r.cr3} onChange={(v) => patchCr(idx, "cr3", v)} digits={0} lockableZero />
                  </td>
                  <td className="px-2 py-2 text-xs text-right">
                    <PercentCell isEditing={isEditing} value={r.cr4} onChange={(v) => patchCr(idx, "cr4", v)} digits={0} lockableZero />
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
// OUTBOUND (Lead → SQL → SAL → Won) — P11 a P15
// ============================================================

function OutboundCRSection({
  title,
  badge,
  seed,
  canEdit,
  onPersist,
}: {
  title: string;
  badge?: React.ReactNode;
  seed: ConversaoOutbound[];
  canEdit: boolean;
  onPersist: (data: ConversaoOutbound[]) => Promise<boolean>;
}) {
  const [saved, setSaved] = useState<ConversaoOutbound[]>(seed);
  const [draft, setDraft] = useState<ConversaoOutbound[]>(seed);
  const [isEditing, setIsEditing] = useState(false);
  const rows = isEditing ? draft : saved;

  function patch<K extends keyof ConversaoOutbound>(idx: number, key: K, v: ConversaoOutbound[K]) {
    setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: v } : r)));
  }

  return (
    <EditableSection
      title={title}
      badge={badge}
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
              <Th>Tier</Th>
              <Th align="right">CR1 L→SQL</Th>
              <Th align="right">CR3 SQL→SAL</Th>
              <Th align="right">CR4 SAL→Won</Th>
              <Th align="right">CR6 At→Ren</Th>
              <Th align="right">CR7 Ren→Exp</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr
                key={r.tier}
                className={`${idx % 2 === 0 ? "bg-card" : "bg-muted/30"} border-b border-border/60`}
              >
                <td className="px-2 py-2 text-xs font-medium text-accent">{r.tier}</td>
                {(["cr1", "cr3", "cr4"] as const).map((key) => (
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
                <td className="px-2 py-2 text-xs text-right border-l border-border/60">
                  <PercentCell isEditing={isEditing} value={r.cr6} onChange={(v) => patch(idx, "cr6", v)} digits={0} lockableZero />
                </td>
                <td className="px-2 py-2 text-xs text-right">
                  <PercentCell isEditing={isEditing} value={r.cr7} onChange={(v) => patch(idx, "cr7", v)} digits={0} lockableZero />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border bg-muted/20">
        Funil outbound pula MQL: Lead → SQL → SAL → Won.
      </div>
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
              <Th align="right">Indicação</Th>
              <Th align="right">Recovery</Th>
              <Th align="right">Recomendação</Th>
              <Th align="right">Prospecção</Th>
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
// Helpers
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
      className={`bg-table-header text-table-header-foreground h-8 font-medium px-2 py-1.5 text-[10px] uppercase tracking-wider ${alignClass}`}
    >
      {children}
    </th>
  );
}

function TextCell({
  value,
  isEditing,
  onChange,
  placeholder = "—",
}: {
  value: string;
  isEditing: boolean;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  if (!isEditing) {
    return (
      <td className="px-2 py-2 text-xs text-muted-foreground">
        {value ? value : <span className="text-muted-foreground/40">{placeholder}</span>}
      </td>
    );
  }
  return (
    <td className="px-2 py-2 text-xs">
      <span className="inline-flex items-center px-2 py-0.5 border border-dashed border-warning bg-warning/5 rounded">
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
