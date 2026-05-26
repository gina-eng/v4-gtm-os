import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { LoginClient } from "./login-client";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Se já está logado, redireciona pra home
  const session = await getCurrentSession();
  if (session) redirect("/");

  return <LoginClient />;
}
