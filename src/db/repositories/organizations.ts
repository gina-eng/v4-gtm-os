/**
 * Repository de organizations — F1.1
 *
 * Implementação Drizzle (Supabase). Substitui o mock in-memory original.
 * As assinaturas públicas são idênticas ao mock para os callers (API routes
 * e Server Components) não precisarem mudar.
 */

import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { organizations, type Organization } from "@/db/schema";
import {
  generateSlug,
  type CreateOrganizationInput,
  type ListOrganizationsQuery,
  type UpdateOrganizationInput,
} from "@/lib/validations/organizations";

export async function listOrganizations(
  query: ListOrganizationsQuery = {},
): Promise<Organization[]> {
  const filters = [];
  if (query.type) filters.push(eq(organizations.type, query.type));
  if (query.status) filters.push(eq(organizations.status, query.status));
  if (query.horizonte) filters.push(eq(organizations.horizonteAtual, query.horizonte));
  if (query.search) {
    const needle = `%${query.search}%`;
    filters.push(or(ilike(organizations.name, needle), ilike(organizations.slug, needle))!);
  }

  // Ordenação: Matriz primeiro (CASE), depois unidades por nome com collation pt-BR.
  return db
    .select()
    .from(organizations)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(
      sql`case when ${organizations.type} = 'matriz' then 0 else 1 end`,
      organizations.name,
    );
}

export async function getOrganizationById(id: string): Promise<Organization | null> {
  const [row] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Batch: várias orgs em uma única query. Retorna um Map id → Organization
 * pra lookup O(1) em telas que enriquecem listagens (ex: /usuarios).
 */
export async function getOrganizationsByIds(
  ids: string[],
): Promise<Map<string, Organization>> {
  const result = new Map<string, Organization>();
  if (ids.length === 0) return result;
  const rows = await db.select().from(organizations).where(inArray(organizations.id, ids));
  for (const r of rows) result.set(r.id, r);
  return result;
}

export async function getOrganizationBySlug(slug: string): Promise<Organization | null> {
  const [row] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  return row ?? null;
}

export class OrganizationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationConflictError";
  }
}

export async function createOrganization(input: CreateOrganizationInput): Promise<Organization> {
  const slug = input.slug ?? generateSlug(input.name);

  const [dup] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (dup) {
    throw new OrganizationConflictError(`Já existe uma organização com o slug "${slug}".`);
  }

  const [matriz] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.type, "matriz"))
    .limit(1);
  if (!matriz) {
    throw new Error("Matriz não encontrada — seed inicial não rodou.");
  }

  const [org] = await db
    .insert(organizations)
    .values({
      type: "unidade",
      parentId: matriz.id,
      slug,
      name: input.name,
      status: "active",
      horizonteAtual: input.horizonteAtual,
      idTenant: input.idTenant ?? null,
      cnpj: input.cnpj ?? null,
      franqueado: input.franqueado ?? null,
      regional: input.regional ?? null,
      dataInicio: input.dataInicio ?? null,
    })
    .returning();
  return org!;
}

export async function updateOrganization(
  id: string,
  input: UpdateOrganizationInput,
): Promise<Organization | null> {
  // Monta o patch só com campos explicitamente fornecidos (undefined ≠ null).
  const patch: Partial<typeof organizations.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.status !== undefined) patch.status = input.status;
  if (input.horizonteAtual !== undefined) patch.horizonteAtual = input.horizonteAtual;
  if (input.idTenant !== undefined) patch.idTenant = input.idTenant;
  if (input.cnpj !== undefined) patch.cnpj = input.cnpj;
  if (input.franqueado !== undefined) patch.franqueado = input.franqueado;
  if (input.regional !== undefined) patch.regional = input.regional;
  if (input.dataInicio !== undefined) patch.dataInicio = input.dataInicio;

  const [row] = await db
    .update(organizations)
    .set(patch)
    .where(eq(organizations.id, id))
    .returning();
  return row ?? null;
}
