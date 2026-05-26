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
};

const initial: FormState = {
  name: "",
  socioExecutivoNome: "",
  socioExecutivoEmail: "",
  regional: "",
  estado: "",
  cidade: "",
  telefone: "",
  horizonteAtual: "H1",
  dataInicio: "",
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const emailValid =
    form.socioExecutivoEmail.trim() === "" ||
    emailRegex.test(form.socioExecutivoEmail.trim());
  const valid = nameValid && emailValid;

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
              <FieldHelp text="Nome público da franquia (ex: Franquia SP 02). Aparece em relatórios e no topo das telas." position="bottom" />
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
                htmlFor="socioNome"
                className="text-xs font-medium text-foreground mb-1 flex items-center gap-1"
              >
                Nome do Sócio Executivo
                <FieldHelp text="Pessoa responsável pela operação da unidade — principal ponto de contato com a Matriz." position="bottom" />
              </label>
              <input
                id="socioNome"
                type="text"
                value={form.socioExecutivoNome}
                onChange={(e) =>
                  setForm((f) => ({ ...f, socioExecutivoNome: e.target.value }))
                }
                maxLength={120}
                className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label
                htmlFor="socioEmail"
                className="text-xs font-medium text-foreground mb-1 flex items-center gap-1"
              >
                Email do Sócio Executivo
                <FieldHelp text="E-mail principal do sócio. Usado em notificações, convites de acesso e relatórios automatizados." position="bottom" />
              </label>
              <input
                id="socioEmail"
                type="email"
                value={form.socioExecutivoEmail}
                onChange={(e) =>
                  setForm((f) => ({ ...f, socioExecutivoEmail: e.target.value }))
                }
                placeholder="socio@v4company.com"
                maxLength={255}
                className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {!emailValid && (
                <p className="text-xs text-destructive mt-1">Email inválido.</p>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="regional"
              className="text-xs font-medium text-foreground mb-1 flex items-center gap-1"
            >
              Regional
              <FieldHelp text="Regional V4 a que a unidade pertence — define qual gerente regional acompanha a operação." position="bottom" />
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="estado"
                className="text-xs font-medium text-foreground mb-1 flex items-center gap-1"
              >
                Estado
                <FieldHelp text="UF onde a unidade opera (ex: SP, RJ, MG)." position="bottom" />
              </label>
              <input
                id="estado"
                type="text"
                value={form.estado}
                onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))}
                placeholder="Ex: SP"
                maxLength={60}
                className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="cidade"
                className="text-xs font-medium text-foreground mb-1 flex items-center gap-1"
              >
                Cidade
                <FieldHelp text="Cidade onde a unidade está sediada." position="bottom" />
              </label>
              <input
                id="cidade"
                type="text"
                value={form.cidade}
                onChange={(e) => setForm((f) => ({ ...f, cidade: e.target.value }))}
                placeholder="Ex: São Paulo"
                maxLength={120}
                className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="telefone"
                className="text-xs font-medium text-foreground mb-1 flex items-center gap-1"
              >
                Telefone
                <FieldHelp text="Telefone comercial principal da unidade. Aceita formatos com DDD e máscara." position="bottom" />
              </label>
              <input
                id="telefone"
                type="tel"
                value={form.telefone}
                onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
                placeholder="(11) 99999-9999"
                maxLength={30}
                className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label
                htmlFor="dataInicio"
                className="text-xs font-medium text-foreground mb-1 flex items-center gap-1"
              >
                Data de início da Unidade
                <FieldHelp text="Quando a unidade começou a operar oficialmente. Usado pra calcular tempo de casa em análises." position="bottom" />
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
              <FieldHelp text="Faixa de faturamento atual da unidade (H1 a H5). Define metas, mix de produtos e estratégia de mídia." position="bottom" />
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
