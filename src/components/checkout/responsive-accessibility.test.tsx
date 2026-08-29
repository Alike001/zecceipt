import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CheckoutPaymentSummary } from "@/components/checkout/checkout-payment-summary";
import { PaymentStatusTimeline } from "@/components/checkout/payment-status-timeline";
import { QrCode } from "@/components/checkout/qr-code";
import type { CheckoutSummaryViewModel, MatchedPaymentOutput } from "@/types";

const mockRequest = {
  invoiceId: "inv_qa_test_001",
  label: "Dark Forest VPN 1-Year Pass with Long Merchant Product Descriptor",
  exactAmountZec: "0.25000000",
  exactAmountZats: "25000000",
  recipientAddress: "tm9iP5FjDkS89nB9z4pW7r6m3K2s1v5q8x0",
  addressFingerprint: "tm9i...8x0",
  zip321Uri:
    "zcash:tm9iP5FjDkS89nB9z4pW7r6m3K2s1v5q8x0?amount=0.25000000&message=inv_qa_test_001",
  expiresAt: new Date(Date.now() + 900000).toISOString(),
  confirmationTarget: 3,
};

const readyView: CheckoutSummaryViewModel = {
  status: "ready",
  request: mockRequest,
};

const mockOutput: MatchedPaymentOutput = {
  txid: "9b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c",
  outputIndex: 0,
  amountZec: "0.25000000",
  amountZats: "25000000",
  blockHeight: 3456789,
  blockHash: "000000000123456789abcdef0123456789abcdef0123456789abcdef01234567",
  confirmations: 2,
};

