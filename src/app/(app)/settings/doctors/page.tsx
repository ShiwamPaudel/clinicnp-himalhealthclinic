import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { listDoctors } from "@/lib/repos/doctors";
import { DoctorsManager } from "@/components/clinic/doctors-manager";

export const metadata = { title: "Doctors" };

export default async function DoctorsSettingsPage() {
  await requireAdmin();
  await requireModulePage("clinic");
  const doctors = await listDoctors(true);

  return (
    <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
      <DoctorsManager initial={doctors} />
    </main>
  );
}
