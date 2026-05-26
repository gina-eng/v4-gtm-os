import bcrypt from "bcryptjs";

/**
 * Custo do bcrypt — 12 rounds é o sweet spot atual (recomendação OWASP).
 * Acima de 14 começa a ficar lento o suficiente pra impactar UX de login.
 */
const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
