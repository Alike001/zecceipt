// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db";
import {
  InvoiceRepository,
  PaymentOutputAlreadyAssignedError,
  type NewInvoiceRecord,
} from "@/lib/invoices/repository";
import { createTestDatabase } from "@/test/pglite-database";

function invoiceInput(
  id: string,
  managementTokenHash: string,
): NewInvoiceRecord {
  return {
    id,
    managementTokenHash,
    recipientAddress: "tmYXBYJj1K7vhejSec5osXK2QsGa5MTisUQ",
    label: `Order ${id}`,
    baseAmountZatoshis: 10_000_000n,
    creationHeight: 481_688,
    expiresAt: "2026-08-29T12:30:00.000Z",
    confirmationTarget: 1,
    createdAt: "2026-08-29T12:00:00.000Z",
  };
}

describe("invoice migration and repository", () => {
  let database: Database;
  let closeDatabase: () => Promise<void>;
  let repository: InvoiceRepository;

  beforeEach(async () => {
    const testDatabase = await createTestDatabase();
    database = testDatabase.database;
    closeDatabase = testDatabase.close;
    repository = new InvoiceRepository(database);
  });

  afterEach(async () => {
    await closeDatabase();
  });

  it("runs the migration and persists every required invoice field", async () => {
    const created = await repository.create(
      invoiceInput("invoice-a", "hash-a"),
    );
    const restartedRepository = new InvoiceRepository(database);
    const persisted = await restartedRepository.findById(created.id);

    expect(persisted).toMatchObject({
      id: "invoice-a",
      managementTokenHash: "hash-a",
      recipientAddress: "tmYXBYJj1K7vhejSec5osXK2QsGa5MTisUQ",
      baseAmountZatoshis: 10_000_000n,
      amountCodeZatoshis: 1n,
      expectedAmountZatoshis: 10_000_001n,
      creationHeight: 481_688,
      confirmationTarget: 1,
      status: "waiting",
      receivedZatoshis: 0n,
    });
  });

  it("allocates distinct exact amounts during concurrent creation", async () => {
    const invoices = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        repository.create(invoiceInput(`invoice-${index}`, `hash-${index}`)),
      ),
    );
    const exactAmounts = new Set(
      invoices.map((invoice) => invoice.expectedAmountZatoshis.toString()),
    );

    expect(exactAmounts.size).toBe(invoices.length);
    expect(
      invoices.every(
        (invoice) =>
          invoice.expectedAmountZatoshis ===
          invoice.baseAmountZatoshis + invoice.amountCodeZatoshis,
      ),
    ).toBe(true);
  });

  it("prevents one blockchain output from being assigned twice", async () => {
    const first = await repository.create(invoiceInput("invoice-a", "hash-a"));
    const second = await repository.create(invoiceInput("invoice-b", "hash-b"));
    const output = {
      txid: "a".repeat(64),
      outputIndex: 0,
      valueZatoshis: 10_000_001n,
      blockHeight: 481_689,
      blockHash: "b".repeat(64),
      confirmations: 1,
      observedAt: "2026-08-29T12:05:00.000Z",
    };

    await repository.recordPaymentOutput({ invoiceId: first.id, ...output });
    await expect(
      repository.recordPaymentOutput({
        invoiceId: first.id,
        ...output,
        confirmations: 2,
      }),
    ).resolves.toBeUndefined();

    await expect(
      repository.recordPaymentOutput({ invoiceId: second.id, ...output }),
    ).rejects.toBeInstanceOf(PaymentOutputAlreadyAssignedError);
  });
});
