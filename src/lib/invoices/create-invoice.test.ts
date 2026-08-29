// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/db";
import {
  createInvoice,
  CreateInvoiceInputError,
  CreateInvoiceUnavailableError,
  parseCreateInvoiceRequest,
} from "@/lib/invoices/create-invoice";
import { InvoiceRepository } from "@/lib/invoices/repository";
import type { RpcCallResult } from "@/lib/zcash/rpc-types";
import type { ZcashRpcClient } from "@/lib/zcash/rpc-client";
import type { ZcashRpcMethod } from "@/types";
import { createTestDatabase } from "@/test/pglite-database";

const validRequest = {
  recipientAddress: "tmYXBYJj1K7vhejSec5osXK2QsGa5MTisUQ",
  amountZec: "0.1",
  label: "Coffee order",
  expiryMinutes: "30",
  confirmationTarget: "1",
};

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
      observedAt: "2026-08-29T12:00:00.000Z",
      latencyMs: 10,
    },
  };
}

function createRpcClient(chain = "test", isValid = true) {
  const call = vi.fn(async (method: ZcashRpcMethod) => {
    if (method === "validateaddress") {
      return rpcResult("validateaddress", {
        isvalid: isValid,
        ...(isValid ? { address: validRequest.recipientAddress } : {}),
      });
    }
    if (method === "getblockchaininfo") {
      return rpcResult("getblockchaininfo", {
        chain,
        blocks: 481_688,
        headers: 481_688,
        verificationprogress: 1,
        bestblockhash: "b".repeat(64),
      });
    }
    return rpcResult("getblockcount", 481_688);
  });
  return { call } as unknown as Pick<ZcashRpcClient, "call">;
}

describe("create invoice service", () => {
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

  it("validates live Testnet state, saves tip height, and separates public and private data", async () => {
    const rpcClient = createRpcClient();
    const response = await createInvoice(validRequest, {
      rpcClient,
      invoiceRepository: repository,
      managementSecret: "m".repeat(32),
      now: () => new Date("2026-08-29T12:00:00.000Z"),
      invoiceIdFactory: () => "invoice-public-id",
      managementTokenFactory: () => "private-management-token",
    });

    expect(response.publicCheckout).toEqual({
      invoiceId: "invoice-public-id",
      checkoutPath: "/checkout/invoice-public-id",
      recipientAddress: validRequest.recipientAddress,
      label: "Coffee order",
      baseAmountZec: "0.10000000",
      exactAmountZec: "0.10000001",
      amountCodeZats: "1",
      creationHeight: 481_688,
      expiresAt: "2026-08-29T12:30:00.000Z",
      confirmationTarget: 1,
      network: "testnet",
      createdAt: "2026-08-29T12:00:00.000Z",
    });
    expect(response.merchantManagement).toEqual({
      invoiceId: "invoice-public-id",
      managementPath: "/merchant/invoices/invoice-public-id",
      managementToken: "private-management-token",
    });
    expect(JSON.stringify(response.publicCheckout)).not.toContain(
      "private-management-token",
    );
    expect(response.rpcEvidence.map((item) => item.method)).toEqual([
      "validateaddress",
      "getblockchaininfo",
      "getblockcount",
    ]);
    expect(rpcClient.call).toHaveBeenCalledTimes(3);

    const persisted = await repository.findById("invoice-public-id");
    expect(persisted?.managementTokenHash).not.toBe("private-management-token");
    expect(persisted?.creationHeight).toBe(481_688);
  });

  it.each([
    ["zero", { amountZec: "0" }],
    ["negative", { amountZec: "-1" }],
    ["exponent", { amountZec: "1e-8" }],
    ["comma", { amountZec: "1,000" }],
    ["excessive precision", { amountZec: "0.000000001" }],
    ["overflow", { amountZec: "21000000" }],
    ["malformed", { amountZec: "not-money" }],
    ["Mainnet", { recipientAddress: `t1${"a".repeat(33)}` }],
    ["shielded", { recipientAddress: `ztestsapling${"a".repeat(40)}` }],
    ["Unified", { recipientAddress: `utest${"a".repeat(60)}` }],
  ])("rejects %s input before persistence", async (_name, override) => {
    await expect(
      createInvoice(
        { ...validRequest, ...override },
        {
          rpcClient: createRpcClient(),
          invoiceRepository: repository,
          managementSecret: "m".repeat(32),
        },
      ),
    ).rejects.toBeInstanceOf(CreateInvoiceInputError);
  });

  it("rejects an address that the live node reports invalid", async () => {
    await expect(
      createInvoice(validRequest, {
        rpcClient: createRpcClient("test", false),
        invoiceRepository: repository,
        managementSecret: "m".repeat(32),
      }),
    ).rejects.toBeInstanceOf(CreateInvoiceInputError);
  });

  it("fails closed when the RPC endpoint is not on Testnet", async () => {
    await expect(
      createInvoice(validRequest, {
        rpcClient: createRpcClient("main"),
        invoiceRepository: repository,
        managementSecret: "m".repeat(32),
      }),
    ).rejects.toBeInstanceOf(CreateInvoiceUnavailableError);
  });

  it("requires bounded integer expiry and confirmation values", () => {
    expect(() =>
      parseCreateInvoiceRequest({ ...validRequest, expiryMinutes: "1e2" }),
    ).toThrow(CreateInvoiceInputError);
    expect(() =>
      parseCreateInvoiceRequest({ ...validRequest, confirmationTarget: "0" }),
    ).toThrow(CreateInvoiceInputError);
  });
});
