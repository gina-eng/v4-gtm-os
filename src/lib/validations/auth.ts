import { z } from "zod";

/**
 * Domínio corporativo único da V4. Toda autenticação exige email com este domínio.
 * Hard-coded por decisão de produto (todo usuário do OS é da V4 Company).
 */
export const ALLOWED_EMAIL_DOMAIN = "v4company.com";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("E-mail inválido")
    .refine((v) => v.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`), {
      message: `Use seu e-mail corporativo @${ALLOWED_EMAIL_DOMAIN}`,
    }),
  password: z.string().min(1, "Senha obrigatória"),
});

export type LoginInput = z.infer<typeof loginSchema>;
