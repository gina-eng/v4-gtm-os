/**
 * Repository de audit_log — registro de ações sensíveis.
 *
 * A tabela existe desde a F1.1 mas só passou a ser escrita com a aprovação de
 * mudança de horizonte (/validacao-crescimento). `changes` é jsonb livre — cada
 * caller define o shape do diff que faz sentido pra aquela ação.
 */

import { db } from "@/db";
import { auditLog, type NewAuditLog } from "@/db/schema";

export type WriteAuditLogInput = {
  actorUserId?: string | null;
  organizationId?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  changes?: unknown;
  ip?: string | null;
  userAgent?: string | null;
};

/** Insere uma linha de auditoria. Best-effort: não deve derrubar o fluxo principal. */
export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  const row: NewAuditLog = {
    actorUserId: input.actorUserId ?? null,
    organizationId: input.organizationId ?? null,
    action: input.action,
    entity: input.entity ?? null,
    entityId: input.entityId ?? null,
    changes: input.changes ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  };
  await db.insert(auditLog).values(row);
}
