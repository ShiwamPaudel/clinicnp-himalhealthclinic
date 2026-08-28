import { getCompany } from "@/lib/repos/company";
import { cbmsCounts } from "@/lib/repos/cbms";
import { CompliancePanel } from "@/components/app/compliance-panel";

export default async function CompliancePage() {
  const company = await getCompany();
  const counts = await cbmsCounts();
  const endpointConfigured = Boolean(process.env.CBMS_ENDPOINT);

  return (
    <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
      <CompliancePanel
        enabled={company.cbmsEnabled}
        endpointConfigured={endpointConfigured}
        counts={counts}
      />
    </main>
  );
}
