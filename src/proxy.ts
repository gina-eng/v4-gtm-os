import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth/types";

/**
 * Proxy Next 16 (anteriormente "middleware") — redireciona usuário
 * não-autenticado para /login.
 *
 * Considera autenticado quem tem o cookie `v4_user_id`. A validação real
 * (se o cookie aponta para um user existente e ativo) acontece nos handlers
 * server-side via getCurrentSession(). O proxy só faz o redirect rápido.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAuthed = !!req.cookies.get(AUTH_COOKIE_NAME);

  // Rotas que NÃO exigem autenticação por cookie de sessão.
  const publicPaths = [
    "/login",
    "/api/auth/login",
    "/api/auth/check-email",
    "/api/auth/setup-password",
    // Cron do Vercel: não tem cookie de sessão. Protegida pelo CRON_SECRET
    // dentro do próprio handler (Authorization: Bearer <secret>).
    "/api/realizado/derive",
  ];
  const isPublic = publicPaths.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (isPublic) {
    // Se já está logado e tenta acessar /login, manda pra home
    if (isAuthed && pathname === "/login") {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (!isAuthed) {
    const loginUrl = new URL("/login", req.url);
    // Preserva destino pós-login (futuro)
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Aplica em tudo exceto assets estáticos e arquivos do _next
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp)$).*)"],
};
