import { requireBackOfficeUser, canBill, canBook } from "@/lib/session";
import { getModules } from "@/lib/modules";
import { appNameFor } from "@/lib/app-name";
import { listUsers } from "@/lib/repos/users";
import { getDateCalendar } from "@/lib/repos/company";
import { countPendingWebRequests } from "@/lib/repos/web-bookings";
import { Sidebar } from "@/components/app/sidebar";
import { GlobalShortcuts } from "@/components/app/global-shortcuts";
import { DateCalendarProvider } from "@/components/ui/date-calendar-context";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireBackOfficeUser();
  const modules = await getModules();
  const all = await listUsers();
  const dateCalendar = await getDateCalendar();
  // The bubble on Clinic → Requests. Never allowed to take a page down: if
  // the count cannot be read, the menu shows none and asks again in a minute.
  let pendingRequests = 0;
  if (modules.clinic && canBook(user.role)) {
    try {
      pendingRequests = await countPendingWebRequests();
    } catch (err) {
      console.error("[layout] website requests could not be counted", (err as Error)?.name);
    }
  }
  const switchable = all
    // A doctor's sign-in never appears in quick-switch: it belongs to one
    // person on their own phone, not to the shared counter machine.
    .filter((u) => u.active && u.hasPin && u.role !== "doctor" && u.id !== user.id)
    .map((u) => ({ id: u.id, name: u.name, role: u.role }));

  return (
    <div className="flex h-screen overflow-hidden bg-cream-100">
      <GlobalShortcuts canBill={canBill(user.role)} />
      <Sidebar
        user={{ name: user.name, role: user.role }}
        switchable={switchable}
        appName={appNameFor(modules)}
        modules={modules}
        pendingRequests={pendingRequests}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <DateCalendarProvider calendar={dateCalendar}>{children}</DateCalendarProvider>
      </div>
    </div>
  );
}
