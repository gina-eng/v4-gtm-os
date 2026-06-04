"use client";

import { useMemo, useState } from "react";
import type { Horizonte } from "@/lib/premissas/matriz-defaults";
import { KanbanColumn } from "./kanban-column";
import { AprovarHorizonteModal } from "./aprovar-horizonte-modal";

export type StatusHorizonteCard = "estavel" | "promover" | "rebaixar";

export type UnidadeCard = {
  id: string;
  name: string;
  regional: string | null;
  horizonteAtual: Horizonte;
  status: StatusHorizonteCard;
  horizonteSugerido: Horizonte | null;
  mesesConsecutivos: number;
};

const HORIZONTES: Horizonte[] = ["H1", "H2", "H3", "H4", "H5"];

export function KanbanClient({ cards }: { cards: UnidadeCard[] }) {
  const [target, setTarget] = useState<UnidadeCard | null>(null);

  const byHorizonte = useMemo(() => {
    const acc: Record<Horizonte, UnidadeCard[]> = { H1: [], H2: [], H3: [], H4: [], H5: [] };
    for (const c of cards) acc[c.horizonteAtual].push(c);
    return acc;
  }, [cards]);

  const pendentes = cards.filter((c) => c.status !== "estavel").length;

  return (
    <>
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Validação de Crescimento</h1>
          <p className="text-sm text-muted-foreground">
            {pendentes === 0
              ? "Nenhuma unidade com mudança de horizonte pendente."
              : `${pendentes} unidade${pendentes === 1 ? "" : "s"} com mudança de horizonte pendente de aprovação.`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-start">
        {HORIZONTES.map((h) => (
          <KanbanColumn
            key={h}
            horizonte={h}
            cards={byHorizonte[h]}
            onAprovar={(card) => setTarget(card)}
          />
        ))}
      </div>

      <AprovarHorizonteModal card={target} onClose={() => setTarget(null)} />
    </>
  );
}