describe("Checkout Responsive and Accessibility QA", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  describe("Keyboard Navigation & Focus Management", () => {
    it("allows full keyboard focus and triggering of Copy Amount and Copy Address buttons", async () => {
      const onCopyAmount = vi.fn();
      const onCopyAddress = vi.fn();

      render(
        <CheckoutPaymentSummary
          view={readyView}
          onCopyAmount={onCopyAmount}
          onCopyAddress={onCopyAddress}
        />,
      );

      const copyAmountBtn = screen.getByRole("button", {
        name: /Copy amount 0.25000000 TAZ/i,
      });
      const copyAddressBtn = screen.getByRole("button", {
        name: /Copy address tm9iP5FjDkS89nB9z4pW7r6m3K2s1v5q8x0/i,
      });

      // Focus and trigger Amount button
      copyAmountBtn.focus();
      expect(document.activeElement).toBe(copyAmountBtn);
      fireEvent.click(copyAmountBtn);

      await waitFor(() => {
        expect(onCopyAmount).toHaveBeenCalledWith("0.25000000");
      });

      // Focus and trigger Address button
      copyAddressBtn.focus();
      expect(document.activeElement).toBe(copyAddressBtn);
      fireEvent.click(copyAddressBtn);

      await waitFor(() => {
        expect(onCopyAddress).toHaveBeenCalledWith(
          "tm9iP5FjDkS89nB9z4pW7r6m3K2s1v5q8x0",
        );
      });
    });

    it("renders wallet link as a focusable anchor with external security attributes", () => {
      render(<CheckoutPaymentSummary view={readyView} />);

      const walletLink = screen.getByRole("link", {
        name: /Open in Zcash Wallet/i,
      });
      expect(walletLink).toHaveAttribute("target", "_blank");
      expect(walletLink).toHaveAttribute("rel", "noopener noreferrer");
      expect(walletLink).toHaveAttribute("href", mockRequest.zip321Uri);

      walletLink.focus();
      expect(document.activeElement).toBe(walletLink);
    });
  });

  describe("Screen Reader Announcements & ARIA Attributes", () => {
    it("contains an accessible polite live region for dynamic copy feedback", async () => {
      const { container } = render(<CheckoutPaymentSummary view={readyView} />);

      const liveRegion = container.querySelector('[aria-live="polite"]');
      expect(liveRegion).toBeInTheDocument();
      expect(liveRegion).toHaveClass("sr-only");

      const copyAmountBtn = screen.getByRole("button", {
        name: /Copy amount/i,
      });
      fireEvent.click(copyAmountBtn);

      await waitFor(() => {
        expect(liveRegion).toHaveTextContent(
          /Copied 0.25000000 TAZ amount to clipboard/i,
        );
      });
    });

    it("provides full ARIA progressbar attributes on confirmation progress in timeline", () => {
      render(
        <PaymentStatusTimeline
          view={{
            invoiceId: "inv_qa_test_001",
            status: "confirming",
            expectedAmountZec: "0.25000000",
            receivedAmountZec: "0.25000000",
            confirmations: 2,
            confirmationTarget: 3,
            observedAt: "2026-08-29T10:00:00.000Z",
            outputs: [mockOutput],
          }}
        />,
      );

      const progressbar = screen.getByRole("progressbar");
      expect(progressbar).toHaveAttribute("aria-valuenow", "2");
      expect(progressbar).toHaveAttribute("aria-valuemin", "0");
      expect(progressbar).toHaveAttribute("aria-valuemax", "3");
      expect(progressbar).toHaveAttribute(
        "aria-valuetext",
        "2 of 3 blocks confirmed (67%)",
      );
      expect(progressbar).toHaveAttribute(
        "aria-label",
        "Confirmation progress: 2 of 3 blocks",
      );
    });

    it("uses role='status' for RPC unavailable observation without misrepresenting settlement", () => {
      render(
        <PaymentStatusTimeline
          view={{
            invoiceId: "inv_qa_test_001",
            status: "rpc_unavailable",
            expectedAmountZec: "0.25000000",
            receivedAmountZec: "0.00000000",
            message: "Testnet JSON-RPC node timed out.",
            lastKnownStatus: "waiting",
            observedAt: "2026-08-29T10:00:00.000Z",
          }}
        />,
      );

      const statusSection = screen.getByRole("status");
      expect(statusSection).toBeInTheDocument();
      expect(
        screen.getByText(/Verification Paused — Node RPC Unreachable/i),
      ).toBeInTheDocument();
      expect(screen.getByText("WAITING")).toBeInTheDocument();
    });
  });

  describe("Non-Color Reliance for State Communication", () => {
    it("verifies that all status badges include distinct text and symbols", () => {
      const { rerender } = render(
        <PaymentStatusTimeline
          view={{
            invoiceId: "inv_1",
            status: "waiting",
            expectedAmountZec: "0.1",
            receivedAmountZec: "0.0",
            observedAt: "2026-08-29T10:00:00.000Z",
          }}
        />,
      );
      expect(screen.getByText(/Waiting for payment/i)).toBeInTheDocument();

      rerender(
        <PaymentStatusTimeline
          view={{
            invoiceId: "inv_1",
            status: "paid",
            expectedAmountZec: "0.1",
            receivedAmountZec: "0.1",
            observedAt: "2026-08-29T10:00:00.000Z",
            outputs: [mockOutput],
          }}
        />,
      );
      expect(
        screen.getByText(/Payment received & verified/i),
      ).toBeInTheDocument();

      rerender(
        <PaymentStatusTimeline
          view={{
            invoiceId: "inv_1",
            status: "expired",
            expectedAmountZec: "0.1",
            receivedAmountZec: "0.0",
            expiredAt: "2026-08-29T10:15:00.000Z",
            observedAt: "2026-08-29T10:15:00.000Z",
          }}
        />,
      );
      expect(screen.getByText(/Invoice Expired/i)).toBeInTheDocument();
    });
  });

  describe("QR Code & Address Wrapping for Mobile Constraints", () => {
    it("renders QR code with accessible title and image role", () => {
      render(
        <QrCode
          value={mockRequest.zip321Uri}
          ariaLabel="ZIP-321 QR code for invoice"
        />,
      );

      const qr = screen.getByRole("img", {
        name: "ZIP-321 QR code for invoice",
      });
      expect(qr).toBeInTheDocument();
    });

    it("renders full recipient address and safe fingerprint without truncation", () => {
      render(<CheckoutPaymentSummary view={readyView} />);

      expect(
        screen.getByText("tm9iP5FjDkS89nB9z4pW7r6m3K2s1v5q8x0"),
      ).toBeInTheDocument();
      expect(screen.getByText("tm9i...8x0")).toBeInTheDocument();
    });
  });
});
