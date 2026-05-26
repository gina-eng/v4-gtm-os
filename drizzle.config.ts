import { defineConfig } from "drizzle-kit";

/**
 * Config do drizzle-kit (gera e aplica migrations).
 *
 * Notas:
 * - DATABASE_URL é lida de .env.local automaticamente pelo Next.js,
 *   mas drizzle-kit roda fora do Next, então precisamos carregar com `dotenv`.
 * - Para o Supabase, use a **Direct Connection** (porta 5432) aqui, não o pooler —
 *   o pooler em modo transaction não suporta os comandos DDL que migrations rodam.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? "",
  },
  verbose: true,
  strict: true,
});
