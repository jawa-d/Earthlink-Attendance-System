import { notFound, redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth";
import { Management } from "@/components/management";
import { SettingsPage, Profile, QrPage } from "@/components/special-pages";
import { isLocalAdminPreview } from "@/lib/preview";
import { PreviewSection } from "@/components/preview-section";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ teamLeader?: string }>;
}) {
  const { section } = await params;
  if (isLocalAdminPreview()) {
    if (
      ![
        "employees",
        "attendance",
        "reports",
        "audit-logs",
        "qr",
        "settings",
        "profile",
      ].includes(section)
    )
      notFound();
    return <PreviewSection section={section} />;
  }
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  if (
    ["settings", "audit-logs"].includes(section) &&
    admin.role !== "SUPER_ADMIN"
  )
    notFound();
  if (section === "qr") {
    if (admin.role === "VIEWER") notFound();
    return <QrPage />;
  }
  if (section === "settings") return <SettingsPage />;
  if (section === "profile")
    return <Profile name={admin.name} email={admin.email} role={admin.role} />;
  if (["employees", "attendance", "reports", "audit-logs"].includes(section))
    return (
      <Management
        kind={section}
        role={admin.role}
        initialTeamLeader={(await searchParams).teamLeader || ""}
      />
    );
  notFound();
}
