"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Pencil, Plus, Search, UserX } from "lucide-react";
import type { Membership, Organization, User } from "@/db/schema";
import { PermissionGate } from "@/components/permission-gate";
import { useSession } from "@/lib/auth/auth-context";
import {
  ROLE_LABEL,
  ROLES,
  USER_STATUS,
  type Role,
  type UserStatus,
} from "@/lib/validations/users";
import { regionalLabel } from "@/lib/validations/organizations";
import { RoleBadge, UserStatusBadge } from "./badges";
import { InviteUserModal, type EditUserTarget } from "./invite-user-modal";

type EnrichedMembership = Membership & {
  organization: Organization;
  regionalUnits: Organization[] | null;
};

type UserRow = User & {
  memberships: EnrichedMembership[];
};

export function UsuariosClient({
  initialUsers,
  organizationsForInvite,
  defaultOrganizationId,
}: {
  initialUsers: UserRow[];
  organizationsForInvite: Organization[];
  defaultOrganizationId?: string;
}) {
  const session = useSession();
  const router = useRouter();
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [statusFilter, setStatusFilter] = useState<UserStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EditUserTarget | null>(null);
  const [deactivating, setDeactivating] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return initialUsers.filter((u) => {
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (roleFilter !== "all") {
        if (!u.memberships.some((m) => m.role === roleFilter)) return false;
      }
      if (search.trim()) {
        const needle = search.trim().toLowerCase();
        if (
          !u.name.toLowerCase().includes(needle) &&
          !u.email.toLowerCase().includes(needle)
        )
          return false;
      }
      return true;
    });
  }, [initialUsers, roleFilter, statusFilter, search]);

  async function handleDeactivate(membershipId: string, userName: string) {
    if (!confirm(`Desativar o vínculo de ${userName}?`)) return;
    setDeactivating(membershipId);
    try {
      const res = await fetch(`/api/memberships/${membershipId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error ?? "Não foi possível desativar o vínculo.");
        return;
      }
      router.refresh();
    } finally {
      setDeactivating(null);
    }
  }

  const isEmpty = initialUsers.length === 0;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-4">
        <h1 className="text-xl font-semibold text-foreground">Gestão de usuários</h1>
        <PermissionGate action="user.invite">
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="inline-flex items-center gap-2 px-4 h-9 rounded text-sm font-medium bg-accent text-accent-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Convidar usuário
          </button>
        </PermissionGate>
      </div>

      {/* Contexto da org ativa (visual) — segue o actingMode, não só o tipo do user */}
      {session.actingMode === "matriz" ? (
        <div className="text-xs text-muted-foreground mb-3">
          Visualizando{" "}
          <span className="font-medium text-foreground">
            todos os usuários cadastrados
          </span>
          {" "}— acesso completo da Matriz.
        </div>
      ) : (
        session.activeOrganization && (
          <div className="text-xs text-muted-foreground mb-3">
            Visualizando usuários de{" "}
            <span className="font-medium text-foreground">
              {session.activeOrganization.name}
            </span>
          </div>
        )
      )}

      {/* Filtros */}
      {!isEmpty && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-xs font-medium text-muted-foreground mr-1">Filtrar:</span>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as Role | "all")}
            className="h-8 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Todos papéis</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as UserStatus | "all")}
            className="h-8 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Todos status</option>
            {USER_STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por nome ou e-mail…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-64 rounded border border-input bg-background pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="ml-auto text-xs text-muted-foreground tabular-nums">
            {filtered.length} de {initialUsers.length}
          </div>
        </div>
      )}

      {/* Conteúdo */}
      {isEmpty ? (
        <EmptyState onInvite={() => setInviteOpen(true)} />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center bg-card border border-border rounded">
          <p className="text-sm text-muted-foreground">
            Nenhum usuário encontrado com os filtros aplicados.
          </p>
        </div>
      ) : (
        <UsersTable
          users={filtered}
          onEditRole={setEditTarget}
          onDeactivate={handleDeactivate}
          deactivating={deactivating}
        />
      )}

      <InviteUserModal
        open={inviteOpen || editTarget !== null}
        onClose={() => {
          setInviteOpen(false);
          setEditTarget(null);
        }}
        organizations={organizationsForInvite}
        defaultOrganizationId={defaultOrganizationId}
        canInviteRegional={session.actingMode === "matriz" && session.isMatrizUser}
        target={editTarget}
      />
    </>
  );
}

function UsersTable({
  users,
  onEditRole,
  onDeactivate,
  deactivating,
}: {
  users: UserRow[];
  onEditRole: (t: EditUserTarget) => void;
  onDeactivate: (membershipId: string, userName: string) => void;
  deactivating: string | null;
}) {
  return (
    <div className="rounded border border-border overflow-auto">
      <table className="w-full caption-bottom text-sm">
        <thead className="sticky top-0 z-30 shadow-[0_2px_4px_-2px_rgba(0,0,0,0.1)]">
          <tr className="border-b">
            <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-3 py-1.5 text-[10px] uppercase tracking-wider">
              Usuário
            </th>
            <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-3 py-1.5 text-[10px] uppercase tracking-wider">
              Organização
            </th>
            <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-3 py-1.5 text-[10px] uppercase tracking-wider">
              Papel
            </th>
            <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-3 py-1.5 text-[10px] uppercase tracking-wider">
              Status
            </th>
            <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-3 py-1.5 text-[10px] uppercase tracking-wider">
              Último acesso
            </th>
            <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-3 py-1.5 text-[10px] uppercase tracking-wider w-12">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {users.flatMap((u, idx) => {
            // Cada membership vira uma linha (multi-vínculo aparece 2x)
            const rows = u.memberships.length > 0 ? u.memberships : [null];
            return rows.map((m, mIdx) => {
              const rowIdx = idx + mIdx;
              return (
                <tr
                  key={`${u.id}:${m?.id ?? "no-m"}`}
                  className={`${rowIdx % 2 === 0 ? "bg-card" : "bg-muted/30"} border-b hover:bg-muted transition-colors`}
                >
                  <td className="px-3 py-1.5 text-xs">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-muted-foreground font-mono text-[10px] flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {u.email}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-xs">
                    {m ? (
                      m.regional ? (
                        <>
                          <span className="font-medium">Regional {m.regional}</span>
                          <span className="block text-[10px] text-muted-foreground">
                            {regionalLabel(m.regional)}
                          </span>
                          <span className="mt-0.5 inline-flex items-center rounded-full bg-info/15 text-info px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider">
                            Acesso regional
                          </span>
                        </>
                      ) : (
                        <>
                          {m.organization.name}
                          {m.organization.type === "matriz" && (
                            <span className="ml-1 inline-flex items-center rounded-full bg-accent text-accent-foreground px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider">
                              Matriz
                            </span>
                          )}
                        </>
                      )
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-xs">
                    {m ? <RoleBadge role={m.role} /> : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-xs">
                    <UserStatusBadge status={u.status} />
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">
                    {u.lastLoginAt
                      ? new Date(u.lastLoginAt).toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-right">
                    {m && (
                      <div className="inline-flex items-center gap-1">
                        <PermissionGate action="membership.update" organizationId={m.organizationId ?? undefined}>
                          <button
                            type="button"
                            onClick={() =>
                              onEditRole({
                                userId: u.id,
                                membershipId: m.id,
                                email: u.email,
                                name: u.name,
                                role: m.role,
                                scopeLabel: m.regional
                                  ? `Regional ${m.regional} — ${regionalLabel(m.regional)}`
                                  : m.organization.name,
                              })
                            }
                            className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                            title="Editar usuário"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </PermissionGate>
                        <PermissionGate action="membership.revoke" organizationId={m.organizationId ?? undefined}>
                          <button
                            type="button"
                            onClick={() => onDeactivate(m.id, u.name)}
                            disabled={deactivating === m.id}
                            className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-muted text-muted-foreground hover:text-destructive disabled:opacity-50"
                            title="Revogar vínculo"
                          >
                            <UserX className="h-3.5 w-3.5" />
                          </button>
                        </PermissionGate>
                      </div>
                    )}
                  </td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ onInvite }: { onInvite: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center bg-card border border-border rounded">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
        <Plus className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-medium text-foreground mb-1">
        Nenhum usuário cadastrado nesta organização
      </h3>
      <p className="text-xs text-muted-foreground mb-4 max-w-xs">
        Convide o primeiro usuário para começar a operar.
      </p>
      <PermissionGate action="user.invite">
        <button
          type="button"
          onClick={onInvite}
          className="inline-flex items-center gap-2 px-4 h-9 rounded text-sm font-medium bg-accent text-accent-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Convidar primeiro usuário
        </button>
      </PermissionGate>
    </div>
  );
}

