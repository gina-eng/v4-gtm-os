import { z } from "zod";

/**
 * Validador de UUID permissivo — aceita qualquer string no formato 8-4-4-4-12
 * com caracteres hex. Permite UUIDs "all-zeros except last" usados nos seeds.
 *
 * O Postgres valida em runtime via tipo `uuid` quando o banco está conectado.
 * Aqui só garantimos forma sintática, não conformidade RFC 9562.
 */
export const uuidLike = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "ID inválido",
  );
