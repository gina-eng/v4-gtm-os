"use client";

import { Pencil, Check, X } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  /** Título em CAIXA-ALTA do header — ex.: "TIME COMERCIAL". */
  title: string;
  /** Badge cinza inline ao lado do título (ex.: "PREMISSA 02", "CALCULADO → CAC DINÂMICO"). */
  badge?: ReactNode;
  /** Se false, esconde o botão Editar (modo read-only para o papel atual). */
  canEdit: boolean;
  /** Estado de edição da seção, gerenciado pelo pai. */
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  children: ReactNode;
};

/**
 * Wrapper visual de seção da tela Premissas.
 *
 * Header padrão:
 * [■] TITULO [badge]                                    [Editar | Salvar/Cancelar]
 *
 * - Quando isEditing=true: borda destacada + botões Salvar/Cancelar
 * - Quando isEditing=false e canEdit=true: botão Editar
 * - Quando canEdit=false: sem botões (read-only — papel sem permissão)
 *
 * Padrão de persistência (definido com o cliente):
 * - 1 save por seção gera 1 entrada no audit_log (não 1 por célula)
 * - Cancelar descarta todos os edits da sessão atual sem log
 */
export function EditableSection({
  title,
  badge,
  canEdit,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  children,
}: Props) {
  return (
    <section
      className={`rounded border bg-card overflow-hidden mb-5 ${
        isEditing ? "border-accent/60 ring-1 ring-accent/20" : "border-border"
      }`}
    >
      <header className="flex items-center justify-between gap-3 px-4 h-12 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden
            className="inline-block w-0.5 h-3.5 bg-accent rounded-sm shrink-0"
          />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground truncate">
            {title}
          </h2>
          {badge}
        </div>

        {canEdit && (
          <div className="flex items-center gap-1.5 shrink-0">
            {!isEditing ? (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[11px] font-medium border border-border bg-card hover:bg-muted text-foreground"
              >
                <Pencil className="h-3 w-3" />
                Editar
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onCancel}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[11px] font-medium border border-border bg-card hover:bg-muted text-foreground"
                >
                  <X className="h-3 w-3" />
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[11px] font-medium bg-accent text-accent-foreground hover:opacity-90"
                >
                  <Check className="h-3 w-3" />
                  Salvar
                </button>
              </>
            )}
          </div>
        )}
      </header>

      <div>{children}</div>
    </section>
  );
}

/** Badge cinza pequeno usado nos headers de seção (ex.: "PREMISSA 02"). */
export function SectionBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded bg-muted text-muted-foreground px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider whitespace-nowrap">
      {children}
    </span>
  );
}
