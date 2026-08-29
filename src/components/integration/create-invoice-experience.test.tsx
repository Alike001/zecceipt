import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreateInvoiceExperience } from "@/components/integration/create-invoice-experience";
import type { CreateInvoiceResponse } from "@/lib/invoices/create-invoice";

const address = "tmYXBYJj1K7vhejSec5osXK2QsGa5MTisUQ";
const createdInvoice: CreateInvoiceResponse = {
  publicCheckout: {
    invoiceId: "invoice-created",
    checkoutPath: "/checkout/invoice-created",
    recipientAddress: address,
    label: "Coffee order",
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
    invoiceId: "invoice-created",
    managementPath: "/merchant/invoices/invoice-created",
    managementToken: "not-persisted-by-the-browser",
  },
  rpcEvidence: [],
};

describe("CreateInvoiceExperience", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("validates and creates an invoice through same-origin APIs", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/addresses/validate") {
        return Response.json({
          status: "valid",
          message: "Address verified by the Zcash Testnet node.",
        });
      }
      if (url === "/api/invoices") {
        return Response.json(createdInvoice, { status: 201 });
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CreateInvoiceExperience />);

    const addressInput = screen.getByLabelText("Merchant Testnet address");
    fireEvent.change(addressInput, { target: { value: address } });
    fireEvent.blur(addressInput);
    expect(
      await screen.findByText("Address verified by the Zcash Testnet node."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Amount"), {
      target: { value: "0.1" },
    });
    fireEvent.change(screen.getByLabelText("Invoice label or description"), {
      target: { value: "Coffee order" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create invoice" }));

    expect(await screen.findByText("Invoice created.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open checkout →" }),
    ).toHaveAttribute("href", "/checkout/invoice-created");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.every(([url]) => String(url).startsWith("/api/")),
    ).toBe(true);
    expect(localStorage.getItem("zecceipt:recent-invoices:v1")).not.toContain(
      "not-persisted-by-the-browser",
    );
  });

  it("restores recent invoice state and refreshes it from the status API", async () => {
    localStorage.setItem(
      "zecceipt:recent-invoices:v1",
      JSON.stringify([
        {
          invoiceId: "persisted-invoice",
          label: "Saved order",
          exactAmountZec: "0.20000002",
          status: "waiting",
          createdAt: "2026-08-29T12:00:00.000Z",
          checkoutUrl: "/checkout/persisted-invoice",
        },
      ]),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          payment: {
            status: "paid",
            invoiceId: "persisted-invoice",
            expectedAmountZec: "0.20000002",
            receivedAmountZec: "0.20000002",
            observedAt: "2026-08-29T12:05:00.000Z",
            outputs: [],
          },
          rpcEvidence: [],
        }),
      ),
    );

    render(<CreateInvoiceExperience />);

    expect(await screen.findByText("Saved order")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Paid")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Saved order/i })).toHaveAttribute(
      "href",
      "/checkout/persisted-invoice",
    );
  });
});
