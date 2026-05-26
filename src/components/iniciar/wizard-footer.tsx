"use client";

import { ArrowLeft, ArrowRight, Check } from "lucide-react";

type Props = {
  onBack?: () => void;
  backLabel?: string;
  onContinue: () => void;
  continueLabel?: string;
  saving?: boolean;
  isLast?: boolean;
  error?: string | null;
};

export function WizardFooter({
  onBack,
  backLabel = "Voltar",
  onContinue,
  continueLabel,
  saving = false,
  isLast = false,
  error = null,
}: Props) {
  const label =
    continueLabel ?? (isLast ? "Salvar e finalizar" : "Salvar e continuar");

  return (
    <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
      <div className="text-xs text-destructive min-h-4">{error}</div>
      <div className="flex items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={saving}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded text-sm border border-border hover:bg-muted disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onContinue}
          disabled={saving}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded text-sm font-medium bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            "Salvando…"
          ) : (
            <>
              {label}
              {isLast ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
