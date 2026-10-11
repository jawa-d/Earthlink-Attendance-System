import { authorize } from "@/lib/auth";
import { DepartmentsPage } from "@/components/departments-page";
export default async function Page() {
  const admin = await authorize("read");
  return <DepartmentsPage role={admin.role} />;
}
