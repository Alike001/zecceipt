import { describe, expect, it, vi } from "vitest";

import { createInvoicePostHandler } from "@/app/api/invoices/route";
import {
  CreateInvoiceInputError,
  CreateInvoiceUnavailableError,
  type CreateInvoiceResponse,
} from "@/lib/invoices";

const createdResponse: CreateInvoiceResponse = {
  publicCheckout: {
    invoiceId: "invoice-id",
    checkoutPath: "/checkout/invoice-id",
    recipientAddress: "tmYXBYJj1K7vhejSec5osXK2QsGa5MTisUQ",
    label: "Order",
    baseAmountZec: "0.10000000",
    exactAmountZec: "0.10000001",
    amountCodeZats: "1",
    creationHeight: 481_688,
    expiresAt: "2026-08-29T12:30:00.000Z",
    confirmationTarget: 1,
    network: "testnet",
    createdAt: "2026-08-29T12:00:00.000Z",
  },
  merchantManagement: {
    invoiceId: "invoice-id",
    managementPath: "/merchant/invoices/invoice-id",
    managementToken: "private-token",
  },
  rpcEvidence: [],
};

function request(body: string, contentType = "application/json") {
  return new Request("https://zecceipt.invalid/api/invoices", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
}

describe("POST /api/invoices", () => {
  it("returns a created invoice with no-store security headers", async () => {
    const createInvoice = vi.fn().mockResolvedValue(createdResponse);
    const response = await createInvoicePostHandler({ createInvoice })(
      request(JSON.stringify({ amountZec: "0.1" })),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.json()).toEqual(createdResponse);
    expect(createInvoice).toHaveBeenCalledWith({ amountZec: "0.1" });
  });

  it("rejects non-JSON, malformed, and oversized requests", async () => {
    const handler = createInvoicePostHandler({
      createInvoice: vi.fn().mockResolvedValue(createdResponse),
    });

    expect((await handler(request("{}", "text/plain"))).status).toBe(415);
    expect((await handler(request("{"))).status).toBe(400);
    expect(
      (await handler(request(JSON.stringify("x".repeat(5_000))))).status,
    ).toBe(413);
  });

  it("maps safe validation and unavailable errors without leaking internals", async () => {
    const invalidResponse = await createInvoicePostHandler({
      createInvoice: vi
        .fn()
        .mockRejectedValue(
          new CreateInvoiceInputError("Invalid amount.", "amountZec"),
        ),
    })(request("{}"));
    expect(invalidResponse.status).toBe(422);
    expect(await invalidResponse.json()).toEqual({
      error: { message: "Invalid amount.", field: "amountZec" },
    });

    const unavailableResponse = await createInvoicePostHandler({
      createInvoice: vi
        .fn()
        .mockRejectedValue(new CreateInvoiceUnavailableError()),
    })(request("{}"));
    expect(unavailableResponse.status).toBe(503);
    expect(JSON.stringify(await unavailableResponse.json())).not.toContain(
      "DATABASE_URL",
    );
  });
});
