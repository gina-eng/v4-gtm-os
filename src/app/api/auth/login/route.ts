import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getUserByEmail, updateUserLastLogin } from "@/db/repositories/users";
import { AUTH_COOKIE_NAME } from "@/lib/auth/types";
import { loginSchema } from "@/lib/validations/auth";

/**
 * POST /api/auth/login
 * Body: { email, password? }
 *
 * ⚠️ Mock para dev: a senha é IGNORADA. Login bem-sucedido se o e-mail bate
 * com algum user seedado e o user está ativo. Quando a auth real entrar
 * (adendo §11), validar bcrypt.compare(password, user.passwordHash).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = loginSchema.parse(body);

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
