import { authorize } from "@/lib/auth";
import { ShiftsPage } from "@/components/shifts-page";
export default async function Page() {
  const admin = await authorize("read");
  return <ShiftsPage role={admin.role} />;
}
