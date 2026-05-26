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
import { FieldHelp } from "@/components/ui/field-help";

type FormState = {
  name: string;
  socioExecutivoNome: string;
  socioExecutivoEmail: string;
  regional: RegionalSigla | "";
  estado: string;
  cidade: string;
  telefone: string;
  horizonteAtual: Horizonte;
  dataInicio: string; // YYYY-MM-DD
  status: OrgStatus;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const statusLabel: Record<OrgStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
  pending: "Pendente",
};

function formFromUnit(u: Organization): FormState {
  return {
    name: u.name,
    socioExecutivoNome: u.socioExecutivoNome ?? "",
    socioExecutivoEmail: u.socioExecutivoEmail ?? "",
    regional: (u.regional as RegionalSigla | null) ?? "",
    estado: u.estado ?? "",
    cidade: u.cidade ?? "",
    telefone: u.telefone ?? "",
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
  const emailValid =
    form.socioExecutivoEmail.trim() === "" || emailRegex.test(form.socioExecutivoEmail.trim());
  const valid = nameValid && emailValid;

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
          socioExecutivoNome: form.socioExecutivoNome.trim() || null,
          socioExecutivoEmail: form.socioExecutivoEmail.trim() || null,
          regional: form.regional || null,
          estado: form.estado.trim() || null,
          cidade: form.cidade.trim() || null,
          telefone: form.telefone.trim() || null,
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
              <FieldHelp text="Nome público da franquia. Aparece em relatórios e no topo das telas." position="bottom" />
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
              <label htmlFor="e-socioNome" className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                Nome do Sócio Executivo
                <FieldHelp text="Pessoa responsável pela operação da unidade." position="bottom" />
              </label>
              <input
                id="e-socioNome"
                type="text"
                value={form.socioExecutivoNome}
                onChange={(e) => set("socioExecutivoNome", e.target.value)}
                maxLength={120}
                className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label htmlFor="e-socioEmail" className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                Email do Sócio Executivo
                <FieldHelp text="E-mail principal do sócio." position="bottom" />
              </label>
              <input
                id="e-socioEmail"
                type="email"
                value={form.socioExecutivoEmail}
                onChange={(e) => set("socioExecutivoEmail", e.target.value)}
                placeholder="socio@v4company.com"
                maxLength={255}
                className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {!emailValid && <p className="text-xs text-destructive mt-1">Email inválido.</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="e-regional" className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                Regional
                <FieldHelp text="Regional V4 a que a unidade pertence." position="bottom" />
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
                <FieldHelp text="Estado da unidade no sistema: ativo, inativo ou pendente." position="bottom" />
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
              <label htmlFor="e-estado" className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                Estado
                <FieldHelp text="UF onde a unidade opera (ex: SP, RJ, MG)." position="bottom" />
              </label>
              <input
                id="e-estado"
                type="text"
                value={form.estado}
                onChange={(e) => set("estado", e.target.value)}
                maxLength={60}
                className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="e-cidade" className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                Cidade
                <FieldHelp text="Cidade onde a unidade está sediada." position="bottom" />
              </label>
              <input
                id="e-cidade"
                type="text"
                value={form.cidade}
                onChange={(e) => set("cidade", e.target.value)}
                maxLength={120}
                className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="e-telefone" className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                Telefone
                <FieldHelp text="Telefone comercial principal da unidade." position="bottom" />
              </label>
              <input
                id="e-telefone"
                type="tel"
                value={form.telefone}
                onChange={(e) => set("telefone", e.target.value)}
                placeholder="(11) 99999-9999"
                maxLength={30}
                className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label htmlFor="e-dataInicio" className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                Data de início
                <FieldHelp text="Quando a unidade começou a operar oficialmente." position="bottom" />
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
                <FieldHelp text="Faixa de faturamento atual da unidade (H1 a H5)." position="bottom" />
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
