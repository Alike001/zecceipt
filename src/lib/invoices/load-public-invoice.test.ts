// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db";
import { loadPublicInvoice } from "@/lib/invoices/load-public-invoice";
import {
  buildZip321PaymentUri,
  createAddressFingerprint,
} from "@/lib/invoices/public-view";
import { InvoiceRepository } from "@/lib/invoices/repository";
import { createTestDatabase } from "@/test/pglite-database";

const recipientAddress = "tmYXBYJj1K7vhejSec5osXK2QsGa5MTisUQ";

describe("public invoice view", () => {
  let database: Database;
  let closeDatabase: () => Promise<void>;
  let repository: InvoiceRepository;

  beforeAll(async () => {
    const testDatabase = await createTestDatabase();
    database = testDatabase.database;
    closeDatabase = testDatabase.close;
    repository = new InvoiceRepository(database);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it("builds the exact ZIP-321 URI without floating-point conversion", () => {
    expect(
      buildZip321PaymentUri({
        recipientAddress,
        exactAmountZec: "0.10000001",
        label: "Coffee & cake",
      }),
    ).toBe(
      `zcash:${recipientAddress}?amount=0.10000001&label=Coffee%20%26%20cake`,
    );
    expect(createAddressFingerprint(recipientAddress)).toBe("tmYXBY…MTisUQ");
  });

  it("restores persisted checkout, payment, and receipt evidence", async () => {
    const invoice = await repository.create({
      id: "public-invoice",
      managementTokenHash: "public-invoice-hash",
      recipientAddress,
      label: "Coffee & cake",
      baseAmountZatoshis: 10_000_000n,
      creationHeight: 481_688,
      expiresAt: "2026-08-29T12:30:00.000Z",
      confirmationTarget: 1,
      createdAt: "2026-08-29T12:00:00.000Z",
    });
    const settledAt = "2026-08-29T12:05:00.000Z";
    await repository.reconcilePaymentOutputs({
      invoiceId: invoice.id,
      outputs: [
        {
          txid: "a".repeat(64),
          outputIndex: 0,
          valueZatoshis: invoice.expectedAmountZatoshis,
          blockHeight: 481_689,
          blockHash: "b".repeat(64),
          confirmations: 1,
        },
      ],
      status: "paid",
      receivedZatoshis: invoice.expectedAmountZatoshis,
      observedAt: settledAt,
    });

    const view = await loadPublicInvoice(invoice.id, database);

    expect(view?.request).toMatchObject({
      exactAmountZec: "0.10000001",
      exactAmountZats: "10000001",
      network: "testnet",
    });
    expect(view?.initialPayment.status).toBe("paid");
    expect(view?.initialReceipt).toMatchObject({
      status: "paid",
      settledAt,
      paidAmountZec: "0.10000001",
    });

    await repository.reconcilePaymentOutputs({
      invoiceId: invoice.id,
      outputs: [
        {
          txid: "a".repeat(64),
          outputIndex: 0,
          valueZatoshis: invoice.expectedAmountZatoshis,
          blockHeight: 481_689,
          blockHash: "b".repeat(64),
          confirmations: 2,
        },
      ],
      status: "paid",
      receivedZatoshis: invoice.expectedAmountZatoshis,
      observedAt: "2026-08-29T12:10:00.000Z",
    });

    const refreshedView = await loadPublicInvoice(invoice.id, database);
    expect(refreshedView?.initialReceipt?.settledAt).toBe(settledAt);
  });

  it("returns null for an unknown invoice", async () => {
    await expect(loadPublicInvoice("missing", database)).resolves.toBeNull();
  });
});
