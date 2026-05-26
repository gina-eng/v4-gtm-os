import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/current-user";
import { getStepValues, type ConversoesInboundData } from "@/db/repositories/unit-setup";
import { StepConversoesInbound } from "@/components/iniciar/step-conversoes-inbound";

export const dynamic = "force-dynamic";

export default async function ConversoesInboundPage() {
  const session = await requireAuth();
  if (!session.activeOrganization) redirect("/");

  const { values, matrizDefault, fromMatriz } = await getStepValues(
    session.activeOrganization.id,
    "conversoes-inbound",
  );
  const v = values as ConversoesInboundData;
  const m = matrizDefault as ConversoesInboundData;

  return (
    <StepConversoesInbound
      organizationId={session.activeOrganization.id}
      initialLeadBroker={v.leadBroker}
      initialBlackBox={v.blackBox}
      initialMeetingBroker={v.meetingBroker}
      matrizLeadBroker={m.leadBroker}
      matrizBlackBox={m.blackBox}
      matrizMeetingBroker={m.meetingBroker}
      fromMatriz={fromMatriz}
    />
  );
}
