import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth/types";

/**
 * POST /api/auth/logout
 *
 * Limpa o cookie de sessão. Em prod com auth real, também invalida o session token no DB.
 */
export async function POST() {
  const res = NextResponse.json({ data: { ok: true } });
  res.cookies.delete(AUTH_COOKIE_NAME);
  return res;
}
