"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { HorizonteBadge } from "@/components/unidades/badges";
import type { UnidadeCard } from "./kanban-client";

export function AprovarHorizonteModal({
  card,
  onClose,
}: {
  card: UnidadeCard | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (card && !dialog.open) dialog.showModal();
    else if (!card && dialog.open) dialog.close();
  }, [card]);

  useEffect(() => {
    if (card) setError(null);
  }, [card]);

  if (!card || !card.horizonteSugerido) {
    return <dialog ref={dialogRef} className="hidden" />;
  }

  const promover = card.status === "promover";

  async function handleConfirm() {
    if (!card || !card.horizonteSugerido || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/organizations/${card.id}/horizonte`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horizonte: card.horizonteSugerido }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível aprovar a mudança.");
        return;
      }
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      className="rounded-lg p-0 backdrop:bg-black/50 max-w-md w-full bg-card text-card-foreground"
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {promover ? "Aprovar promoção" : "Aprovar rebaixamento"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium text-foreground">{card.name}</span>
            <span className="inline-flex items-center gap-2">
              <HorizonteBadge horizonte={card.horizonteAtual} />
              <span className="text-muted-foreground">→</span>
              <HorizonteBadge horizonte={card.horizonteSugerido} />
            </span>
          </div>

          <p className="text-sm text-muted-foreground">
            Confirmar muda o horizonte comprometido da unidade de{" "}
            <strong className="text-foreground">{card.horizonteAtual}</strong> para{" "}
            <strong className="text-foreground">{card.horizonteSugerido}</strong>. Isso recalcula o{" "}
            <strong className="text-foreground">projetado</strong> e a comparação com o{" "}
            <strong className="text-foreground">realizado</strong> dela, passando a usar as
            premissas do novo horizonte.
          </p>

          {error && (
            <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-9 px-4 rounded text-sm border border-border hover:bg-muted disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="h-9 px-4 rounded text-sm font-medium bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Aprovando…" : "Confirmar"}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
