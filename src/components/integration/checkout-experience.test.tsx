import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CheckoutExperience } from "@/components/integration/checkout-experience";
import type {
  CheckoutPaymentRequest,
  PaymentStatusViewModel,
  ReceiptViewModel,
} from "@/types";

const request: CheckoutPaymentRequest = {
  invoiceId: "invoice-checkout",
  label: "Coffee order",
  recipientAddress: "tmYXBYJj1K7vhejSec5osXK2QsGa5MTisUQ",
  addressFingerprint: "tmYXBY…MTisUQ",
  exactAmountZec: "0.10000001",
  exactAmountZats: "10000001",
  zip321Uri:
    "zcash:tmYXBYJj1K7vhejSec5osXK2QsGa5MTisUQ?amount=0.10000001&label=Coffee%20order",
  expiresAt: "2026-08-29T12:30:00.000Z",
  confirmationTarget: 1,
  network: "testnet",
};

const waiting: PaymentStatusViewModel = {
  status: "waiting",
  invoiceId: request.invoiceId,
  expectedAmountZec: request.exactAmountZec,
  receivedAmountZec: "0.00000000",
  observedAt: "2026-08-29T12:00:00.000Z",
};

const paid: PaymentStatusViewModel = {
  status: "paid",
  invoiceId: request.invoiceId,
  expectedAmountZec: request.exactAmountZec,
  receivedAmountZec: request.exactAmountZec,
  observedAt: "2026-08-29T12:05:00.000Z",
  outputs: [
    {
      txid: "a".repeat(64),
      outputIndex: 0,
      amountZec: request.exactAmountZec,
      amountZats: request.exactAmountZats,
      blockHeight: 481_689,
      blockHash: "b".repeat(64),
      confirmations: 1,
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CheckoutExperience", () => {
  it("polls the same-origin status API and renders a verified receipt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        payment: paid,
        rpcEvidence: [
          {
            method: "getrawtransaction",
            state: "success",
            observedAt: paid.observedAt,
            latencyMs: 18,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CheckoutExperience
        request={request}
        initialPayment={waiting}
        initialReceipt={null}
      />,
    );

    expect(
      screen.getByRole("img", {
        name: `ZIP-321 QR code for invoice ${request.invoiceId}`,
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Verified receipt" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Payment Received & Verified")).toBeInTheDocument();
    expect(screen.getByLabelText("Payment request settled")).toHaveTextContent(
      "Paid",
    );
    expect(
      screen.queryByRole("link", { name: "Open in Zcash Wallet" }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/invoices/invoice-checkout/status",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(
      fetchMock.mock.calls.every(([url]) => !String(url).startsWith("http")),
    ).toBe(true);
  });

  it("shows an honest paused state when its internal API is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { message: "Status unavailable." } },
            { status: 503 },
          ),
        ),
    );

    render(
      <CheckoutExperience
        request={request}
        initialPayment={waiting}
        initialReceipt={null}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("Verification Paused — Node RPC Unreachable"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("Payment Received & Verified")).toBeNull();
  });

  it("renders a persisted receipt immediately after refresh", () => {
    const receipt: ReceiptViewModel = {
      invoiceId: request.invoiceId,
      label: request.label,
      status: "paid",
      expectedAmountZec: request.exactAmountZec,
      paidAmountZec: request.exactAmountZec,
      network: "testnet",
      settledAt: "2026-08-29T12:05:00.000Z",
      outputs: paid.status === "paid" ? paid.outputs : [],
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ payment: paid, rpcEvidence: [] })),
    );

    render(
      <CheckoutExperience
        request={request}
        initialPayment={paid}
        initialReceipt={receipt}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Verified receipt" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Aug 29, 2026/)).toBeInTheDocument();
    expect(screen.getByLabelText("Payment request settled")).toHaveTextContent(
      "Paid",
    );
  });
});
