import { requireAdmin } from "@/lib/session";
import { SettingsTabs } from "@/components/app/settings-tabs";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Settings is Admin-only (Company details, users, backup/restore — PRD 4.7).
  await requireAdmin();
  return (
    <>
      <SettingsTabs />
      {children}
    </>
  );
}
