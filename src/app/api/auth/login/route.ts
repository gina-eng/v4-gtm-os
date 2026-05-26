import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getUserByEmail, updateUserLastLogin } from "@/db/repositories/users";
import { AUTH_COOKIE_NAME } from "@/lib/auth/types";
import { verifyPassword } from "@/lib/auth/password";
import { loginSchema } from "@/lib/validations/auth";

/**
 * POST /api/auth/login
 * Body: { email, password }
 *
 * Valida senha via bcrypt.compare(password, user.passwordHash).
 * Para um user logar, três condições precisam ser verdadeiras:
 *   1. user existe na tabela `users` (provisionamento manual via admin)
 *   2. user.status === "active"
 *   3. user.passwordHash existe e bcrypt.compare bate
 * Usuários sem `passwordHash` (criados por seed/invite e ainda não ativados)
 * recebem 401 — não há como logar até o admin definir a senha.
 *
 * Resposta de erro é genérica ("E-mail ou senha inválidos") em todos os casos
 * de falha de credencial pra não permitir user enumeration.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = loginSchema.parse(body);

    const user = await getUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { error: "E-mail ou senha inválidos" },
        { status: 401 },
      );
    }
    if (user.status !== "active") {
      return NextResponse.json(
        { error: "Conta inativa. Procure o administrador da sua organização." },
        { status: 403 },
      );
    }
    if (!user.passwordHash) {
      return NextResponse.json(
        { error: "E-mail ou senha inválidos" },
        { status: 401 },
      );
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { error: "E-mail ou senha inválidos" },
        { status: 401 },
      );
    }

    await updateUserLastLogin(user.id);

    const res = NextResponse.json({
      data: { id: user.id, email: user.email, name: user.name },
    });
    res.cookies.set(AUTH_COOKIE_NAME, user.id, {
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
    console.error("[POST /api/auth/login]", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
