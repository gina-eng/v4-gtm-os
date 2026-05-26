import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import {
  getUserByEmail,
  setInitialPasswordHash,
  updateUserLastLogin,
} from "@/db/repositories/users";
import { AUTH_COOKIE_NAME } from "@/lib/auth/types";
import { hashPassword } from "@/lib/auth/password";
import { setupPasswordSchema } from "@/lib/validations/auth";

/**
 * POST /api/auth/setup-password
 * Body: { email, password }
 *
 * Define a senha inicial de um user que foi cadastrado mas ainda não logou.
 * Só funciona quando `users.password_hash IS NULL` — a checagem é atômica
 * no UPDATE pra evitar race. Se a senha já está setada, retorna 409 e o
 * caller deve mandar o user pra tela de login normal.
 *
 * Em sucesso, já loga o user (seta o cookie de sessão) — UX de primeiro
 * acesso emenda direto na home, sem digitar a senha que acabou de criar.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = setupPasswordSchema.parse(body);

    const user = await getUserByEmail(email);
    if (!user || user.status !== "active") {
      // Mesma resposta de "conta não encontrada" pra não vazar status.
      return NextResponse.json(
        { error: "Conta não encontrada ou inativa." },
        { status: 404 },
      );
    }

    const hash = await hashPassword(password);
    const updated = await setInitialPasswordHash(user.id, hash);
    if (!updated) {
      // setInitialPasswordHash retorna null quando passwordHash já existe.
      return NextResponse.json(
        {
          error:
            "Esta conta já tem senha definida. Vá para a tela de login.",
        },
        { status: 409 },
      );
    }

    await updateUserLastLogin(updated.id);

    const res = NextResponse.json({
      data: { id: updated.id, email: updated.email, name: updated.name },
    });
    res.cookies.set(AUTH_COOKIE_NAME, updated.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 dias
    });
    return res;
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Dados inválidos", details: err.issues },
        { status: 400 },
      );
    }
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    console.error("[POST /api/auth/setup-password]", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
