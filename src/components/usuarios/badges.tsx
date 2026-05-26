import type { Role, UserStatus } from "@/lib/validations/users";
import { ROLE_LABEL, USER_STATUS_LABEL } from "@/lib/validations/users";

const roleColors: Record<Role, string> = {
  admin: "bg-accent/15 text-accent border-accent/30",
  gerente: "bg-sky-100 text-sky-900 border-sky-200",
  coordenador: "bg-muted text-muted-foreground border-border",
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${roleColors[role]}`}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}

const statusColors: Record<UserStatus, string> = {
  active: "bg-success/15 text-success border-success/30",
  inactive: "bg-muted text-muted-foreground border-border",
  pending: "bg-warning/15 text-warning-foreground border-warning/40",
};

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusColors[status]}`}
    >
      {USER_STATUS_LABEL[status]}
    </span>
  );
}
