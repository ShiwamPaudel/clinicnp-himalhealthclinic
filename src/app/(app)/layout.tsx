import { requireUser } from "@/lib/session";
import { listUsers } from "@/lib/repos/users";
import { Sidebar } from "@/components/app/sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const all = await listUsers();
  const switchable = all
    .filter((u) => u.active && u.hasPin && u.id !== user.id)
    .map((u) => ({ id: u.id, name: u.name, role: u.role }));

  return (
    <div className="flex h-screen overflow-hidden bg-cream-100">
      <Sidebar user={{ name: user.name, role: user.role }} switchable={switchable} />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
