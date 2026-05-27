/**
 * Repository de users + memberships — F1.MOCK + F1.3
 *
 * Implementação Drizzle (Supabase). Substitui o mock in-memory.
 * As assinaturas públicas são idênticas ao mock para não quebrar callers.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  memberships,
  organizations,
  users,
  type Membership,
  type User,
} from "@/db/schema";

// ============================================================
// users
// ============================================================

export async function getUserById(id: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const needle = email.trim().toLowerCase();
  // Usa o idx_users_email_lower (LOWER(email) unique index).
  const [row] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${needle}`)
    .limit(1);
  return row ?? null;
}

export async function listUsers(filters?: {
  organizationId?: string;
  status?: User["status"];
}): Promise<User[]> {
  if (!filters?.organizationId) {
    const conds = filters?.status ? [eq(users.status, filters.status)] : [];
    return db
      .select()
      .from(users)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(users.name);
  }

  // Inclui users com membership direto na org E users com membership regional
  // que cobre essa org (regional do membership = regional da org).
  const [targetOrg] = await db
    .select({ id: organizations.id, regional: organizations.regional })
    .from(organizations)
    .where(eq(organizations.id, filters.organizationId))
    .limit(1);

  const directOrRegional = targetOrg?.regional
    ? sql`(${memberships.organizationId} = ${filters.organizationId} or ${memberships.regional} = ${targetOrg.regional})`
    : sql`${memberships.organizationId} = ${filters.organizationId}`;

  const userIdRows = await db
    .selectDistinct({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.status, "active"), directOrRegional));

  const ids = userIdRows.map((r) => r.userId);
  if (ids.length === 0) return [];

  const conds = [inArray(users.id, ids)];
  if (filters.status) conds.push(eq(users.status, filters.status));

  return db.select().from(users).where(and(...conds)).orderBy(users.name);
}

/**
 * Retorna IDs de organizations (type='unidade') que um membership regional cobre.
 * Inclui a Matriz quando regional='MATRIZ'.
 */
export async function listOrgIdsForRegional(regional: string): Promise<string[]> {
  const rows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.regional, regional));
  return rows.map((r) => r.id);
}

export async function updateUserLastLogin(id: string): Promise<void> {
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, id));
}

export async function updateUserActiveOrg(id: string, orgId: string | null): Promise<void> {
  await db
    .update(users)
    .set({ activeOrganizationId: orgId, updatedAt: new Date() })
    .where(eq(users.id, id));
}

/**
 * Define a senha inicial de um user. Só grava se `passwordHash IS NULL` —
 * a checagem é atômica (acontece no WHERE do UPDATE), evitando race onde
 * dois requests veem NULL e ambos gravam.
 *
 * Retorna o user atualizado, ou null se: user não existe, está inativo, ou
 * já tem senha definida (qualquer um dos casos cai no mesmo branch porque
 * o UPDATE não acha linha — front trata como "primeiro acesso indisponível").
 */
export async function setInitialPasswordHash(
  userId: string,
  passwordHash: string,
): Promise<User | null> {
  const [row] = await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.passwordHash)))
    .returning();
  return row ?? null;
}

// ============================================================
// memberships
// ============================================================

export async function listMembershipsByUser(userId: string): Promise<Membership[]> {
  return db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.status, "active")));
}

export async function listMembershipsByOrg(organizationId: string): Promise<Membership[]> {
  return db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.status, "active"),
      ),
    );
}

export async function getMembership(
  userId: string,
  organizationId: string,
): Promise<Membership | null> {
  const [row] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.organizationId, organizationId),
        eq(memberships.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getMembershipById(id: string): Promise<Membership | null> {
  const [row] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.id, id))
    .limit(1);
  return row ?? null;
}

// ============================================================
// Mutations
// ============================================================

export class UserConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserConflictError";
  }
}

export class MembershipConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MembershipConflictError";
  }
}

export class LastAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LastAdminError";
  }
}

export type InviteUserScope =
  | { scope: "unidade"; organizationId: string }
  | { scope: "regional"; regional: string };

/**
 * Cria user novo + membership de uma vez (fluxo de convite).
 * Em dev, user já nasce com `status='active'` (sem fluxo de ativação por email).
 */
export async function inviteUser(
  input: {
    email: string;
    name: string;
    role: Membership["role"];
  } & InviteUserScope,
): Promise<{ user: User; membership: Membership }> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);
    if (existing) {
      throw new UserConflictError(`Já existe um usuário com o e-mail ${input.email}.`);
    }

    // activeOrganizationId vai pra org só no escopo "unidade".
    // No regional, fica null — user escolhe org ativa entre as do escopo.
    const activeOrgId = input.scope === "unidade" ? input.organizationId : null;

    const [user] = await tx
      .insert(users)
      .values({
        email,
        name,
        passwordHash: null,
        status: "active",
        activeOrganizationId: activeOrgId,
      })
      .returning();

    const [membership] = await tx
      .insert(memberships)
      .values({
        userId: user!.id,
        organizationId: input.scope === "unidade" ? input.organizationId : null,
        regional: input.scope === "regional" ? input.regional : null,
        role: input.role,
        status: "active",
      })
      .returning();

    return { user: user!, membership: membership! };
  });
}

