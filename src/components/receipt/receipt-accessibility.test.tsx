import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReceiptCard } from "@/components/receipt/receipt-card";
import type { ReceiptViewModel } from "@/types";

const mockReceipt: ReceiptViewModel = {
  invoiceId: "inv_rec_qa_999",
  label: "Secure Node RPC Subscription for 12 Months",
  status: "paid",
  expectedAmountZec: "1.25000000",
  paidAmountZec: "1.25000000",
  network: "testnet",
  settledAt: "2026-08-29T14:00:00.000Z",
  outputs: [
    {
      txid: "e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5",
      outputIndex: 0,
      amountZec: "1.25000000",
      amountZats: "125000000",
      blockHeight: 3456999,
      blockHash:
        "000000000abcdef123456789abcdef123456789abcdef123456789abcdef12345678",
      confirmations: 12,
    },
  ],
};

describe("Receipt Responsive and Accessibility QA", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("provides valid semantic structure and landmark associations", () => {
    const { container } = render(<ReceiptCard receipt={mockReceipt} />);

    const article = screen.getByRole("article");
    expect(article).toBeInTheDocument();

    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent(
      "Secure Node RPC Subscription for 12 Months",
    );
    expect(article).toHaveAttribute("aria-labelledby", heading.id);

    const definitionList = container.querySelector("dl");
    expect(definitionList).toBeInTheDocument();
    expect(definitionList).toHaveAttribute("aria-label", "Settlement details");
  });

  it("handles keyboard navigation and triggers full receipt copy", async () => {
    const onCopyDetails = vi.fn();
    render(<ReceiptCard receipt={mockReceipt} onCopyDetails={onCopyDetails} />);

    const copyAllBtn = screen.getByRole("button", {
      name: /Copy entire receipt summary/i,
    });

    copyAllBtn.focus();
    expect(document.activeElement).toBe(copyAllBtn);

    fireEvent.click(copyAllBtn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
      expect(onCopyDetails).toHaveBeenCalledWith(mockReceipt);
      expect(screen.getByText("✓ Receipt Copied")).toBeInTheDocument();
    });
  });

  it("announces dynamic copy feedback via polite live region", async () => {
    const { container } = render(<ReceiptCard receipt={mockReceipt} />);

    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();

    const copyTxidBtn = screen.getByRole("button", {
      name: `Copy transaction ID ${mockReceipt.outputs[0].txid}`,
    });
    fireEvent.click(copyTxidBtn);

    await waitFor(() => {
      expect(liveRegion).toHaveTextContent(
        /Copied transaction hash to clipboard/i,
      );
    });
  });

  it("ensures long transaction hashes and IDs are present without truncation", () => {
    render(<ReceiptCard receipt={mockReceipt} />);

    expect(
      screen.getByText(
        "e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("inv_rec_qa_999")).toBeInTheDocument();
  });
});
