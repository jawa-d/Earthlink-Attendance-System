import { authorize } from "@/lib/auth";
import { TeamLeadersPage } from "@/components/team-leaders-page";
export default async function Page() {
  const admin = await authorize("read");
  return <TeamLeadersPage role={admin.role} />;
}
