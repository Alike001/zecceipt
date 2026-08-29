import Link from "next/link";

import { AppShell } from "@/components/integration";

export default function CheckoutNotFound() {
  return (
    <AppShell>
      <section className="not-found-panel">
        <h1>Invoice not found.</h1>
        <p>
          Check the checkout link or ask the merchant to create a new Testnet
          payment request.
        </p>
        <Link className="button" href="/create">
          Create an invoice
        </Link>
      </section>
    </AppShell>
  );
}
