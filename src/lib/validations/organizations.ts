import { z } from "zod";

/**
 * Schemas de validação para inputs da API de organizations.
 * Usado tanto no client (formulários) quanto no server (API routes).
 */

export const HORIZONTES = ["H1", "H2", "H3", "H4", "H5"] as const;
export const ORG_STATUS = ["active", "inactive", "pending"] as const;
export const ORG_TYPES = ["matriz", "unidade"] as const;

export type Horizonte = (typeof HORIZONTES)[number];
export type OrgStatus = (typeof ORG_STATUS)[number];
export type OrgType = (typeof ORG_TYPES)[number];

/**
 * Regionais V4 — sigla é o valor armazenado, label é o gerente regional responsável.
 * "Sem preenchimento" cobre unidades sem regional definida ainda.
 */
export const REGIONAIS = [
  { sigla: "RS", label: "Alex Peretto" },
  { sigla: "MG3", label: "Bruno Alves Aguiar" },
  { sigla: "RJ", label: "Bruno Barros Alfradique da Silva" },
  { sigla: "SP1", label: "Danilo Ferreira de Camargo" },
  { sigla: "MG2", label: "Eduardo Lisboa" },
  { sigla: "MG1", label: "Felipe Saman" },
  { sigla: "NE", label: "Gustavo Telles de Souza Pessoa" },
  { sigla: "SP2", label: "Joandre Leal Ferraz" },
  { sigla: "SC", label: "Júnior Kloh" },
  { sigla: "PR", label: "Kelvin Kuri de Oliveira" },
  { sigla: "SP3", label: "Lucas Alves Bilinski" },
  { sigla: "MATRIZ", label: "Matriz" },
  { sigla: "NUNES", label: "Raphael Andre Soares Nunes" },
  { sigla: "COLLI", label: "Vinicius Colli" },
  { sigla: "SEM_PREENCHIMENTO", label: "Sem preenchimento" },
] as const;

export const REGIONAL_SIGLAS = [
  "RS",
  "MG3",
  "RJ",
  "SP1",
  "MG2",
  "MG1",
  "NE",
  "SP2",
  "SC",
  "PR",
  "SP3",
  "MATRIZ",
  "NUNES",
  "COLLI",
  "SEM_PREENCHIMENTO",
] as const;

export type RegionalSigla = (typeof REGIONAL_SIGLAS)[number];

export function regionalLabel(sigla: string | null | undefined): string {
  if (!sigla) return "—";
  const found = REGIONAIS.find((r) => r.sigla === sigla);
  return found?.label ?? sigla;
}

// Slug: kebab-case alfanumérico (sem acentos, sem espaços)
const slugRegex = /^[a-z0-9-]+$/;
const slugSchema = z
  .string()
  .min(1, "Slug não pode ser vazio")
  .max(60, "Slug excede 60 caracteres")
  .regex(slugRegex, "Slug deve conter apenas letras minúsculas, números e hífens");

export const nameSchema = z
  .string()
  .trim()
  .min(3, "Nome deve ter ao menos 3 caracteres")
  .max(120, "Nome excede 120 caracteres");

export const horizonteSchema = z.enum(HORIZONTES, {
  message: "Horizonte deve ser H1, H2, H3, H4 ou H5",
});

export const orgStatusSchema = z.enum(ORG_STATUS, {
  message: "Status inválido",
});

// Campos opcionais comuns ao create/update — vazio vira null.
const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const optionalRegional = z
  .enum(REGIONAL_SIGLAS)
  .nullable()
  .optional();

// YYYY-MM-DD (input type="date" devolve nesse formato).
const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .refine((v) => v == null || /^\d{4}-\d{2}-\d{2}$/.test(v), {
    message: "Data deve estar no formato AAAA-MM-DD",
  });

// POST /api/organizations — cria uma Unidade (Matriz vem só via seed)
export const createOrganizationSchema = z.object({
  name: nameSchema,
  slug: slugSchema.optional(),
  horizonteAtual: horizonteSchema.default("H1"),
  idTenant: optionalTrimmed(120),
  cnpj: optionalTrimmed(18),
  franqueado: optionalTrimmed(120),
  regional: optionalRegional,
  dataInicio: optionalDate,
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

// PATCH /api/organizations/:id
// Atenção: o plano diz que `horizonte_atual` só pode mudar via fluxo de aprovação (Fase 3).
// Aqui aceitamos o campo, mas a regra de negócio (em quem pode mudar) fica na API route.
export const updateOrganizationSchema = z
  .object({
    name: nameSchema.optional(),
    status: orgStatusSchema.optional(),
    horizonteAtual: horizonteSchema.optional(),
    idTenant: optionalTrimmed(120),
    cnpj: optionalTrimmed(18),
    franqueado: optionalTrimmed(120),
    regional: optionalRegional,
    dataInicio: optionalDate,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Forneça ao menos um campo para atualizar",
  });

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

// Query params do GET /api/organizations
export const listOrganizationsQuerySchema = z.object({
  type: z.enum(ORG_TYPES).optional(),
  status: orgStatusSchema.optional(),
  horizonte: horizonteSchema.optional(),
  search: z.string().trim().optional(),
});

export type ListOrganizationsQuery = z.infer<typeof listOrganizationsQuerySchema>;

/**
 * Gera slug a partir de um nome:
 * - lowercase
 * - remove acentos
 * - troca espaços e caracteres especiais por hífens
 * - colapsa hífens consecutivos
 * - corta a 60 caracteres
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove diacríticos (acentos combinantes Unicode)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") // tira hífens das pontas
    .replace(/-+/g, "-") // colapsa hífens
    .slice(0, 60);
}
