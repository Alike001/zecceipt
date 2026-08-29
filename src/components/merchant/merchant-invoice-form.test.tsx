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

  it("blocks invalid TAZ amounts without converting them to floating point", () => {
    const onSubmit = vi.fn();
    renderForm({
      initialValues: { ...validValues, amountZec: "0.000000001" },
      onSubmit,
    });

    fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));

    expect(
      screen.getByText(/positive TAZ amount with no more than eight/i),
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

  it("ignores a stale invalid address result after the recipient is edited", () => {
    const onSubmit = vi.fn();
    renderForm({
      addressValidation: {
        status: "invalid",
        message: "This address did not pass the external check.",
      },
      onSubmit,
    });

    expect(
      screen.getByText("This address did not pass the external check."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/merchant Testnet address/i), {
      target: { value: "tmYXBYJj1K7vhejSec5osXK2QsGa5MTisUR" },
    });

    expect(
      screen.queryByText("This address did not pass the external check."),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("hides a stale valid address result after the recipient is edited", () => {
    renderForm({ addressValidation: { status: "valid" } });

    expect(screen.getByText("Address looks good.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/merchant Testnet address/i), {
      target: { value: "tmYXBYJj1K7vhejSec5osXK2QsGa5MTisUR" },
    });

    expect(screen.queryByText("Address looks good.")).not.toBeInTheDocument();
  });

  it("dismisses only the supplied field error whose field is edited", () => {
    renderForm({
      fieldErrors: {
        amountZec: "The server rejected this amount.",
        label: "The server rejected this label.",
      },
    });

    fireEvent.change(screen.getByLabelText(/invoice label or description/i), {
      target: { value: "Updated order label" },
    });

    expect(
      screen.queryByText("The server rejected this label."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("The server rejected this amount."),
    ).toBeInTheDocument();
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
    expect(screen.getByText("0.04200000 TAZ")).toBeInTheDocument();
    expect(screen.getByText("Confirming")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Order #1048/i })).toHaveAttribute(
      "href",
      "/pay/inv_1048",
    );
  });

  it("uses TAZ for every visible Testnet amount and help message", () => {
    renderForm();

    expect(screen.getAllByText("TAZ")).toHaveLength(2);
    expect(
      screen.getByText(/Use TAZ, which has no real monetary value/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\bZEC\b/i)).not.toBeInTheDocument();
  });
});
