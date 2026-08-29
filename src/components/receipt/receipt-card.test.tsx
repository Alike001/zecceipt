import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReceiptCard } from "@/components/receipt/receipt-card";
import type { ReceiptViewModel } from "@/types";

const mockReceipt: ReceiptViewModel = {
  invoiceId: "inv_rec_992144",
  label: "Dark Forest VPN 1-Year Pass",
  status: "paid",
  expectedAmountZec: "0.45000000",
  paidAmountZec: "0.45000000",
  network: "testnet",
  settledAt: "2026-08-29T12:30:00.000Z",
  outputs: [
    {
      txid: "3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e",
      outputIndex: 0,
      amountZec: "0.45000000",
      amountZats: "45000000",
      blockHeight: 3456890,
      blockHash:
        "00000000056789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      confirmations: 6,
    },
  ],
};

const mockOverpaidReceipt: ReceiptViewModel = {
  invoiceId: "inv_rec_992145",
  label: "Mesh Router Node Hosting",
  status: "overpaid",
  expectedAmountZec: "0.50000000",
  paidAmountZec: "0.60000000",
  network: "testnet",
  settledAt: "2026-08-29T12:45:00.000Z",
  outputs: [
    {
      txid: "7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b",
      outputIndex: 0,
      amountZec: "0.60000000",
      amountZats: "60000000",
      blockHeight: 3456895,
      blockHash:
        "0000000009abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123",
      confirmations: 4,
    },
  ],
};

describe("ReceiptCard", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders verified receipt with invoice details, settled amount, and on-chain output specs", () => {
    render(<ReceiptCard receipt={mockReceipt} />);

    // Header & label
    expect(screen.getByText("Dark Forest VPN 1-Year Pass")).toBeInTheDocument();
    expect(screen.getByText("Payment Received")).toBeInTheDocument();

    // Financial breakdown
    expect(screen.getAllByText(/0.45000000/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("0.45000000 TAZ")).toBeInTheDocument();
    expect(screen.getByText("Zcash Testnet (TAZ)")).toBeInTheDocument();

    // Output specs
    expect(
      screen.getByText(
        "3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("output #0")).toBeInTheDocument();
    expect(screen.getByText("#3,456,890")).toBeInTheDocument();
    expect(screen.getByText("6 confirms")).toBeInTheDocument();
  });

  it("renders overpaid status indicator accurately", () => {
    render(<ReceiptCard receipt={mockOverpaidReceipt} />);

    expect(screen.getByText("Payment Received (Overpaid)")).toBeInTheDocument();
    expect(screen.getByText("0.50000000 TAZ")).toBeInTheDocument();
    expect(screen.getAllByText(/0.60000000/).length).toBeGreaterThanOrEqual(1);
  });

  it("copies transaction ID to clipboard", async () => {
    render(<ReceiptCard receipt={mockReceipt} />);

    const copyTxidBtn = screen.getByRole("button", {
      name: `Copy transaction ID ${mockReceipt.outputs[0].txid}`,
    });
    fireEvent.click(copyTxidBtn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        mockReceipt.outputs[0].txid,
      );
      expect(screen.getByText("✓ Copied")).toBeInTheDocument();
    });
  });

  it("copies full receipt details and triggers onCopyDetails callback", async () => {
    const onCopyDetails = vi.fn();
    render(<ReceiptCard receipt={mockReceipt} onCopyDetails={onCopyDetails} />);

    const copyAllBtn = screen.getByRole("button", {
      name: "Copy entire receipt summary",
    });
    fireEvent.click(copyAllBtn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
      expect(onCopyDetails).toHaveBeenCalledWith(mockReceipt);
      expect(screen.getByText("✓ Receipt Copied")).toBeInTheDocument();
    });
  });
});
