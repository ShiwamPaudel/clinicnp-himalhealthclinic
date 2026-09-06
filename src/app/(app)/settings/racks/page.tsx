import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { listRacks, cellCounts } from "@/lib/repos/racks";
import { RacksManager } from "@/components/app/racks-manager";

export const metadata = { title: "Racks" };

export default async function RacksSettingsPage() {
  await requireAdmin();
  await requireModulePage("pharmacy");
  const [racks, counts] = await Promise.all([listRacks(true), cellCounts()]);

  return (
    <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
      <RacksManager initial={racks} counts={counts} />
    </main>
  );
}
