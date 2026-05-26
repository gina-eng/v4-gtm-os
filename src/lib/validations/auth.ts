import { z } from "zod";

/**
 * Domínio corporativo único da V4. Toda autenticação exige email com este domínio.
 * Hard-coded por decisão de produto (todo usuário do OS é da V4 Company).
 */
export const ALLOWED_EMAIL_DOMAIN = "v4company.com";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("E-mail inválido")
  .refine((v) => v.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`), {
    message: `Use seu e-mail corporativo @${ALLOWED_EMAIL_DOMAIN}`,
  });

export const checkEmailSchema = z.object({ email: emailSchema });
export type CheckEmailInput = z.infer<typeof checkEmailSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Senha obrigatória"),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Setup de senha no primeiro acesso. Critérios:
 * - 8 chars mínimo (recomendação OWASP atual; sem regra de complexidade
 *   por enquanto pra não dar atrito — adicionar depois se necessário)
 * - 72 chars máximo (limite do bcrypt — chars além disso são silenciosamente
 *   ignorados e isso é uma armadilha de segurança famosa)
 */
export const setupPasswordSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(8, "Senha precisa ter no mínimo 8 caracteres")
    .max(72, "Senha não pode ter mais de 72 caracteres"),
});
export type SetupPasswordInput = z.infer<typeof setupPasswordSchema>;
