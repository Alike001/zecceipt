// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/db";
import {
  InvoiceRepository,
  type InvoiceRecord,
} from "@/lib/invoices/repository";
import {
  InvoiceNotFoundError,
  verifyInvoicePayment,
} from "@/lib/payments/payment-verifier";
import { RpcClientError } from "@/lib/zcash/rpc-errors";
import type { ZcashRpcClient } from "@/lib/zcash/rpc-client";
import type {
  RawTransactionResult,
  RpcCallResult,
} from "@/lib/zcash/rpc-types";
import type { ZcashRpcMethod } from "@/types";
import { createTestDatabase } from "@/test/pglite-database";

const recipientAddress = "tmYXBYJj1K7vhejSec5osXK2QsGa5MTisUQ";
const otherAddress = "tmWrongRecipientAddressForVerifierTestsOnly";
const creationHeight = 481_688;
const currentHeight = 481_690;
const observedAt = "2026-08-29T12:05:00.000Z";
const minedAtSeconds = Date.parse("2026-08-29T12:04:00.000Z") / 1_000;

function rpcResult<M extends ZcashRpcMethod>(
  method: M,
  result: RpcCallResult<M>["result"],
): RpcCallResult<M> {
  return {
    requestId: `${method}-request`,
    result,
    evidence: {
      method,
      state: "success",
      observedAt,
      latencyMs: 12,
    },
  };
}

function transaction(input: {
  txid?: string;
  valueZatoshis: bigint;
  address?: string;
  height?: number;
  confirmations?: number;
  blocktime?: number;
}): RawTransactionResult {
  return {
    txid: input.txid ?? "a".repeat(64),
    height: input.height ?? creationHeight + 1,
    blockhash: "b".repeat(64),
    confirmations: input.confirmations ?? 1,
    blocktime: input.blocktime ?? minedAtSeconds,
    vout: [
      {
        n: 0,
        valueZat: Number(input.valueZatoshis),
        scriptPubKey: {
          type: "pubkeyhash",
          addresses: [input.address ?? recipientAddress],
        },
      },
    ],
  };
}

function rpcClient(input: {
  transactions?: readonly RawTransactionResult[];
  errorMethod?: ZcashRpcMethod;
}) {
  const transactions = input.transactions ?? [];
  const byId = new Map(
    transactions.map((rawTransaction) => [rawTransaction.txid, rawTransaction]),
  );
  const call = vi.fn(async (method: ZcashRpcMethod, params: unknown) => {
    if (method === input.errorMethod) {
      throw new RpcClientError({
        code: "network",
        message: "Provider unavailable.",
        method,
        retryable: true,
      });
    }
    if (method === "getblockcount") {
      return rpcResult("getblockcount", currentHeight);
    }
    if (method === "getaddresstxids") {
      return rpcResult("getaddresstxids", [...byId.keys()]);
    }
    if (method === "getrawtransaction") {
      const transactionId = (params as [string, 1])[0];
      const rawTransaction = byId.get(transactionId);
      if (!rawTransaction) throw new Error("Missing transaction fixture.");
      return rpcResult("getrawtransaction", rawTransaction);
    }
    throw new Error(`Unexpected RPC method ${method}.`);
  });

  return { call } as unknown as Pick<ZcashRpcClient, "call">;
}

