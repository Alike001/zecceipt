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

function pendingTransaction(input: {
  txid?: string;
  valueZatoshis: bigint;
  address?: string;
  expiryHeight?: number;
}): RawTransactionResult {
  return {
    txid: input.txid ?? "c".repeat(64),
    expiryheight: input.expiryHeight ?? currentHeight + 10,
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
  mempoolTransactions?: readonly RawTransactionResult[];
  blockHeight?: number;
  mempoolEnteredAt?: string;
  mempoolRpcErrorTxids?: readonly string[];
  mempoolMalformedResponseTxids?: readonly string[];
  errorMethod?: ZcashRpcMethod;
}) {
  const transactions = input.transactions ?? [];
  const mempoolTransactions = input.mempoolTransactions ?? [];
  const minedById = new Map(
    transactions.map((rawTransaction) => [rawTransaction.txid, rawTransaction]),
  );
  const byId = new Map([
    ...minedById,
    ...mempoolTransactions.map(
      (rawTransaction) => [rawTransaction.txid, rawTransaction] as const,
    ),
  ]);
  const blockHeight = input.blockHeight ?? currentHeight;
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
      return rpcResult("getblockcount", blockHeight);
    }
    if (method === "getrawmempool") {
      return rpcResult(
        "getrawmempool",
        Object.fromEntries(
          mempoolTransactions.map((rawTransaction) => [
            rawTransaction.txid,
            {
              time:
                Date.parse(
                  input.mempoolEnteredAt ?? "2026-08-29T12:04:00.000Z",
                ) / 1_000,
              height: blockHeight,
            },
          ]),
        ),
      );
    }
    if (method === "getaddresstxids") {
      return rpcResult("getaddresstxids", [...minedById.keys()]);
    }
    if (method === "getrawtransaction") {
      const transactionId = (params as [string, 1])[0];
      if (input.mempoolRpcErrorTxids?.includes(transactionId)) {
        throw new RpcClientError({
          code: "rpc_error",
          message: "Transaction left the mempool snapshot.",
          method,
          retryable: true,
        });
      }
      if (input.mempoolMalformedResponseTxids?.includes(transactionId)) {
        throw new RpcClientError({
          code: "malformed_response",
          message: "Transaction used an unsupported response shape.",
          method,
          retryable: true,
        });
      }
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

  it("matches an exact mempool output without claiming it is paid", async () => {
    const rawTransaction = pendingTransaction({
      valueZatoshis: invoice.expectedAmountZatoshis,
    });

    const result = await verify(
      rpcClient({ mempoolTransactions: [rawTransaction] }),
    );

    expect(result.payment).toMatchObject({
      status: "pending",
      receivedAmountZec: "0.00000000",
      pendingOutput: {
        txid: rawTransaction.txid,
        amountZec: "0.10000001",
        expiryHeight: currentHeight + 10,
      },
    });
    expect(result.rpcEvidence.map((item) => item.method)).toEqual([
      "getblockcount",
      "getaddresstxids",
      "getrawmempool",
      "getrawtransaction",
    ]);
    expect(
      await repository.findPendingPaymentOutputsByInvoiceId(invoice.id),
    ).toHaveLength(1);
  });

  it("continues a pre-expiry scan when one mempool transaction vanishes", async () => {
    const vanished = pendingTransaction({
      txid: "e".repeat(64),
      valueZatoshis: 5_000n,
      address: otherAddress,
    });
    const matching = pendingTransaction({
      txid: "f".repeat(64),
      valueZatoshis: invoice.expectedAmountZatoshis,
    });

    const result = await verify(
      rpcClient({
        mempoolTransactions: [vanished, matching],
        mempoolRpcErrorTxids: [vanished.txid],
      }),
    );

    expect(result.payment).toMatchObject({
      status: "pending",
      pendingOutput: { txid: matching.txid },
    });
    expect(result.rpcEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "getrawtransaction",
          state: "error",
        }),
        expect.objectContaining({
          method: "getrawtransaction",
          state: "success",
        }),
      ]),
    );
  });

  it("continues a pre-expiry scan when one mempool response is malformed", async () => {
    const malformed = pendingTransaction({
      txid: "1".repeat(64),
      valueZatoshis: 5_000n,
      address: otherAddress,
    });
    const matching = pendingTransaction({
      txid: "2".repeat(64),
      valueZatoshis: invoice.expectedAmountZatoshis,
    });

    const result = await verify(
      rpcClient({
        mempoolTransactions: [malformed, matching],
        mempoolMalformedResponseTxids: [malformed.txid],
      }),
    );

    expect(result.payment).toMatchObject({
      status: "pending",
      pendingOutput: { txid: matching.txid },
    });
    expect(result.rpcEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "getrawtransaction",
          state: "error",
        }),
        expect.objectContaining({
          method: "getrawtransaction",
          state: "success",
        }),
      ]),
    );
  });

  it("continues a pre-expiry scan when one decoded candidate lacks expiry evidence", async () => {
    const decodedWithoutExpiry = pendingTransaction({
      txid: "3".repeat(64),
      valueZatoshis: 5_000n,
      address: otherAddress,
    });
    delete decodedWithoutExpiry.expiryheight;
    const matching = pendingTransaction({
      txid: "4".repeat(64),
      valueZatoshis: invoice.expectedAmountZatoshis,
    });

    const result = await verify(
      rpcClient({
        mempoolTransactions: [decodedWithoutExpiry, matching],
      }),
    );

    expect(result.payment).toMatchObject({
      status: "pending",
      pendingOutput: { txid: matching.txid },
    });
    expect(result.rpcEvidence.at(-1)).toMatchObject({
      method: "getrawtransaction",
      state: "success",
    });
  });

  it("retries rather than expiring from an incomplete post-expiry mempool scan", async () => {
    const vanished = pendingTransaction({
      valueZatoshis: invoice.expectedAmountZatoshis,
    });

    const result = await verifyInvoicePayment(invoice.id, {
      rpcClient: rpcClient({
        mempoolTransactions: [vanished],
        mempoolRpcErrorTxids: [vanished.txid],
      }),
      invoiceRepository: repository,
      now: () => new Date("2026-08-29T12:31:00.000Z"),
    });

    expect(result.payment).toMatchObject({
      status: "rpc_unavailable",
      lastKnownStatus: "waiting",
    });
    expect(await repository.findById(invoice.id)).toMatchObject({
      status: "waiting",
      receivedZatoshis: 0n,
    });
  });

  it("retries after expiry when a mempool candidate response is malformed", async () => {
    const malformed = pendingTransaction({
      valueZatoshis: invoice.expectedAmountZatoshis,
    });

    const result = await verifyInvoicePayment(invoice.id, {
      rpcClient: rpcClient({
        mempoolTransactions: [malformed],
        mempoolMalformedResponseTxids: [malformed.txid],
      }),
      invoiceRepository: repository,
      now: () => new Date("2026-08-29T12:31:00.000Z"),
    });

    expect(result.payment).toMatchObject({
      status: "rpc_unavailable",
      lastKnownStatus: "waiting",
    });
    expect(await repository.findById(invoice.id)).toMatchObject({
      status: "waiting",
      receivedZatoshis: 0n,
    });
  });

  it("keeps a pre-expiry transaction pending after the invoice timer ends", async () => {
    const rawTransaction = pendingTransaction({
      valueZatoshis: invoice.expectedAmountZatoshis,
    });
    await verify(rpcClient({ mempoolTransactions: [rawTransaction] }));

    const result = await verifyInvoicePayment(invoice.id, {
      rpcClient: rpcClient({ blockHeight: currentHeight + 1 }),
      invoiceRepository: repository,
      now: () => new Date("2026-08-29T12:31:00.000Z"),
    });

    expect(result.payment).toMatchObject({
      status: "pending_after_expiry",
      expiredAt: "2026-08-29T12:30:00.000Z",
      pendingOutput: { txid: rawTransaction.txid },
    });
  });

  it("credits a pre-expiry mempool transaction mined after invoice expiry", async () => {
    const txid = "d".repeat(64);
    await verify(
      rpcClient({
        mempoolTransactions: [
          pendingTransaction({
            txid,
            valueZatoshis: invoice.expectedAmountZatoshis,
          }),
        ],
      }),
    );

    const result = await verifyInvoicePayment(invoice.id, {
      rpcClient: rpcClient({
        blockHeight: currentHeight + 1,
        transactions: [
          transaction({
            txid,
            valueZatoshis: invoice.expectedAmountZatoshis,
            height: currentHeight + 1,
            blocktime: Date.parse("2026-08-29T12:31:00.000Z") / 1_000,
          }),
        ],
      }),
      invoiceRepository: repository,
      now: () => new Date("2026-08-29T12:32:00.000Z"),
    });

    expect(result.payment.status).toBe("paid");
    expect(
      await repository.findPendingPaymentOutputsByInvoiceId(invoice.id),
    ).toEqual([]);
  });

  it("expires an unmined payment only after its transaction expiry height", async () => {
    const rawTransaction = pendingTransaction({
      valueZatoshis: invoice.expectedAmountZatoshis,
      expiryHeight: currentHeight + 1,
    });
    await verify(rpcClient({ mempoolTransactions: [rawTransaction] }));

    const result = await verifyInvoicePayment(invoice.id, {
      rpcClient: rpcClient({ blockHeight: currentHeight + 1 }),
      invoiceRepository: repository,
      now: () => new Date("2026-08-29T12:31:00.000Z"),
    });

    expect(result.payment.status).toBe("expired");
    expect(
      await repository.findPendingPaymentOutputsByInvoiceId(invoice.id),
    ).toEqual([]);
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
