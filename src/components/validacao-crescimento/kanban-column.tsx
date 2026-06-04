import type { Horizonte } from "@/lib/premissas/matriz-defaults";
import type { UnidadeCard as UnidadeCardType } from "./kanban-client";
import { UnidadeCard } from "./unidade-card";

const HORIZONTE_LABEL: Record<Horizonte, string> = {
  H1: "Horizonte 1",
  H2: "Horizonte 2",
  H3: "Horizonte 3",
  H4: "Horizonte 4",
  H5: "Horizonte 5",
};

export function KanbanColumn({
  horizonte,
  cards,
  onAprovar,
}: {
  horizonte: Horizonte;
  cards: UnidadeCardType[];
  onAprovar: (card: UnidadeCardType) => void;
}) {
  return (
    <div className="rounded border border-border bg-muted/20 flex flex-col min-h-[8rem]">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-table-header text-table-header-foreground rounded-t">
        <span className="text-[11px] font-semibold uppercase tracking-wider">
          {HORIZONTE_LABEL[horizonte]}
        </span>
        <span className="text-[11px] tabular-nums opacity-80">{cards.length}</span>
      </div>

      <div className="flex flex-col gap-2 p-2">
        {cards.length === 0 ? (
          <p className="text-xs text-muted-foreground px-1 py-2">Nenhuma unidade.</p>
        ) : (
          cards.map((card) => (
            <UnidadeCard key={card.id} card={card} onAprovar={() => onAprovar(card)} />
          ))
        )}
      </div>
    </div>
  );
}
