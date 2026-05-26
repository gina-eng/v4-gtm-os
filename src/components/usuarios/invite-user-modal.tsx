"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, ShieldAlert } from "lucide-react";
import type { Organization } from "@/db/schema";
import { ALLOWED_EMAIL_DOMAIN } from "@/lib/validations/auth";
import {
  REGIONAIS,
  regionalLabel,
  type RegionalSigla,
} from "@/lib/validations/organizations";
import { ROLE_LABEL, ROLES, type Role } from "@/lib/validations/users";
import { FieldHelp } from "@/components/ui/field-help";

type Scope = "unidade" | "regional";

export type EditUserTarget = {
  userId: string;
  membershipId: string;
  email: string;
  name: string;
  role: Role;
  /** Texto exibido como organização/regional (imutável em edição). */
  scopeLabel: string;
};

type FormState = {
  email: string;
  name: string;
  scope: Scope;
  organizationId: string;
  regional: RegionalSigla | "";
  role: Role;
};

export function InviteUserModal({
  open,
  onClose,
  organizations,
  defaultOrganizationId,
  /** Se true, mostra o toggle Unidade/Regional (apenas Matriz pode dar acesso regional). */
  canInviteRegional,
  /** Quando informado, o modal entra em modo edição (mesmos campos, mas sem criar usuário). */
  target,
}: {
  open: boolean;
  onClose: () => void;
  /** Orgs em que o user atual pode convidar (já vem filtrado pelo server). */
  organizations: Organization[];
  defaultOrganizationId?: string;
  canInviteRegional: boolean;
  target?: EditUserTarget | null;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isEdit = !!target;
  const [form, setForm] = useState<FormState>({
    email: "",
    name: "",
    scope: "unidade",
    organizationId: defaultOrganizationId ?? organizations[0]?.id ?? "",
    regional: "",
    role: "coordenador",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lista de regionais disponíveis: derivada das orgs (apenas regionais que
  // têm pelo menos 1 unidade ativa, exceto a "MATRIZ" que não faz sentido aqui).
  const regionaisDisponiveis = useMemo(() => {
    const presentes = new Set(
      organizations
        .filter((o) => o.type === "unidade" && o.regional)
        .map((o) => o.regional as string),
    );
    return REGIONAIS.filter(
      (r) => r.sigla !== "MATRIZ" && r.sigla !== "SEM_PREENCHIMENTO" && presentes.has(r.sigla),
    );
  }, [organizations]);

  // Conta de unidades cobertas pela regional selecionada (UX feedback).
  const unidadesNaRegionalSelecionada = useMemo(() => {
    if (!form.regional) return 0;
    return organizations.filter(
      (o) => o.type === "unidade" && o.regional === form.regional,
    ).length;
  }, [form.regional, organizations]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (target) {
      setForm({
        email: target.email,
        name: target.name,
        scope: "unidade",
        organizationId: "",
        regional: "",
        role: target.role,
      });
    } else {
      setForm({
        email: "",
        name: "",
        scope: "unidade",
        organizationId: defaultOrganizationId ?? organizations[0]?.id ?? "",
        regional: "",
        role: "coordenador",
      });
    }
    setError(null);
  }, [open, target, defaultOrganizationId, organizations]);

  const emailValid =
    form.email.trim().length > 0 &&
    form.email.trim().toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
  const nameValid = form.name.trim().length >= 2;
  const scopeValid =
    form.scope === "unidade" ? !!form.organizationId : !!form.regional;

  const dirty = isEdit
    ? form.name.trim() !== target!.name || form.role !== target!.role
    : true;

  const valid = isEdit
    ? nameValid && dirty
    : emailValid && nameValid && scopeValid;

  async function handleInviteSubmit() {
    const payload =
      form.scope === "unidade"
        ? {
            scope: "unidade" as const,
            email: form.email,
            name: form.name,
            organizationId: form.organizationId,
            role: form.role,
          }
        : {
            scope: "regional" as const,
            email: form.email,
            name: form.name,
            regional: form.regional,
            role: form.role,
          };
    const res = await fetch("/api/users/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Não foi possível convidar o usuário.");
      return false;
    }
    return true;
  }

  async function handleEditSubmit() {
    const nameChanged = form.name.trim() !== target!.name;
    const roleChanged = form.role !== target!.role;

    if (nameChanged) {
      const res = await fetch(`/api/users/${target!.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível atualizar o nome.");
        return false;
      }
    }

    if (roleChanged) {
      const res = await fetch(`/api/memberships/${target!.membershipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: form.role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível atualizar o papel.");
        return false;
      }
    }

    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const ok = isEdit ? await handleEditSubmit() : await handleInviteSubmit();
      if (ok) {
        onClose();
        router.refresh();
      }
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
      <form onSubmit={handleSubmit} className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {isEdit ? "Editar usuário" : "Convidar usuário"}
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

        <div className="space-y-3">
          <div>
            <label htmlFor="invite-email" className="text-xs font-medium mb-1 flex items-center gap-1">
              E-mail <span className="text-destructive">*</span>
              <FieldHelp
                text={
                  isEdit
                    ? "E-mail do usuário. Identificador imutável — pra trocar, revogue o vínculo e convide novamente."
                    : `E-mail corporativo do convidado. Deve terminar em @${ALLOWED_EMAIL_DOMAIN} — usado pra login e notificações.`
                }
                position="bottom"
              />
            </label>
            <input
              id="invite-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder={`nome.sobrenome@${ALLOWED_EMAIL_DOMAIN}`}
              maxLength={255}
              required
              autoFocus={!isEdit}
              disabled={isEdit}
              className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
            />
            {!isEdit && form.email && !emailValid && (
              <p className="text-xs text-destructive mt-1">
                Use e-mail corporativo @{ALLOWED_EMAIL_DOMAIN}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="invite-name" className="text-xs font-medium mb-1 flex items-center gap-1">
              Nome <span className="text-destructive">*</span>
              <FieldHelp text="Nome completo da pessoa. Aparece na lista de usuários e em logs de auditoria." position="bottom" />
            </label>
            <input
              id="invite-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Maria Silva"
              maxLength={120}
              required
              autoFocus={isEdit}
              className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {isEdit ? (
            <div>
              <label className="text-xs font-medium mb-1 flex items-center gap-1">
                Organização
                <FieldHelp text="Escopo do vínculo. Imutável aqui — pra mover a pessoa, revogue o vínculo atual e crie um novo." position="bottom" />
              </label>
              <div className="w-full h-9 rounded border border-input bg-muted/40 px-3 text-sm flex items-center text-muted-foreground">
                {target!.scopeLabel}
              </div>
            </div>
          ) : (
            <>
              {canInviteRegional && (
                <div>
                  <label className="text-xs font-medium mb-1 flex items-center gap-1">
                    Tipo de acesso <span className="text-destructive">*</span>
                    <FieldHelp text="Por unidade = acesso a uma franquia específica. Por regional = acesso a todas as unidades daquela regional de uma vez." position="bottom" />
                  </label>
                  <div
                    role="tablist"
                    className="inline-flex rounded border border-input bg-background p-0.5 text-xs"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={form.scope === "unidade"}
                      onClick={() => setForm((f) => ({ ...f, scope: "unidade" }))}
                      className={`px-3 h-7 rounded ${
                        form.scope === "unidade"
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Por unidade
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={form.scope === "regional"}
                      onClick={() => setForm((f) => ({ ...f, scope: "regional" }))}
                      className={`px-3 h-7 rounded ${
                        form.scope === "regional"
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Por regional
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Regional = acesso a todas as unidades dessa regional de uma vez.
                  </p>
                </div>
              )}

              {form.scope === "unidade" ? (
                <div>
                  <label htmlFor="invite-org" className="text-xs font-medium mb-1 flex items-center gap-1">
                    Organização <span className="text-destructive">*</span>
                    <FieldHelp text="Unidade na qual a pessoa terá acesso. Você só vê as orgs em que pode convidar." position="bottom" />
                  </label>
                  <select
                    id="invite-org"
                    value={form.organizationId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, organizationId: e.target.value }))
                    }
                    disabled={organizations.length === 1}
                    className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                  >
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} {o.type === "matriz" ? "(Matriz)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label htmlFor="invite-regional" className="text-xs font-medium mb-1 flex items-center gap-1">
                    Regional <span className="text-destructive">*</span>
                    <FieldHelp text="Regional V4 a que a pessoa terá acesso. O vínculo cobre automaticamente todas as unidades da regional." position="bottom" />
                  </label>
                  <select
                    id="invite-regional"
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
                    {regionaisDisponiveis.map((r) => (
                      <option key={r.sigla} value={r.sigla}>
                        {r.sigla} — {r.label}
                      </option>
                    ))}
                  </select>
                  {form.regional && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Cobre {unidadesNaRegionalSelecionada}{" "}
                      {unidadesNaRegionalSelecionada === 1 ? "unidade" : "unidades"} —{" "}
                      {regionalLabel(form.regional)}
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          <div>
            <label htmlFor="invite-role" className="text-xs font-medium mb-1 flex items-center gap-1">
              Papel <span className="text-destructive">*</span>
              <FieldHelp text="Admin: gerencia usuários e estrutura. Gerente: convida e visualiza. Coordenador: só visualiza dados operacionais." position="bottom" />
            </label>
            <select
              id="invite-role"
              value={form.role}
              onChange={(e) =>
                setForm((f) => ({ ...f, role: e.target.value as Role }))
              }
              className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>

          {!isEdit && (
            <div className="rounded border border-border bg-muted/40 p-2 flex items-start gap-2">
              <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[11px] text-foreground/80 leading-snug">
                O usuário é criado já ativo, mas <strong>sem senha</strong>.
                Um admin precisa definir uma senha inicial e enviar ao usuário.
              </p>
            </div>
          )}

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
            {submitting
              ? isEdit
                ? "Salvando…"
                : "Convidando…"
              : isEdit
                ? "Salvar alterações"
                : "Adicionar usuário"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
