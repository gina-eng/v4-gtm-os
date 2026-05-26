import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Cliente Postgres compartilhado.
 *
 * Para Supabase em dev/prod usamos o `Transaction Pooler` (porta 6543) por padrão.
 * `prepare: false` é necessário porque o pooler em modo transaction não suporta
 * prepared statements através de múltiplas requisições.
 *
 * Se você usar a Direct Connection (porta 5432), pode remover `prepare: false`.
 */
const client = postgres(env.DATABASE_URL, {
  prepare: false,
  // Pool conservador para serverless — cada lambda do Next.js abre poucas conexões
  max: 10,
});

export const db = drizzle(client, { schema });

export type DB = typeof db;
