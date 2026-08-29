import { AppShell, CreateInvoiceExperience } from "@/components/integration";
import { NetworkProofPanel } from "@/components/network";
import { getLiveNetworkView } from "@/lib/zcash/network";

import styles from "@/components/integration/integration.module.css";

export const dynamic = "force-dynamic";

export default async function CreateInvoicePage() {
  const network = await getLiveNetworkView();

  return (
    <AppShell>
      <CreateInvoiceExperience />
      <div className={styles.networkPanel}>
        <NetworkProofPanel view={network} />
      </div>
    </AppShell>
  );
}
