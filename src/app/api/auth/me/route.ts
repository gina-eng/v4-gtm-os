import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/current-user";

/**
 * GET /api/auth/me
 * Retorna a sessão atual: user + memberships + active org + lista de orgs disponíveis.
 *
 * 401 se não houver cookie de sessão.
 */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  return NextResponse.json({ data: session });
}
