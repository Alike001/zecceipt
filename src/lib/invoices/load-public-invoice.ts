import "server-only";

import { getDatabase, type Database } from "@/lib/db";
import { formatZatoshis } from "@/lib/invoices/money";
import {
  buildZip321PaymentUri,
  createAddressFingerprint,
  createReceiptView,
} from "@/lib/invoices/public-view";
import { InvoiceRepository } from "@/lib/invoices/repository";
import { toPaymentStatusView } from "@/lib/payments";
import type {
  CheckoutPaymentRequest,
  PaymentStatusViewModel,
  ReceiptViewModel,
} from "@/types";

export interface PublicInvoicePageData {
  request: CheckoutPaymentRequest;
  initialPayment: PaymentStatusViewModel;
  initialReceipt: ReceiptViewModel | null;
}

export async function loadPublicInvoice(
  invoiceId: string,
  database: Database = getDatabase(),
): Promise<PublicInvoicePageData | null> {
  const repository = new InvoiceRepository(database);
  const [invoice, outputs] = await Promise.all([
    repository.findById(invoiceId),
    repository.findPaymentOutputsByInvoiceId(invoiceId),
  ]);

  if (!invoice) return null;

  const exactAmountZec = formatZatoshis(invoice.expectedAmountZatoshis);
  const request: CheckoutPaymentRequest = {
    invoiceId: invoice.id,
    label: invoice.label,
    recipientAddress: invoice.recipientAddress,
    addressFingerprint: createAddressFingerprint(invoice.recipientAddress),
    exactAmountZec,
    exactAmountZats: invoice.expectedAmountZatoshis.toString(),
    zip321Uri: buildZip321PaymentUri({
      recipientAddress: invoice.recipientAddress,
      exactAmountZec,
      label: invoice.label,
    }),
    expiresAt: invoice.expiresAt,
    confirmationTarget: invoice.confirmationTarget,
    network: "testnet",
  };
  const initialPayment = toPaymentStatusView(
    invoice,
    outputs,
    invoice.lastCheckedAt ?? invoice.createdAt,
  );

  return {
    request,
    initialPayment,
    initialReceipt: createReceiptView({
      request,
      payment: initialPayment,
      settledAt: invoice.updatedAt,
    }),
  };
}
