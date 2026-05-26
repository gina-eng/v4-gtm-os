import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/current-user";
import { getUnitSetup, nextPendingStep } from "@/db/repositories/unit-setup";

export const dynamic = "force-dynamic";

export default async function IniciarIndexPage() {
  const session = await requireAuth();
  if (!session.activeOrganization) redirect("/");

  const setup = await getUnitSetup(session.activeOrganization.id);
  const next = nextPendingStep(setup);

  if (next) {
    redirect(`/iniciar/${next}`);
  }
  redirect("/iniciar/resumo");
}
