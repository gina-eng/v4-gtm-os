"use client";

import { useState } from "react";
import { ChevronDown, Filter, Calendar } from "lucide-react";
import { useSession } from "@/lib/auth/auth-context";
import { PremissasModeloTab } from "./tabs/premissas-modelo-tab";
import { ConversoesTab } from "./tabs/conversoes-tab";
import { usePersistBlock } from "./persist-block";
import type { PremissasBlocks } from "@/db/repositories/premissas";

type Tab = "premissas" | "conversoes";

const TABS: Array<{ id: Tab; label: string; sub: string }> = [
  { id: "premissas", label: "INVESTIMENTO, DISTRIBUIÇÃO DE TIERS & RECEITAS", sub: "Valores do modelo" },
  { id: "conversoes", label: "CONVERSÕES", sub: "CRs por canal" },
];

type CacContext = {
  investido: number;
  won: number;
  faturamento: number;
  unidades: number;
} | null;

type ClientProps = {
  cacContext: CacContext;
  blocks: PremissasBlocks;
};

export function PremissasClient({ cacContext, blocks }: ClientProps) {
  const session = useSession();
  const [tab, setTab] = useState<Tab>("premissas");
  const persistBlock = usePersistBlock();

  // Papel da tela segue o actingMode (matriz "impersonando" unidade vê como unidade):
  // - matriz: edita premissas-modelo e conversões
  // - unidade: modelo e conversões em só-leitura
  const actingAsMatriz = session.actingMode === "matriz";
  const canEditMatrizPremises = actingAsMatriz;

  // Filtro "Todas as Franquias" e Reset só fazem sentido na visão consolidada
  // da Matriz. Quando "impersonando" uma unidade, vira contexto único.
  const hasMultipleUnits =
    actingAsMatriz &&
    (session.isMatrizUser || session.availableOrganizations.length > 1);

  return (
    <>
      {/* ========== HEADER FILTROS (chips no topo direito) ========== */}
      <div className="flex items-center justify-end gap-2 mb-3 -mt-1">
        {hasMultipleUnits && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded border border-input bg-card text-xs hover:bg-muted"
          >
            <Filter className="h-3.5 w-3.5" />
            Todas as Franquias
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded border border-input bg-card text-xs hover:bg-muted"
        >
          <Calendar className="h-3.5 w-3.5" />
          Abril 2026
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>

      {/* ========== TÍTULO ========== */}
      <div className="mb-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Premissas do Modelo</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Ajuste os valores do modelo · O realizado da unidade vive em <em>Forecast</em>
            </p>
          </div>
          <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-success inline-block" />
            Auto-save ativo
          </div>
        </div>
      </div>

      {/* ========== TABS ========== */}
      <div className="flex items-end justify-between border-b border-border mb-4">
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
        {actingAsMatriz && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground pb-2 pr-1"
            title="Restaurar valores padrão da Matriz"
          >
            ⟳ Reset
          </button>
        )}
      </div>

      {/* ========== CONTEÚDO DA TAB ========== */}
      {tab === "premissas" && (
        <PremissasModeloTab
          canEdit={canEditMatrizPremises}
          horizonteAtual={actingAsMatriz ? null : session.activeOrganization?.horizonteAtual ?? null}
          cacContext={cacContext}
          blocks={blocks}
          persist={persistBlock}
        />
      )}
      {tab === "conversoes" && (
        <ConversoesTab canEdit={canEditMatrizPremises} blocks={blocks} persist={persistBlock} />
      )}
    </>
  );
}
