import { ProjectCredits } from "@/components/project-credits";

export default function AttendanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {children}
      <ProjectCredits />
    </div>
  );
}
