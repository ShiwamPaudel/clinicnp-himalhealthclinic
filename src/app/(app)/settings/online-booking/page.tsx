import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { getCompany, getWebBookingSettings } from "@/lib/repos/company";
import { smsConfigured } from "@/lib/sms";
import { websiteKeyConfigured } from "@/lib/public-api";
import { OnlineBookingPanel } from "@/components/app/online-booking-panel";

export const metadata = { title: "Online booking" };

export default async function OnlineBookingPage() {
  await requireAdmin();
  await requireModulePage("clinic");
  const [settings, company] = await Promise.all([getWebBookingSettings(), getCompany()]);

  return (
    <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
      <OnlineBookingPanel
        initial={settings}
        clinicName={company.name}
        keyReady={websiteKeyConfigured()}
        smsReady={smsConfigured()}
      />
    </main>
  );
}
