import { TrendingDown, TrendingUp } from "lucide-react";
import { HorizonteBadge } from "@/components/unidades/badges";
import type { UnidadeCard as UnidadeCardType } from "./kanban-client";

export function UnidadeCard({
  card,
  onAprovar,
}: {
  card: UnidadeCardType;
  onAprovar: () => void;
}) {
  const promover = card.status === "promover";
  const rebaixar = card.status === "rebaixar";
  const alerta = promover || rebaixar;

  return (
    <div className="rounded border border-border bg-card p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-foreground leading-tight">{card.name}</span>
        <HorizonteBadge horizonte={card.horizonteAtual} />
      </div>
      {card.regional && (
        <span className="text-[11px] text-muted-foreground -mt-1">{card.regional}</span>
      )}

      {alerta && card.horizonteSugerido && (
        <div className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1.5 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-destructive">
            {promover ? (
              <TrendingUp className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>
              {promover ? "Deveria migrar" : "Deveria recuar"} {card.horizonteAtual} →{" "}
              {card.horizonteSugerido}
            </span>
          </div>
          {card.mesesConsecutivos > 0 && (
            <span className="text-[10px] text-destructive/80">
              {card.mesesConsecutivos} {card.mesesConsecutivos === 1 ? "mês" : "meses"}{" "}
              {promover ? "acima do teto" : "abaixo do piso"}
            </span>
          )}
          <button
            type="button"
            onClick={onAprovar}
            className="self-start mt-0.5 inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[11px] font-medium bg-accent text-accent-foreground hover:opacity-90"
          >
            Aprovar mudança
          </button>
        </div>
      )}
    </div>
  );
}