export async function updateUser(
  id: string,
  patch: { name?: string; status?: User["status"] },
): Promise<User | null> {
  const set: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.status !== undefined) set.status = patch.status;

  const [row] = await db.update(users).set(set).where(eq(users.id, id)).returning();
  return row ?? null;
}

/**
 * Hard delete: remove user + todos os memberships (ativos e inativos).
 * Operação irreversível — usar com confirmação na UI. Indicado pra users
 * criados por engano ou que nunca completaram o primeiro acesso.
 */
export async function deleteUser(id: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.delete(memberships).where(eq(memberships.userId, id));
    const deleted = await tx.delete(users).where(eq(users.id, id)).returning({ id: users.id });
    return deleted.length > 0;
  });
}

export async function createMembership(
  input: {
    userId: string;
    role: Membership["role"];
  } & InviteUserScope,
): Promise<Membership> {
  // Checa duplicidade no escopo correspondente, considerando apenas memberships
  // ATIVOS. Memberships revogados (status='inactive') ficam como histórico e
  // não bloqueiam recriar o vínculo no mesmo escopo.
  const dupCond =
    input.scope === "unidade"
      ? and(
          eq(memberships.userId, input.userId),
          eq(memberships.organizationId, input.organizationId),
          eq(memberships.status, "active"),
        )
      : and(
          eq(memberships.userId, input.userId),
          eq(memberships.regional, input.regional),
          eq(memberships.status, "active"),
        );

  const [dup] = await db.select({ id: memberships.id }).from(memberships).where(dupCond).limit(1);
  if (dup) {
    throw new MembershipConflictError(
      input.scope === "unidade"
        ? "Este usuário já tem vínculo com essa organização."
        : "Este usuário já tem vínculo com essa regional.",
    );
  }

  // O unique index (memberships_user_org_unique / _user_regional_unique) cobre
  // linhas de QUALQUER status. Se já existe um membership inativo no mesmo escopo
  // (vínculo revogado no histórico), um INSERT novo violaria a constraint. Então
  // reativamos a linha existente em vez de inserir uma duplicata.
  const staleCond =
    input.scope === "unidade"
      ? and(
          eq(memberships.userId, input.userId),
          eq(memberships.organizationId, input.organizationId),
          eq(memberships.status, "inactive"),
        )
      : and(
          eq(memberships.userId, input.userId),
          eq(memberships.regional, input.regional),
          eq(memberships.status, "inactive"),
        );

  const [stale] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(staleCond)
    .limit(1);
  if (stale) {
    const [reactivated] = await db
      .update(memberships)
      .set({ role: input.role, status: "active", updatedAt: new Date() })
      .where(eq(memberships.id, stale.id))
      .returning();
    return reactivated!;
  }

  const [m] = await db
    .insert(memberships)
    .values({
      userId: input.userId,
      organizationId: input.scope === "unidade" ? input.organizationId : null,
      regional: input.scope === "regional" ? input.regional : null,
      role: input.role,
      status: "active",
    })
    .returning();
  return m!;
}

/**
 * Lança LastAdminError se a mudança removeria o último admin ativo da org.
 * Memberships regionais não disputam "último admin da org" — são delegação
 * da Matriz e podem ser revogados livremente.
 */
async function assertNotLastAdmin(
  membershipId: string,
  newRole: Membership["role"] | "inactive",
): Promise<void> {
  const m = await getMembershipById(membershipId);
  if (!m || m.status !== "active" || m.role !== "admin") return;
  if (newRole === "admin") return;
  if (!m.organizationId) return; // regional

  const admins = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, m.organizationId),
        eq(memberships.status, "active"),
        eq(memberships.role, "admin"),
      ),
    );
  if (admins.length <= 1) {
    throw new LastAdminError(
      "Não é possível remover o papel do último Administrador desta organização.",
    );
  }
}

export async function updateMembership(
  id: string,
  patch: { role?: Membership["role"]; status?: Membership["status"] },
): Promise<Membership | null> {
  const current = await getMembershipById(id);
  if (!current) return null;

  if (patch.role && patch.role !== current.role) {
    await assertNotLastAdmin(id, patch.role);
  }
  if (patch.status === "inactive" && current.status === "active") {
    await assertNotLastAdmin(id, "inactive");
  }

  const set: Partial<typeof memberships.$inferInsert> = { updatedAt: new Date() };
  if (patch.role !== undefined) set.role = patch.role;
  if (patch.status !== undefined) set.status = patch.status;

  const [row] = await db
    .update(memberships)
    .set(set)
    .where(eq(memberships.id, id))
    .returning();
  return row ?? null;
}

export async function revokeMembership(id: string): Promise<Membership | null> {
  return updateMembership(id, { status: "inactive" });
}
