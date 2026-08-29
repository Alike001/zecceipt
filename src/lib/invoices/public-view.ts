import type {
  CheckoutPaymentRequest,
  PaymentStatusViewModel,
  ReceiptViewModel,
} from "@/types";

export function buildZip321PaymentUri(input: {
  recipientAddress: string;
  exactAmountZec: string;
  label: string;
}): string {
  return `zcash:${input.recipientAddress}?amount=${input.exactAmountZec}&label=${encodeURIComponent(input.label)}`;
}

export function createAddressFingerprint(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

export function createReceiptView(input: {
  request: CheckoutPaymentRequest;
  payment: PaymentStatusViewModel;
  settledAt: string;
}): ReceiptViewModel | null {
  if (input.payment.status !== "paid" && input.payment.status !== "overpaid") {
    return null;
  }

  return {
    invoiceId: input.request.invoiceId,
    label: input.request.label,
    status: input.payment.status,
    expectedAmountZec: input.payment.expectedAmountZec,
    paidAmountZec: input.payment.receivedAmountZec,
    network: "testnet",
    settledAt: input.settledAt,
    outputs: input.payment.outputs,
  };
}
