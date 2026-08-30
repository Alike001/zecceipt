import type { ReactNode } from "react";

import type { IsoDateTime } from "@/types/network";

export interface CheckoutPaymentRequest {
  invoiceId: string;
  label: string;
  recipientAddress: string;
  addressFingerprint: string;
  exactAmountZec: string;
  exactAmountZats: string;
  zip321Uri: string;
  expiresAt: IsoDateTime;
  confirmationTarget: number;
  network: "testnet";
}

export type CheckoutSummaryViewModel =
  | { status: "loading" }
  | { status: "ready"; request: CheckoutPaymentRequest }
  | { status: "unavailable"; message: string };

export interface CheckoutPaymentSummaryProps {
  view: CheckoutSummaryViewModel;
  qrCode?: ReactNode;
  remainingSeconds?: number;
  isSettled?: boolean;
  onCopyAddress?: (address: string) => void | Promise<void>;
  onCopyAmount?: (amountZec: string) => void | Promise<void>;
}
