import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CheckoutPaymentSummary } from "@/components/checkout/checkout-payment-summary";
import type { CheckoutPaymentRequest } from "@/types";

const mockRequest: CheckoutPaymentRequest = {
  invoiceId: "inv_test_884920",
  label: "Order #884920 - Espresso Subscription",
  recipientAddress: "tm9iZ2fN6E4h9H5Zz5K8y1X2w3V4u5T6s7R",
  addressFingerprint: "tm9i...s7R",
  exactAmountZec: "0.25000000",
  exactAmountZats: "25000000",
  zip321Uri:
    "zcash:tm9iZ2fN6E4h9H5Zz5K8y1X2w3V4u5T6s7R?amount=0.25000000&message=Order%20884920",
  expiresAt: "2026-08-29T12:00:00.000Z",
  confirmationTarget: 3,
  network: "testnet",
};

describe("CheckoutPaymentSummary", () => {
  beforeEach(() => {
    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders ready payment request with exact amount, zatoshis, address, fingerprint and QR code", () => {
    render(
      <CheckoutPaymentSummary
        view={{
          status: "ready",
          request: mockRequest,
        }}
        remainingSeconds={600}
      />,
    );

    // Label and status
    expect(
      screen.getByText("Order #884920 - Espresso Subscription"),
    ).toBeInTheDocument();
    expect(screen.getByText("10:00")).toBeInTheDocument();

    // Exact amount and zatoshis
    expect(screen.getByText(/0.25000000/)).toBeInTheDocument();
    expect(screen.getByText("TAZ")).toBeInTheDocument();
    expect(screen.getByText("25,000,000 zatoshis")).toBeInTheDocument();

    // Recipient address and fingerprint
    expect(
      screen.getByText("tm9iZ2fN6E4h9H5Zz5K8y1X2w3V4u5T6s7R"),
    ).toBeInTheDocument();
    expect(screen.getByText("tm9i...s7R")).toBeInTheDocument();

    // Confirmation target and Testnet notice
    expect(screen.getByText("3 Blocks")).toBeInTheDocument();
    expect(screen.getByText(/Zcash Testnet/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /MVP confirms payments made to transparent addresses only/i,
      ),
    ).toBeInTheDocument();

    // Default QR SVG
    expect(
      screen.getByLabelText("ZIP-321 QR code for invoice inv_test_884920"),
    ).toBeInTheDocument();

    // Wallet link
    const walletLink = screen.getByRole("link", {
      name: /open in zcash wallet/i,
    });
    expect(walletLink).toHaveAttribute("href", mockRequest.zip321Uri);
  });

  it("renders loading state with accessible aria-busy indicator", () => {
    render(
      <CheckoutPaymentSummary
        view={{
          status: "loading",
        }}
      />,
    );

    const section = screen.getByLabelText(/loading invoice/i);
    expect(section).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Calculating expiry…")).toBeInTheDocument();
  });

  it("renders unavailable state with clear message without claiming unpaid or paid", () => {
    render(
      <CheckoutPaymentSummary
        view={{
          status: "unavailable",
          message: "RPC daemon is currently unreachable on Testnet node.",
        }}
      />,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Verification Paused")).toBeInTheDocument();
    expect(
      screen.getByText("RPC daemon is currently unreachable on Testnet node."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/unpaid/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/payment received/i)).not.toBeInTheDocument();
  });

  it("copies address and triggers onCopyAddress callback", async () => {
    const onCopyAddress = vi.fn();

    render(
      <CheckoutPaymentSummary
        view={{
          status: "ready",
          request: mockRequest,
        }}
        onCopyAddress={onCopyAddress}
      />,
    );

    const copyAddressBtn = screen.getByRole("button", {
      name: `Copy address ${mockRequest.recipientAddress}`,
    });
    fireEvent.click(copyAddressBtn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        mockRequest.recipientAddress,
      );
      expect(onCopyAddress).toHaveBeenCalledWith(mockRequest.recipientAddress);
      expect(screen.getByText("✓ Copied")).toBeInTheDocument();
    });
  });

  it("copies exact amount and triggers onCopyAmount callback", async () => {
    const onCopyAmount = vi.fn();

    render(
      <CheckoutPaymentSummary
        view={{
          status: "ready",
          request: mockRequest,
        }}
        onCopyAmount={onCopyAmount}
      />,
    );

    const copyAmountBtn = screen.getByRole("button", {
      name: `Copy amount ${mockRequest.exactAmountZec} TAZ`,
    });
    fireEvent.click(copyAmountBtn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        mockRequest.exactAmountZec,
      );
      expect(onCopyAmount).toHaveBeenCalledWith(mockRequest.exactAmountZec);
    });
  });

  it("reports a copy failure without claiming success or invoking the handler twice", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(
      new Error("Clipboard permission denied"),
    );
    const onCopyAddress = vi
      .fn()
      .mockRejectedValue(new Error("No fallback available"));

    render(
      <CheckoutPaymentSummary
        view={{ status: "ready", request: mockRequest }}
        onCopyAddress={onCopyAddress}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: `Copy address ${mockRequest.recipientAddress}`,
      }),
    );

    await waitFor(() => {
      expect(onCopyAddress).toHaveBeenCalledTimes(1);
      expect(
        screen.getByText(
          "Unable to copy the merchant address. Select and copy it manually.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText("✓ Copied")).not.toBeInTheDocument();
    });
  });

  it("renders custom qrCode slot when provided as a prop", () => {
    render(
      <CheckoutPaymentSummary
        view={{
          status: "ready",
          request: mockRequest,
        }}
        qrCode={<div data-testid="custom-qr">Custom QR Renderer</div>}
      />,
    );

    expect(screen.getByTestId("custom-qr")).toBeInTheDocument();
    expect(screen.getByText("Custom QR Renderer")).toBeInTheDocument();
  });

  it("handles expired remainingSeconds gracefully", () => {
    render(
      <CheckoutPaymentSummary
        view={{
          status: "ready",
          request: mockRequest,
        }}
        remainingSeconds={0}
      />,
    );

    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(
      screen.getByTitle("This payment request has expired"),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.queryByRole("link", { name: "Open in Zcash Wallet" }),
    ).not.toBeInTheDocument();
  });
});
