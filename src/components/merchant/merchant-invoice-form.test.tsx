import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MerchantInvoiceForm } from "@/components/merchant/merchant-invoice-form";
import type { MerchantInvoiceFormProps } from "@/types";

const validValues: MerchantInvoiceFormProps["initialValues"] = {
  recipientAddress: "tmYXBYJj1K7vhejSec5osXK2QsGa5MTisUQ",
  amountZec: "0.04200000",
  label: "Order #1048",
  expiryMinutes: "30",
  confirmationTarget: "1",
};

function renderForm(overrides: Partial<MerchantInvoiceFormProps> = {}) {
  const props: MerchantInvoiceFormProps = {
    initialValues: validValues,
    addressValidation: { status: "idle" },
    submission: { status: "idle" },
    onSubmit: vi.fn(),
    ...overrides,
  };

  render(<MerchantInvoiceForm {...props} />);
  return props;
}

describe("MerchantInvoiceForm", () => {
  it("submits normalized decimal-string values through the supplied callback", () => {
    const onSubmit = vi.fn();
    renderForm({
      initialValues: {
        ...validValues,
        recipientAddress: `  ${validValues.recipientAddress}  `,
        amountZec: " 0.04200000 ",
        label: "  Order #1048  ",
      },
      addressValidation: { status: "valid" },
      onSubmit,
    });

    fireEvent.submit(
      screen.getByRole("button", { name: /create invoice/i }).closest("form")!,
    );

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith(validValues);
  });

  it("blocks invalid amounts without converting ZEC to floating point", () => {
    const onSubmit = vi.fn();
    renderForm({
      initialValues: { ...validValues, amountZec: "0.000000001" },
      onSubmit,
    });

    fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));

    expect(
      screen.getByText(/positive ZEC amount with no more than eight/i),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("explains and rejects unsupported recipient formats", () => {
    const onSubmit = vi.fn();
    renderForm({
      initialValues: {
        ...validValues,
        recipientAddress:
          "u1testunifiedrecipientthatthismvpdoesnotsupport000000000000",
      },
      onSubmit,
    });

    fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      /Shielded and Unified recipients/i,
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("uses the address callback and exposes unavailable validation state", () => {
    const onAddressBlur = vi.fn();
    renderForm({
      addressValidation: {
        status: "unavailable",
        message: "The Testnet address check is temporarily unavailable.",
      },
      onAddressBlur,
    });

    fireEvent.blur(screen.getByLabelText(/merchant Testnet address/i));
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));

    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(onAddressBlur).toHaveBeenCalledTimes(2);
    expect(onAddressBlur).toHaveBeenLastCalledWith(
      validValues.recipientAddress,
    );
  });

  it("renders loading, server-error, and success states", () => {
    const { rerender } = render(
      <MerchantInvoiceForm
        addressValidation={{ status: "valid" }}
        initialValues={validValues}
        onSubmit={vi.fn()}
        submission={{ status: "submitting" }}
      />,
    );

    expect(
      screen.getByRole("button", { name: /creating invoice/i }),
    ).toBeDisabled();

    rerender(
      <MerchantInvoiceForm
        addressValidation={{ status: "valid" }}
        initialValues={validValues}
        onSubmit={vi.fn()}
        submission={{ status: "error", message: "Please try again." }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Please try again.");

    rerender(
      <MerchantInvoiceForm
        addressValidation={{ status: "valid" }}
        initialValues={validValues}
        onSubmit={vi.fn()}
        submission={{
          status: "success",
          invoiceId: "inv_test_1048",
          checkoutUrl: "/pay/inv_test_1048",
        }}
      />,
    );
    expect(screen.getByText("Invoice created.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /open checkout/i }),
    ).toHaveAttribute("href", "/pay/inv_test_1048");
  });

  it("presents recent invoices entirely from supplied props", () => {
    renderForm({
      recentInvoices: [
        {
          invoiceId: "inv_1048",
          label: "Order #1048",
          exactAmountZec: "0.04200000",
          status: "confirming",
          createdAt: "2026-08-29T10:15:30.000Z",
          checkoutUrl: "/pay/inv_1048",
        },
      ],
    });

    expect(
      screen.getByRole("heading", { name: "Recent invoices" }),
    ).toBeInTheDocument();
    expect(screen.getByText("0.04200000 ZEC")).toBeInTheDocument();
    expect(screen.getByText("Confirming")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Order #1048/i })).toHaveAttribute(
      "href",
      "/pay/inv_1048",
    );
  });
});
