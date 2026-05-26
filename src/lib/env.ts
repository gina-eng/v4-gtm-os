import { z } from "zod";

/**
 * Validação de variáveis de ambiente em runtime.
 *
 * Se uma var obrigatória estiver faltando ou inválida, falhamos cedo —
 * é melhor crashar no boot do que descobrir middle-request em produção.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL é obrigatória. Configure no .env.local (ver .env.example)."),
  /** Apenas dev: ID do usuário usado pelo mock de auth quando o header X-Dev-User-Id não está presente. */
  DEV_USER_ID: z.string().uuid().optional(),
});

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  DEV_USER_ID: process.env.DEV_USER_ID,
});

export type Env = typeof env;