describe("transparent payment verifier", () => {
  let database: Database;
  let closeDatabase: () => Promise<void>;
  let repository: InvoiceRepository;
  let invoice: InvoiceRecord;

  beforeEach(async () => {
    const testDatabase = await createTestDatabase();
    database = testDatabase.database;
    closeDatabase = testDatabase.close;
    repository = new InvoiceRepository(database);
    invoice = await repository.create({
      id: "invoice-payment-test",
      managementTokenHash: "hash-payment-test",
      recipientAddress,
      label: "Coffee order",
      baseAmountZatoshis: 10_000_000n,
      creationHeight,
      expiresAt: "2026-08-29T12:30:00.000Z",
      confirmationTarget: 1,
      createdAt: "2026-08-29T12:00:00.000Z",
    });
  });

  afterEach(async () => {
    await closeDatabase();
  });

  async function verify(client: Pick<ZcashRpcClient, "call">) {
    return verifyInvoicePayment(invoice.id, {
      rpcClient: client,
      invoiceRepository: repository,
      now: () => new Date(observedAt),
    });
  }

  it("matches an exact post-creation recipient output and marks it paid", async () => {
    const client = rpcClient({
      transactions: [
        transaction({ valueZatoshis: invoice.expectedAmountZatoshis }),
      ],
    });

    const result = await verify(client);

    expect(result.payment).toMatchObject({
      status: "paid",
      expectedAmountZec: "0.10000001",
      receivedAmountZec: "0.10000001",
    });
    expect(result.rpcEvidence.map((item) => item.method)).toEqual([
      "getblockcount",
      "getaddresstxids",
      "getrawtransaction",
    ]);
    expect(client.call).toHaveBeenCalledWith("getaddresstxids", [
      {
        addresses: [recipientAddress],
        start: creationHeight + 1,
        end: currentHeight,
      },
    ]);

    const outputs = await repository.findPaymentOutputsByInvoiceId(invoice.id);
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({
      txid: "a".repeat(64),
      outputIndex: 0,
      valueZatoshis: invoice.expectedAmountZatoshis,
    });
  });

  it("reports a partial payment and its exact integer shortfall", async () => {
    const result = await verify(
      rpcClient({
        transactions: [transaction({ valueZatoshis: 4_000_000n })],
      }),
    );

    expect(result.payment).toMatchObject({
      status: "partial",
      receivedAmountZec: "0.04000000",
      shortfallAmountZec: "0.06000001",
    });
  });

  it("marks a confirmed excess as overpaid", async () => {
    const result = await verify(
      rpcClient({
        transactions: [
          transaction({
            valueZatoshis: invoice.expectedAmountZatoshis + 500n,
          }),
        ],
      }),
    );

    expect(result.payment).toMatchObject({
      status: "overpaid",
      receivedAmountZec: "0.10000501",
    });
  });

  it("is idempotent when the same output is scanned repeatedly", async () => {
    const rawTransaction = transaction({
      valueZatoshis: invoice.expectedAmountZatoshis,
    });

    await verify(rpcClient({ transactions: [rawTransaction] }));
    await verify(rpcClient({ transactions: [rawTransaction] }));

    const persisted = await repository.findById(invoice.id);
    const outputs = await repository.findPaymentOutputsByInvoiceId(invoice.id);
    expect(persisted?.receivedZatoshis).toBe(invoice.expectedAmountZatoshis);
    expect(outputs).toHaveLength(1);
  });

  it("ignores stale address history at or before invoice creation", async () => {
    const result = await verify(
      rpcClient({
        transactions: [
          transaction({
            valueZatoshis: invoice.expectedAmountZatoshis,
            height: creationHeight,
          }),
        ],
      }),
    );

    expect(result.payment.status).toBe("waiting");
    expect(await repository.findPaymentOutputsByInvoiceId(invoice.id)).toEqual(
      [],
    );
  });

  it("does not credit an output sent to a different recipient", async () => {
    const result = await verify(
      rpcClient({
        transactions: [
          transaction({
            valueZatoshis: invoice.expectedAmountZatoshis,
            address: otherAddress,
          }),
        ],
      }),
    );

    expect(result.payment.status).toBe("waiting");
  });

  it("fails closed on RPC errors and succeeds on a later retry", async () => {
    const partial = await verify(
      rpcClient({
        transactions: [transaction({ valueZatoshis: 4_000_000n })],
      }),
    );
    expect(partial.payment.status).toBe("partial");

    const unavailable = await verify(
      rpcClient({ errorMethod: "getaddresstxids" }),
    );

    expect(unavailable.payment).toMatchObject({
      status: "rpc_unavailable",
      lastKnownStatus: "partial",
      receivedAmountZec: "0.04000000",
    });
    expect(await repository.findById(invoice.id)).toMatchObject({
      status: "partial",
      receivedZatoshis: 4_000_000n,
    });

    const retry = await verify(
      rpcClient({
        transactions: [
          transaction({ valueZatoshis: invoice.expectedAmountZatoshis }),
        ],
      }),
    );
    expect(retry.payment.status).toBe("paid");
  });

  it("does not credit a transaction mined after invoice expiry", async () => {
    const result = await verifyInvoicePayment(invoice.id, {
      rpcClient: rpcClient({
        transactions: [
          transaction({
            valueZatoshis: invoice.expectedAmountZatoshis,
            blocktime: Date.parse("2026-08-29T12:31:00.000Z") / 1_000,
          }),
        ],
      }),
      invoiceRepository: repository,
      now: () => new Date("2026-08-29T12:32:00.000Z"),
    });

    expect(result.payment.status).toBe("expired");
    expect(await repository.findPaymentOutputsByInvoiceId(invoice.id)).toEqual(
      [],
    );
  });

  it("rechecks confirmation and reorganization evidence until settlement", async () => {
    await database.query(
      `UPDATE invoices SET confirmation_target = 2 WHERE id = $1`,
      [invoice.id],
    );
    invoice = (await repository.findById(invoice.id)) as InvoiceRecord;

    const confirmingTransaction = transaction({
      valueZatoshis: invoice.expectedAmountZatoshis,
      confirmations: 1,
    });
    const confirming = await verify(
      rpcClient({ transactions: [confirmingTransaction] }),
    );
    expect(confirming.payment).toMatchObject({
      status: "confirming",
      confirmations: 1,
      confirmationTarget: 2,
    });

    const reorganized = await verify(rpcClient({ transactions: [] }));
    expect(reorganized.payment.status).toBe("waiting");
    expect(await repository.findPaymentOutputsByInvoiceId(invoice.id)).toEqual(
      [],
    );

    const settled = await verify(
      rpcClient({
        transactions: [
          transaction({
            valueZatoshis: invoice.expectedAmountZatoshis,
            confirmations: 2,
          }),
        ],
      }),
    );
    expect(settled.payment.status).toBe("paid");
  });

  it("rejects missing invoices before making an RPC call", async () => {
    const client = rpcClient({ transactions: [] });
    await expect(
      verifyInvoicePayment("missing-invoice", {
        rpcClient: client,
        invoiceRepository: repository,
      }),
    ).rejects.toBeInstanceOf(InvoiceNotFoundError);
    expect(client.call).not.toHaveBeenCalled();
  });
});
