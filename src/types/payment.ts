import type { IsoDateTime, RpcEvidenceItem } from "@/types/network";

export interface MatchedPaymentOutput {
  txid: string;
  outputIndex: number;
  amountZec: string;
  amountZats: string;
  blockHeight: number;
  blockHash: string;
  confirmations: number;
}

interface PaymentStateBase {
  invoiceId: string;
  expectedAmountZec: string;
  receivedAmountZec: string;
  observedAt: IsoDateTime;
}

export type SettledPaymentStatus = "paid" | "overpaid";

export type SafePaymentStatus =
  | "waiting"
  | "partial"
  | "confirming"
  | SettledPaymentStatus
  | "expired"
  | "expired_partial";

export type PaymentStatusViewModel =
  | (PaymentStateBase & {
      status: "waiting";
    })
  | (PaymentStateBase & {
      status: "partial";
      shortfallAmountZec: string;
      outputs: readonly MatchedPaymentOutput[];
    })
  | (PaymentStateBase & {
      status: "confirming";
      confirmations: number;
      confirmationTarget: number;
      outputs: readonly MatchedPaymentOutput[];
    })
  | (PaymentStateBase & {
      status: SettledPaymentStatus;
      outputs: readonly MatchedPaymentOutput[];
    })
  | (PaymentStateBase & {
      status: "expired";
      expiredAt: IsoDateTime;
    })
  | (PaymentStateBase & {
      status: "expired_partial";
      expiredAt: IsoDateTime;
      shortfallAmountZec: string;
      outputs: readonly MatchedPaymentOutput[];
    })
  | (PaymentStateBase & {
      status: "rpc_unavailable";
      message: string;
      lastKnownStatus: SafePaymentStatus;
      lastSuccessfulAt?: IsoDateTime;
    });

export interface PaymentStatusProps {
  view: PaymentStatusViewModel;
  rpcEvidence?: readonly RpcEvidenceItem[];
}

export interface ReceiptViewModel {
  invoiceId: string;
  label: string;
  status: SettledPaymentStatus;
  expectedAmountZec: string;
  paidAmountZec: string;
  network: "testnet";
  settledAt: IsoDateTime;
  outputs: readonly MatchedPaymentOutput[];
}

export interface ReceiptProps {
  receipt: ReceiptViewModel;
  onCopyDetails?: (receipt: ReceiptViewModel) => void | Promise<void>;
}
