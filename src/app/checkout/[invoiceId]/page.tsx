import { notFound } from "next/navigation";

import { AppShell, CheckoutExperience } from "@/components/integration";
import { loadPublicInvoice } from "@/lib/invoices/load-public-invoice";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  const invoice = await loadPublicInvoice(invoiceId);

  if (!invoice) notFound();

  return (
    <AppShell>
      <CheckoutExperience
        request={invoice.request}
        initialPayment={invoice.initialPayment}
        initialReceipt={invoice.initialReceipt}
      />
    </AppShell>
  );
}
