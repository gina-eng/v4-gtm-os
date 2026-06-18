import { z } from "zod";
import { ALLOWED_EMAIL_DOMAIN } from "./auth";
import { REGIONAL_SIGLAS } from "./organizations";
import { uuidLike } from "./shared";

export const ROLES = ["admin", "gerente", "coordenador"] as const;
export const USER_STATUS = ["pending", "active", "inactive"] as const;
export const MEMBERSHIP_STATUS = ["active", "inactive"] as const;

export type Role = (typeof ROLES)[number];
export type UserStatus = (typeof USER_STATUS)[number];
export type MembershipStatus = (typeof MEMBERSHIP_STATUS)[number];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  coordenador: "Coordenador",
};

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
  pending: "Pendente",
};

const corporateEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email("E-mail inválido")
  .refine((v) => v.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`), {
    message: `Use e-mail corporativo @${ALLOWED_EMAIL_DOMAIN}`,
  });

export const roleSchema = z.enum(ROLES, { message: "Papel inválido" });
export const userStatusSchema = z.enum(USER_STATUS, { message: "Status inválido" });
export const membershipStatusSchema = z.enum(MEMBERSHIP_STATUS, {
  message: "Status de vínculo inválido",
});

// POST /api/users/invite — escopo do vínculo é "unidade" ou "regional"
const inviteBase = {
  email: corporateEmail,
  name: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres").max(120),
  role: roleSchema,
};

export const inviteUserSchema = z.discriminatedUnion("scope", [
  z.object({
    ...inviteBase,
    scope: z.literal("unidade"),
    organizationId: uuidLike,
  }),
  z.object({
    ...inviteBase,
    scope: z.literal("regional"),
    regional: z.enum(REGIONAL_SIGLAS, { message: "Regional inválida" }),
  }),
]);
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

// PATCH /api/users/[id]
export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    status: userStatusSchema.optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "Forneça ao menos um campo para atualizar",
  });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// POST /api/memberships — também aceita escopo unidade ou regional
export const createMembershipSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("unidade"),
    userId: uuidLike,
    organizationId: uuidLike,
    role: roleSchema,
  }),
  z.object({
    scope: z.literal("regional"),
    userId: uuidLike,
    regional: z.enum(REGIONAL_SIGLAS, { message: "Regional inválida" }),
    role: roleSchema,
  }),
]);
export type CreateMembershipInput = z.infer<typeof createMembershipSchema>;

// PATCH /api/memberships/[id]
export const updateMembershipSchema = z
  .object({
    role: roleSchema.optional(),
    status: membershipStatusSchema.optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "Forneça ao menos um campo para atualizar",
  });
export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;

// Query params GET /api/users
export const listUsersQuerySchema = z.object({
  organizationId: uuidLike.optional(),
  status: userStatusSchema.optional(),
  role: roleSchema.optional(),
  search: z.string().trim().optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

// PATCH /api/auth/active-organization — escopo do seletor global (4 modos).
// 'geral'/'todas_unidades'/'matriz_propria' = visões de rede (só matriz-user; a
// AUTORIZAÇÃO é checada no route, não aqui — Zod valida só a forma).
export const updateActiveOrgSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("geral") }),
  z.object({ scope: z.literal("todas_unidades") }),
  z.object({ scope: z.literal("matriz_propria") }),
  z.object({ scope: z.literal("unidade"), organizationId: uuidLike }),
]);
export type UpdateActiveOrgInput = z.infer<typeof updateActiveOrgSchema>;
