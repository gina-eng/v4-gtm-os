"use client";

import { useState } from "react";
import { EditableSection, SectionBadge } from "../editable-section";
import { CurrencyCell, PercentCell } from "../editable-cell";
import { formatBRL, formatPercent } from "../format";
import { FieldHelp } from "@/components/ui/field-help";
import {
  type ConversaoInbound,
  type ConversaoMeetingBroker,
  type ConversaoOutbound,
  type MixOutboundHorizonte,
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
        title="P8 — CRs Lead Broker por Tier"
        badge={<SectionBadge>Premissa 08</SectionBadge>}
        seed={inbound.leadBroker}
        canEdit={canEdit}
        onPersist={(data) => persist({ block: "conversaoInbound", canal: "lead_broker", data })}
      />
      <InboundCRSection
        title="P9 — CRs Black Box por Tier"
        badge={<SectionBadge>Premissa 09</SectionBadge>}
        seed={inbound.blackBox}
        canEdit={canEdit}
        onPersist={(data) => persist({ block: "conversaoInbound", canal: "black_box", data })}
      />
      <MeetingBrokerSection
        canEdit={canEdit}
        seed={inbound.meetingBroker}
        onPersist={(data) => persist({ block: "meetingBroker", data })}
      />

      {/* OUTBOUND — canais que iniciam em Lead → SQL (sem etapa MQL) */}
      <OutboundCRSection
        title="P11 — Outbound: Indicação"
        badge={<SectionBadge>Premissa 11</SectionBadge>}
        seed={outbound.indicacao}
        canEdit={canEdit}
        onPersist={(data) => persist({ block: "conversaoOutbound", subcanal: "indicacao", data })}
      />
      <OutboundCRSection
        title="P12 — Outbound: Eventos"
        badge={<SectionBadge>Premissa 12</SectionBadge>}
        seed={outbound.eventos}
        canEdit={canEdit}
        onPersist={(data) => persist({ block: "conversaoOutbound", subcanal: "eventos", data })}
      />
      <OutboundCRSection
        title="P13 — Outbound: Recovery"
        badge={<SectionBadge>Premissa 13</SectionBadge>}
        seed={outbound.recovery}
        canEdit={canEdit}
        onPersist={(data) => persist({ block: "conversaoOutbound", subcanal: "recovery", data })}
      />
      <OutboundCRSection
        title="P14 — Outbound: Recomendação"
        badge={<SectionBadge>Premissa 14</SectionBadge>}
        seed={outbound.recomendacao}
        canEdit={canEdit}
        onPersist={(data) => persist({ block: "conversaoOutbound", subcanal: "recomendacao", data })}
      />
      <OutboundCRSection
        title="P15 — Outbound: Prospecção Ativa"
        badge={<SectionBadge>Premissa 15</SectionBadge>}
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
  badge: React.ReactNode;
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
              <Th help="Tier de cliente por porte.">Tier</Th>
              <Th align="right" help="CR1 = % de Leads que viram MQL (Marketing Qualified Lead).">CR1 L→MQL</Th>
              <Th align="right" help="CR2 = % de MQLs que viram SQL (Sales Qualified Lead).">CR2 MQL→SQL</Th>
              <Th align="right" help="CR3 = % de SQLs que viram SAL (Sales Accepted Lead — reunião realizada).">CR3 SQL→SAL</Th>
              <Th align="right" help="CR4 = % de SALs que fecham deal (Won).">CR4 SAL→Won</Th>
              <th className="bg-table-header text-table-header-foreground/70 h-8 font-medium px-2 py-1.5 text-[10px] uppercase tracking-wider text-right border-l border-table-header-foreground/20">
                <span className="inline-flex items-center gap-1 justify-end">
                  CR5 W→At
                  <FieldHelp text="Pós-venda: % de Won que viram clientes Ativos." position="bottom" />
                </span>
              </th>
              <Th align="right" help="Pós-venda: % de Ativos que renovam o contrato.">CR6 At→Ren</Th>
              <Th align="right" help="Pós-venda: % de Renovações que viram Expansão (upsell).">CR7 Ren→Exp</Th>
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
      title="P10 — Meeting Broker (Enterprise)"
      badge={<SectionBadge>Premissa 10 · SQL → SAL → Won</SectionBadge>}
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
              <Th help="Canal de aquisição — neste caso, Meeting Broker (exclusivo para tier Enterprise).">Canal</Th>
              <Th align="right" help="Custo por SQL qualificado entregue pelo Meeting Broker.">Custo/SQL</Th>
              <Th align="right" help="% de SQLs que viram SAL (reunião realizada).">CR3 SQL→SAL</Th>
              <Th align="right" help="% de SALs que fecham deal (Won).">CR4 SAL→Won</Th>
              <Th help="Meta de fechamento esperada do canal.">Meta</Th>
              <Th help="Comportamento típico do pipeline do canal.">Pipeline</Th>
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
  badge: React.ReactNode;
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
              <Th help="Tier de cliente por porte.">Tier</Th>
              <Th align="right" help="CR1 outbound: % de Leads que pulam direto para SQL (sem etapa MQL).">CR1 L→SQL</Th>
              <Th align="right" help="% de SQLs que viram SAL (reunião realizada).">CR3 SQL→SAL</Th>
              <Th align="right" help="% de SALs que fecham deal (Won).">CR4 SAL→Won</Th>
              <Th align="right" help="Pós-venda: % de Ativos que renovam o contrato.">CR6 At→Ren</Th>
              <Th align="right" help="Pós-venda: % de Renovações que viram Expansão.">CR7 Ren→Exp</Th>
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
  return r.indicacao + r.eventos + r.recovery + r.recomendacao + r.prospeccao;
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
      title="P16 — Mix Subcanais Outbound por Horizonte"
      badge={<SectionBadge>Premissa 16 · % de Leads</SectionBadge>}
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
              <Th help="Horizonte da unidade (H1–H5).">Horizonte</Th>
              <Th align="right" help="% dos leads outbound originados de indicações de clientes.">Indicação</Th>
              <Th align="right" help="% dos leads outbound originados de eventos próprios ou de mercado.">Eventos</Th>
              <Th align="right" help="% dos leads outbound originados de recuperação de clientes inativos.">Recovery</Th>
              <Th align="right" help="% dos leads outbound originados de recomendação ativa (parceiros).">Recomendação</Th>
              <Th align="right" help="% dos leads outbound originados de prospecção fria (cold calls/email).">Prospecção</Th>
              <Th align="right" help="Soma dos 5 subcanais — deve totalizar 100% por horizonte.">Total</Th>
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
                  {(["indicacao", "eventos", "recovery", "recomendacao", "prospeccao"] as const).map((key) => (
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
      className={`bg-table-header text-table-header-foreground h-8 font-medium px-2 py-1.5 text-[10px] uppercase tracking-wider ${alignClass}`}
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
