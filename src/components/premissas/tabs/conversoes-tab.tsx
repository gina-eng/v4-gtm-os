"use client";

import { useState } from "react";
import { Inbox, Megaphone, type LucideIcon } from "lucide-react";
import { EditableSection, SectionBadge } from "../editable-section";
import { PercentCell } from "../editable-cell";
import {
  type ConversaoEventos,
  type ConversaoInbound,
  type ConversaoMeetingBroker,
  type ConversaoOutbound,
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
      {/* ============ CANAL: INBOUND — subcanais que iniciam em Lead/MQL ============ */}
      <ChannelHeader
        icon={Inbox}
        label="Inbound"
        countLabel="4 subcanais"
        description="O lead chega até nós. Funil completo iniciando em Lead/MQL."
      />
      <ChannelGroup>
        <InboundCRSection
          title="Lead Broker"
          seed={inbound.leadBroker}
          canEdit={canEdit}
          onPersist={(data) => persist({ block: "conversaoInbound", canal: "lead_broker", data })}
        />
        <InboundCRSection
          title="Black Box"
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
          crSeed={inbound.eventos}
          onPersistCr={(data) => persist({ block: "conversaoEventos", data })}
        />
      </ChannelGroup>

      {/* ============ CANAL: OUTBOUND — subcanais que iniciam em Lead → SQL (sem MQL) ============ */}
      <ChannelHeader
        icon={Megaphone}
        label="Outbound"
        countLabel="4 subcanais"
        description="Nós abordamos o lead. Funil curto, pula MQL (Lead → SQL)."
        className="mt-9"
      />
      <ChannelGroup>
        <OutboundCRSection
          title="Indicação"
          seed={outbound.indicacao}
          canEdit={canEdit}
          onPersist={(data) => persist({ block: "conversaoOutbound", subcanal: "indicacao", data })}
        />
        <OutboundCRSection
          title="Recovery"
          seed={outbound.recovery}
          canEdit={canEdit}
          onPersist={(data) => persist({ block: "conversaoOutbound", subcanal: "recovery", data })}
        />
        <OutboundCRSection
          title="Recomendação"
          seed={outbound.recomendacao}
          canEdit={canEdit}
          onPersist={(data) => persist({ block: "conversaoOutbound", subcanal: "recomendacao", data })}
        />
        <OutboundCRSection
          title="Prospecção Ativa"
          seed={outbound.prospeccao}
          canEdit={canEdit}
          onPersist={(data) => persist({ block: "conversaoOutbound", subcanal: "prospeccao", data })}
        />
      </ChannelGroup>
    </>
  );
}

// ============================================================
// CABEÇALHO DE CANAL + AGRUPAMENTO DE SUBCANAIS
// ============================================================

/**
 * Banner que abre um CANAL (Inbound / Outbound) acima dos seus subcanais.
 * Estabelece a hierarquia canal → subcanais que antes só existia em comentário.
 */
function ChannelHeader({
  icon: Icon,
  label,
  countLabel,
  description,
  className = "",
}: {
  icon: LucideIcon;
  label: string;
  countLabel: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 mb-3 ${className}`}>
      <span
        aria-hidden
        className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-accent/10 text-accent shrink-0"
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">{label}</h2>
          <span className="inline-flex items-center rounded-full bg-accent/10 text-accent px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider whitespace-nowrap">
            Canal · {countLabel}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{description}</p>
      </div>
      <span aria-hidden className="flex-1 h-px bg-border ml-1" />
    </div>
  );
}

/** Trilho lateral que "abraça" os subcanais de um canal, reforçando o vínculo visual. */
function ChannelGroup({ children }: { children: React.ReactNode }) {
  return <div className="border-l-2 border-accent/25 pl-3 sm:pl-4">{children}</div>;
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
        O Custo/SQL fica em Premissas → Receita por Produto / Tier.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <Th>Canal</Th>
              <Th align="right">CR3 SQL→SAL</Th>
              <Th align="right">CR4 SAL→Won</Th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-card border-b border-border/60">
              <td className="px-2 py-2 text-xs font-medium text-accent">Meeting Broker</td>
              <td className="px-2 py-2 text-xs text-right">
                <PercentCell isEditing={isEditing} value={r.cr3} onChange={(v) => patch("cr3", v)} digits={0} lockableZero />
              </td>
              <td className="px-2 py-2 text-xs text-right">
                <PercentCell isEditing={isEditing} value={r.cr4} onChange={(v) => patch("cr4", v)} digits={0} lockableZero />
              </td>
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
  crSeed,
  onPersistCr,
}: {
  canEdit: boolean;
  crSeed: ConversaoEventos[];
  onPersistCr: (data: ConversaoEventos[]) => Promise<boolean>;
}) {
  const [savedCr, setSavedCr] = useState<ConversaoEventos[]>(crSeed);
  const [draftCr, setDraftCr] = useState<ConversaoEventos[]>(crSeed);
  const [isEditing, setIsEditing] = useState(false);
  const rows = isEditing ? draftCr : savedCr;

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
        setDraftCr(savedCr);
        setIsEditing(true);
      }}
      onSave={() => {
        setSavedCr(draftCr);
        setIsEditing(false);
        void onPersistCr(draftCr);
      }}
      onCancel={() => {
        setDraftCr(savedCr);
        setIsEditing(false);
      }}
    >
      <div className="px-4 py-2.5 text-[11px] text-muted-foreground border-b border-border/60">
        Eventos próprios/de mercado — inbound funil curto (sem MQL). CR3/CR4 variam por tier; orçamento vem do Split EV. O Custo/SQL fica em Premissas → Receita por Produto / Tier.
      </div>
      <div className="overflow-x-auto">
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

// `TextCell` removido: Meta/Pipeline saíram de Meeting Broker e Eventos.
