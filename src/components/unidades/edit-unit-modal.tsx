"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { Organization } from "@/db/schema";
import {
  HORIZONTES,
  ORG_STATUS,
  REGIONAIS,
  type Horizonte,
  type OrgStatus,
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
  status: OrgStatus;
};

const statusLabel: Record<OrgStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
  pending: "Pendente",
};

function formFromUnit(u: Organization): FormState {
  return {
    name: u.name,
    franqueado: u.franqueado ?? "",
    cnpj: u.cnpj ?? "",
    idTenant: u.idTenant ?? "",
    regional: (u.regional as RegionalSigla | null) ?? "",
    horizonteAtual: u.horizonteAtual,
    dataInicio: u.dataInicio ?? "",
    status: u.status,
  };
}

/**
 * Edita uma unidade já criada via PATCH /api/organizations/[id]. Mesmos campos
 * do cadastro + status. `unit !== null` abre o modal.
 */
export function EditUnitModal({
  unit,
  onClose,
}: {
  unit: Organization | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (unit && !dialog.open) dialog.showModal();
    else if (!unit && dialog.open) dialog.close();
  }, [unit]);

  useEffect(() => {
    if (unit) {
      setForm(formFromUnit(unit));
      setError(null);
    }
  }, [unit]);

  if (!unit || !form) {
    // dialog precisa existir no DOM pra showModal/close funcionar
    return <dialog ref={dialogRef} className="hidden" />;
  }

  const nameValid = form.name.trim().length >= 3 && form.name.trim().length <= 120;
  const valid = nameValid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !unit || !valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/organizations/${unit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          status: form.status,
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
        setError(body.error ?? "Não foi possível salvar a unidade.");
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

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

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
          <h2 className="text-lg font-semibold">Editar unidade</h2>
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
            <label htmlFor="e-name" className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
              Nome da Unidade <span className="text-destructive">*</span>
            </label>
            <input
              id="e-name"
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              maxLength={120}
              className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            {!nameValid && form.name.length > 0 && (
              <p className="text-xs text-destructive mt-1">Nome deve ter entre 3 e 120 caracteres.</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="e-franqueado" className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                Franqueado
              </label>
              <input
                id="e-franqueado"
                type="text"
                value={form.franqueado}
                onChange={(e) => set("franqueado", e.target.value)}
                maxLength={120}
                className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label htmlFor="e-cnpj" className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                CNPJ
              </label>
              <input
                id="e-cnpj"
                type="text"
                value={form.cnpj}
                onChange={(e) => set("cnpj", e.target.value)}
                placeholder="00.000.000/0000-00"
                maxLength={18}
                className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="e-regional" className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                Regional
              </label>
              <select
                id="e-regional"
                value={form.regional}
                onChange={(e) => set("regional", e.target.value as RegionalSigla | "")}
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
            <div>
              <label htmlFor="e-status" className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                Status
              </label>
              <select
                id="e-status"
                value={form.status}
                onChange={(e) => set("status", e.target.value as OrgStatus)}
                className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {ORG_STATUS.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="e-idTenant" className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                ID Tenant
              </label>
              <input
                id="e-idTenant"
                type="text"
                value={form.idTenant}
                onChange={(e) => set("idTenant", e.target.value)}
                maxLength={120}
                className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label htmlFor="e-dataInicio" className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                Data de início
              </label>
              <input
                id="e-dataInicio"
                type="date"
                value={form.dataInicio}
                onChange={(e) => set("dataInicio", e.target.value)}
                className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label htmlFor="e-horizonte" className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                Horizonte
              </label>
              <select
                id="e-horizonte"
                value={form.horizonteAtual}
                onChange={(e) => set("horizonteAtual", e.target.value as Horizonte)}
                className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {HORIZONTES.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
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
            {submitting ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
