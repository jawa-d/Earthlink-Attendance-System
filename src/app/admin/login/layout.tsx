import { ProjectCredits } from "@/components/project-credits";

export default function LoginLayout({
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
