import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PaymentStatusTimeline } from "@/components/checkout/payment-status-timeline";
import type { MatchedPaymentOutput } from "@/types";

const mockOutput1: MatchedPaymentOutput = {
  txid: "9b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c",
  outputIndex: 0,
  amountZec: "0.25000000",
  amountZats: "25000000",
  blockHeight: 3456789,
  blockHash: "000000000123456789abcdef0123456789abcdef0123456789abcdef01234567",
  confirmations: 2,
};

const mockOutput2: MatchedPaymentOutput = {
  txid: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
  outputIndex: 1,
  amountZec: "0.10000000",
  amountZats: "10000000",
  blockHeight: 3456790,
  blockHash: "000000000abcdef0123456789abcdef0123456789abcdef0123456789abcdef0",
  confirmations: 1,
};

describe("PaymentStatusTimeline", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders waiting state with live watching indicator", () => {
    render(
      <PaymentStatusTimeline
        view={{
          invoiceId: "inv_123",
          status: "waiting",
          expectedAmountZec: "0.50000000",
          receivedAmountZec: "0.00000000",
          observedAt: "2026-08-29T10:00:00.000Z",
        }}
      />,
    );

    expect(screen.getByText(/Waiting for payment/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Watching Testnet for incoming transaction/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/0.50000000 TAZ/)).toBeInTheDocument();
  });

  it("renders partial payment state with shortfall details", () => {
    render(
      <PaymentStatusTimeline
        view={{
          invoiceId: "inv_123",
          status: "partial",
          expectedAmountZec: "0.50000000",
          receivedAmountZec: "0.25000000",
          shortfallAmountZec: "0.25000000",
          observedAt: "2026-08-29T10:05:00.000Z",
          outputs: [mockOutput1],
        }}
      />,
    );

    expect(
      screen.getAllByText(/Partial payment/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Partial Payment Detected")).toBeInTheDocument();
    expect(screen.getAllByText(/0.25000000 TAZ/).length).toBeGreaterThanOrEqual(
      1,
    );
    expect(
      screen.getByText(
        "9b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c",
      ),
    ).toBeInTheDocument();
  });

  it("renders confirming state with plain-language progress bar and percentages", () => {
    render(
      <PaymentStatusTimeline
        view={{
          invoiceId: "inv_123",
          status: "confirming",
          expectedAmountZec: "0.25000000",
          receivedAmountZec: "0.25000000",
          confirmations: 2,
          confirmationTarget: 3,
          observedAt: "2026-08-29T10:08:00.000Z",
          outputs: [mockOutput1],
        }}
      />,
    );

    expect(screen.getByText(/Confirming \(2\/3\)/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Transaction Detected — Confirming On-Chain/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 of 3 blocks \(67%\)/i)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "2",
    );
  });

  it("renders paid state with full settlement verification", () => {
    render(
      <PaymentStatusTimeline
        view={{
          invoiceId: "inv_123",
          status: "paid",
          expectedAmountZec: "0.25000000",
          receivedAmountZec: "0.25000000",
          observedAt: "2026-08-29T10:15:00.000Z",
          outputs: [mockOutput1],
        }}
      />,
    );

    expect(
      screen.getByText(/Payment received & verified/i),
    ).toBeInTheDocument();
  });

  it("renders overpaid state with expected vs received breakdown", () => {
    render(
      <PaymentStatusTimeline
        view={{
          invoiceId: "inv_123",
          status: "overpaid",
          expectedAmountZec: "0.25000000",
          receivedAmountZec: "0.35000000",
          observedAt: "2026-08-29T10:15:00.000Z",
          outputs: [mockOutput1, mockOutput2],
        }}
      />,
    );

    expect(
      screen.getByText(/Payment Received \(Overpayment Recorded\)/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Matched Testnet Outputs (2)")).toBeInTheDocument();
  });

  it("renders expired state when 0 funds were received", () => {
    render(
      <PaymentStatusTimeline
        view={{
          invoiceId: "inv_123",
          status: "expired",
          expectedAmountZec: "0.50000000",
          receivedAmountZec: "0.00000000",
          expiredAt: "2026-08-29T11:00:00.000Z",
          observedAt: "2026-08-29T11:01:00.000Z",
        }}
      />,
    );

    expect(screen.getByText("Invoice Expired")).toBeInTheDocument();
    expect(screen.getByText(/with 0 TAZ received/i)).toBeInTheDocument();
  });

  it("renders expired_partial state with received and shortfall records", () => {
    render(
      <PaymentStatusTimeline
        view={{
          invoiceId: "inv_123",
          status: "expired_partial",
          expectedAmountZec: "0.50000000",
          receivedAmountZec: "0.25000000",
          shortfallAmountZec: "0.25000000",
          expiredAt: "2026-08-29T11:00:00.000Z",
          observedAt: "2026-08-29T11:01:00.000Z",
          outputs: [mockOutput1],
        }}
      />,
    );

    expect(
      screen.getByText(/Invoice Expired with Partial Funds/i),
    ).toBeInTheDocument();
  });

  it("renders rpc_unavailable state with verification paused, never showing false paid or unpaid claims", () => {
    render(
      <PaymentStatusTimeline
        view={{
          invoiceId: "inv_123",
          status: "rpc_unavailable",
          expectedAmountZec: "0.50000000",
          receivedAmountZec: "0.25000000",
          message: "The Testnet RPC node timed out during block fetch.",
          lastKnownStatus: "confirming",
          observedAt: "2026-08-29T10:20:00.000Z",
        }}
      />,
    );

    expect(
      screen.getByText(/Verification Paused — Node RPC Unreachable/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The Testnet RPC node timed out during block fetch."),
    ).toBeInTheDocument();
    expect(screen.getByText("CONFIRMING")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Payment progress steps" }),
    ).toHaveAttribute("data-verification-paused", "true");
    expect(
      screen.queryByText(/payment received & verified/i),
    ).not.toBeInTheDocument();
  });

  it("copies transaction hash when Copy TxID is clicked", async () => {
    render(
      <PaymentStatusTimeline
        view={{
          invoiceId: "inv_123",
          status: "paid",
          expectedAmountZec: "0.25000000",
          receivedAmountZec: "0.25000000",
          observedAt: "2026-08-29T10:15:00.000Z",
          outputs: [mockOutput1],
        }}
      />,
    );

    const copyBtn = screen.getByRole("button", {
      name: `Copy transaction ID ${mockOutput1.txid}`,
    });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        mockOutput1.txid,
      );
      expect(screen.getByText("✓ Copied")).toBeInTheDocument();
    });
  });

  it("reports a failed transaction copy without claiming success", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(
      new Error("Clipboard permission denied"),
    );

    render(
      <PaymentStatusTimeline
        view={{
          invoiceId: "inv_123",
          status: "paid",
          expectedAmountZec: "0.25000000",
          receivedAmountZec: "0.25000000",
          observedAt: "2026-08-29T10:15:00.000Z",
          outputs: [mockOutput1],
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: `Copy transaction ID ${mockOutput1.txid}`,
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "Unable to copy the transaction ID. Select and copy it manually.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText("✓ Copied")).not.toBeInTheDocument();
    });
  });

  it("renders RPC evidence methods when provided", () => {
    render(
      <PaymentStatusTimeline
        view={{
          invoiceId: "inv_123",
          status: "paid",
          expectedAmountZec: "0.25000000",
          receivedAmountZec: "0.25000000",
          observedAt: "2026-08-29T10:15:00.000Z",
          outputs: [mockOutput1],
        }}
        rpcEvidence={[
          {
            method: "getaddresstxids",
            state: "success",
            latencyMs: 14,
            observedAt: "2026-08-29T10:15:00.000Z",
          },
          {
            method: "getrawtransaction",
            state: "success",
            latencyMs: 22,
            observedAt: "2026-08-29T10:15:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getByText("Zcash RPC Evidence Verified")).toBeInTheDocument();
    expect(screen.getByText("getaddresstxids")).toBeInTheDocument();
    expect(screen.getByText("getrawtransaction")).toBeInTheDocument();
  });

  it("reports RPC evidence errors without calling them verified", () => {
    render(
      <PaymentStatusTimeline
        view={{
          invoiceId: "inv_123",
          status: "rpc_unavailable",
          expectedAmountZec: "0.25000000",
          receivedAmountZec: "0.25000000",
          message: "RPC unavailable",
          lastKnownStatus: "paid",
          observedAt: "2026-08-29T10:15:00.000Z",
        }}
        rpcEvidence={[
          {
            method: "getrawtransaction",
            state: "error",
            latencyMs: null,
            observedAt: "2026-08-29T10:15:00.000Z",
          },
        ]}
      />,
    );

    expect(
      screen.getByText("Zcash RPC Evidence — Errors Reported"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("getrawtransaction: error"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Zcash RPC Evidence Verified"),
    ).not.toBeInTheDocument();
  });
});
