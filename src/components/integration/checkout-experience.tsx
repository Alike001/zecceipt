"use client";

import { useEffect, useState } from "react";

import {
  CheckoutPaymentSummary,
  PaymentStatusTimeline,
} from "@/components/checkout";
import { ReceiptCard } from "@/components/receipt";
import { createReceiptView } from "@/lib/invoices/public-view";
import type { VerifyPaymentResponse } from "@/lib/payments";
import type {
  CheckoutPaymentRequest,
  PaymentStatusViewModel,
  ReceiptViewModel,
  RpcEvidenceItem,
  SafePaymentStatus,
} from "@/types";

import styles from "./integration.module.css";

const POLL_INTERVAL_MS = 8_000;
const TERMINAL_STATUSES = new Set<SafePaymentStatus>([
  "paid",
  "overpaid",
  "expired",
  "expired_partial",
]);

interface CheckoutExperienceProps {
  request: CheckoutPaymentRequest;
  initialPayment: PaymentStatusViewModel;
  initialReceipt: ReceiptViewModel | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPaymentResponse(value: unknown): value is VerifyPaymentResponse {
  return (
    isRecord(value) &&
    isRecord(value.payment) &&
    typeof value.payment.status === "string" &&
    Array.isArray(value.rpcEvidence)
  );
}

function lastKnownStatus(view: PaymentStatusViewModel): SafePaymentStatus {
  return view.status === "rpc_unavailable" ? view.lastKnownStatus : view.status;
}

function unavailablePayment(
  current: PaymentStatusViewModel,
): PaymentStatusViewModel {
  return {
    status: "rpc_unavailable",
    invoiceId: current.invoiceId,
    expectedAmountZec: current.expectedAmountZec,
    receivedAmountZec: current.receivedAmountZec,
    observedAt: new Date().toISOString(),
    message: "Live payment verification is temporarily unavailable.",
    lastKnownStatus: lastKnownStatus(current),
    ...("lastSuccessfulAt" in current && current.lastSuccessfulAt
      ? { lastSuccessfulAt: current.lastSuccessfulAt }
      : current.status !== "rpc_unavailable"
        ? { lastSuccessfulAt: current.observedAt }
        : {}),
  };
}

export function CheckoutExperience({
  request,
  initialPayment,
  initialReceipt,
}: CheckoutExperienceProps) {
  const [payment, setPayment] =
    useState<PaymentStatusViewModel>(initialPayment);
  const [rpcEvidence, setRpcEvidence] = useState<readonly RpcEvidenceItem[]>(
    [],
  );
  const [receipt, setReceipt] = useState<ReceiptViewModel | null>(
    initialReceipt,
  );
  const invoiceId = request.invoiceId;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let activeController: AbortController | undefined;

    const schedule = () => {
      if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    const poll = async () => {
      activeController = new AbortController();
      try {
        const response = await fetch(
          `/api/invoices/${encodeURIComponent(invoiceId)}/status`,
          {
            cache: "no-store",
            signal: activeController.signal,
          },
        );
        const body: unknown = await response.json();
        if (!response.ok || !isPaymentResponse(body)) {
          throw new Error("Payment status response was unavailable.");
        }
        if (cancelled) return;

        const nextPayment = body.payment;
        setPayment(nextPayment);
        setRpcEvidence(body.rpcEvidence);

        if (
          nextPayment.status === "paid" ||
          nextPayment.status === "overpaid"
        ) {
          setReceipt(
            (current) =>
              current ??
              createReceiptView({
                request,
                payment: nextPayment,
                settledAt: nextPayment.observedAt,
              }),
          );
        } else if (nextPayment.status !== "rpc_unavailable") {
          setReceipt(null);
        }

        if (
          nextPayment.status !== "rpc_unavailable" &&
          TERMINAL_STATUSES.has(nextPayment.status)
        ) {
          return;
        }
        schedule();
      } catch {
        if (cancelled || activeController.signal.aborted) return;
        setPayment((current) => unavailablePayment(current));
        setRpcEvidence([]);
        schedule();
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      activeController?.abort();
    };
  }, [invoiceId, request]);

  return (
    <div className={styles.checkoutWorkspace}>
      <div className={styles.checkoutIntro}>
        <span>Public Testnet checkout</span>
        <h1>Pay the exact amount shown.</h1>
        <p>
          Scan the ZIP-321 QR or copy the transparent address and exact TAZ
          amount. This page updates from server-verified blockchain evidence.
        </p>
      </div>

      <CheckoutPaymentSummary view={{ status: "ready", request }} />

      <section className={styles.statusSection} aria-labelledby="status-title">
        <div className={styles.sectionHeading}>
          <span>Live verification</span>
          <h2 id="status-title">Payment status</h2>
        </div>
        <PaymentStatusTimeline view={payment} rpcEvidence={rpcEvidence} />
      </section>

      {receipt ? (
        <section
          className={styles.receiptSection}
          aria-labelledby="receipt-title"
        >
          <div className={styles.sectionHeading}>
            <span>Persisted proof</span>
            <h2 id="receipt-title">Verified receipt</h2>
          </div>
          <ReceiptCard receipt={receipt} />
        </section>
      ) : null}
    </div>
  );
}
