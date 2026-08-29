import { describe, expect, it, vi } from "vitest";

import { createInvoiceStatusGetHandler } from "@/app/api/invoices/[invoiceId]/status/route";
import {
  InvoiceNotFoundError,
  type VerifyPaymentResponse,
} from "@/lib/payments";

const verifiedResponse: VerifyPaymentResponse = {
  payment: {
    status: "paid",
    invoiceId: "invoice-id",
    expectedAmountZec: "0.10000001",
    receivedAmountZec: "0.10000001",
    observedAt: "2026-08-29T12:05:00.000Z",
    outputs: [
      {
        txid: "a".repeat(64),
        outputIndex: 0,
        amountZec: "0.10000001",
        amountZats: "10000001",
        blockHeight: 481_689,
        blockHash: "b".repeat(64),
        confirmations: 1,
      },
    ],
  },
  rpcEvidence: [
    {
      method: "getblockcount",
      state: "success",
      observedAt: "2026-08-29T12:05:00.000Z",
      latencyMs: 12,
    },
  ],
};

function context(invoiceId: string) {
  return { params: Promise.resolve({ invoiceId }) };
}

describe("GET /api/invoices/[invoiceId]/status", () => {
  it("returns live verification data with no-store security headers", async () => {
    const verifyPayment = vi.fn().mockResolvedValue(verifiedResponse);
    const response = await createInvoiceStatusGetHandler({ verifyPayment })(
      new Request("https://zecceipt.invalid/api/invoices/invoice-id/status"),
      context("invoice-id"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.json()).toEqual(verifiedResponse);
    expect(verifyPayment).toHaveBeenCalledWith("invoice-id");
  });

  it("returns safe validation and missing-invoice responses", async () => {
    const verifyPayment = vi
      .fn()
      .mockRejectedValueOnce(new InvoiceNotFoundError());
    const handler = createInvoiceStatusGetHandler({ verifyPayment });

    const invalid = await handler(
      new Request("https://zecceipt.invalid/api/invoices/x/status"),
      context(" "),
    );
    expect(invalid.status).toBe(400);
    expect(verifyPayment).not.toHaveBeenCalled();

    const missing = await handler(
      new Request("https://zecceipt.invalid/api/invoices/missing/status"),
      context("missing"),
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      error: { message: "Invoice not found." },
    });
  });

  it("does not leak internal errors", async () => {
    const response = await createInvoiceStatusGetHandler({
      verifyPayment: vi
        .fn()
        .mockRejectedValue(
          new Error("QUICKNODE_ZCASH_RPC_URL contained a private token"),
        ),
    })(
      new Request("https://zecceipt.invalid/api/invoices/invoice-id/status"),
      context("invoice-id"),
    );

    expect(response.status).toBe(503);
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain("QUICKNODE");
    expect(body).not.toContain("private token");
  });
});
