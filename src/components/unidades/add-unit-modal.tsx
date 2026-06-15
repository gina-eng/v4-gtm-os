"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  HORIZONTES,
  REGIONAIS,
  type Horizonte,
  type RegionalSigla,
} from "@/lib/validations/organizations";

type FormState = {
  name: string;
  franqueado: string;
  cnpj: string;
  idTenant: string;
  regional: RegionalSigla | "";
  horizonteAtual: Horizonte;
  dataInicio: string; // YYYY-MM-DD
};

const initial: FormState = {
  name: "",
  franqueado: "",
  cnpj: "",
  idTenant: "",
  regional: "",
  horizonteAtual: "H1",
  dataInicio: "",
};

export function AddUnitModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<FormState>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      setForm(initial);
      setError(null);
    }
  }, [open]);

  const nameValid = form.name.trim().length >= 3 && form.name.trim().length <= 120;
  const valid = nameValid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          horizonteAtual: form.horizonteAtual,
          franqueado: form.franqueado.trim() || null,
          cnpj: form.cnpj.trim() || null,
          idTenant: form.idTenant.trim() || null,
          regional: form.regional || null,
          dataInicio: form.dataInicio || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível criar a unidade.");
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
      className="rounded-lg p-0 backdrop:bg-black/50 max-w-xl w-full bg-card text-card-foreground"
    >
      <form onSubmit={handleSubmit} className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Adicionar unidade</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="name" className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
              Nome da Unidade <span className="text-destructive">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Franquia SP 02"
              maxLength={120}
              className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            {!nameValid && form.name.length > 0 && (
              <p className="text-xs text-destructive mt-1">
                Nome deve ter entre 3 e 120 caracteres.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="franqueado"
                className="text-xs font-medium text-foreground mb-1 flex items-center gap-1"
              >
                Franqueado
              </label>
              <input
                id="franqueado"
                type="text"
                value={form.franqueado}
                onChange={(e) =>
                  setForm((f) => ({ ...f, franqueado: e.target.value }))
                }
                maxLength={120}
                className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label
                htmlFor="cnpj"
                className="text-xs font-medium text-foreground mb-1 flex items-center gap-1"
              >
                CNPJ
              </label>
              <input
                id="cnpj"
                type="text"
                value={form.cnpj}
                onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))}
                placeholder="00.000.000/0000-00"
                maxLength={18}
                className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="regional"
              className="text-xs font-medium text-foreground mb-1 flex items-center gap-1"
            >
              Regional
            </label>
            <select
              id="regional"
              value={form.regional}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  regional: e.target.value as RegionalSigla | "",
                }))
              }
              className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Selecione…</option>
              {REGIONAIS.map((r) => (
                <option key={r.sigla} value={r.sigla}>
                  {r.label} ({r.sigla})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="idTenant"
                className="text-xs font-medium text-foreground mb-1 flex items-center gap-1"
              >
                ID Tenant
              </label>
              <input
                id="idTenant"
                type="text"
                value={form.idTenant}
                onChange={(e) => setForm((f) => ({ ...f, idTenant: e.target.value }))}
                maxLength={120}
                className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label
                htmlFor="dataInicio"
                className="text-xs font-medium text-foreground mb-1 flex items-center gap-1"
              >
                Data de início da Unidade
              </label>
              <input
                id="dataInicio"
                type="date"
                value={form.dataInicio}
                onChange={(e) => setForm((f) => ({ ...f, dataInicio: e.target.value }))}
                className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="horizonte"
              className="text-xs font-medium text-foreground mb-1 flex items-center gap-1"
            >
              Horizonte
            </label>
            <select
              id="horizonte"
              value={form.horizonteAtual}
              onChange={(e) =>
                setForm((f) => ({ ...f, horizonteAtual: e.target.value as Horizonte }))
              }
              className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {HORIZONTES.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 h-9 rounded text-sm border border-border hover:bg-muted disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!valid || submitting}
            className="px-4 h-9 rounded text-sm bg-accent text-accent-foreground hover:opacity-90 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Adicionando…" : "Adicionar"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
