import { Dashboard } from "@/components/dashboard";
import { isLocalAdminPreview } from "@/lib/preview";
export default function Page() {
  return <Dashboard preview={isLocalAdminPreview()} />;
}
