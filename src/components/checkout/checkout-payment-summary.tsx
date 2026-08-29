"use client";

import { useEffect, useId, useState } from "react";

import { QrCode } from "@/components/checkout/qr-code";
import type { CheckoutPaymentSummaryProps } from "@/types";

import styles from "./checkout.module.css";

function formatSeconds(totalSeconds: number): string {
  if (totalSeconds <= 0) return "Expired";
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function CheckoutPaymentSummary({
  view,
  qrCode,
  remainingSeconds: externalRemainingSeconds,
  onCopyAddress,
  onCopyAmount,
}: CheckoutPaymentSummaryProps) {
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [screenReaderAnnouncement, setScreenReaderAnnouncement] = useState("");
  const titleId = useId();
  const addressLabelId = useId();
  const amountLabelId = useId();

  // Internal countdown timer when viewing a ready request without external override
  const [internalCountdown, setInternalCountdown] = useState<number | null>(
    null,
  );

  useEffect(() => {
    if (view.status !== "ready" || externalRemainingSeconds !== undefined) {
      return;
    }

    const targetTime = new Date(view.request.expiresAt).getTime();
    const updateCountdown = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((targetTime - now) / 1000));
      setInternalCountdown(diff);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [view, externalRemainingSeconds]);

  const activeSeconds = externalRemainingSeconds ?? internalCountdown;

  // Handle Copy Address
  const handleCopyAddress = async (address: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(address);
      }
      setCopiedAddress(true);
      setScreenReaderAnnouncement("Copied merchant address to clipboard.");
      if (onCopyAddress) {
        await onCopyAddress(address);
      }
      setTimeout(() => setCopiedAddress(false), 2000);
    } catch {
      // Fallback
      if (onCopyAddress) {
        await onCopyAddress(address);
      }
    }
  };

  // Handle Copy Amount
  const handleCopyAmount = async (amount: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(amount);
      }
      setCopiedAmount(true);
      setScreenReaderAnnouncement(`Copied ${amount} ZEC amount to clipboard.`);
      if (onCopyAmount) {
        await onCopyAmount(amount);
      }
      setTimeout(() => setCopiedAmount(false), 2000);
    } catch {
      // Fallback
      if (onCopyAmount) {
        await onCopyAmount(amount);
      }
    }
  };

  // 1. Loading State
  if (view.status === "loading") {
    return (
      <section
        className={styles.checkoutSummary}
        aria-labelledby={titleId}
        aria-busy="true"
      >
        <div className={styles.header}>
          <span id={titleId} className={styles.invoiceLabel}>
            Loading Invoice…
          </span>
          <span className={styles.expiryBadge}>Calculating expiry…</span>
        </div>
        <div className={styles.skeletonCard}>
          <div
            className={styles.skeletonLine}
            style={{ width: "60%", height: "2rem" }}
          />
          <div
            className={styles.skeletonLine}
            style={{ width: "85%", height: "3rem" }}
          />
          <div
            className={styles.skeletonLine}
            style={{ width: "100%", height: "4rem" }}
          />
        </div>
      </section>
    );
  }

  // 2. Unavailable State
  if (view.status === "unavailable") {
    return (
      <section
        className={styles.checkoutSummary}
        aria-labelledby={titleId}
        role="status"
      >
        <div className={styles.header}>
          <span id={titleId} className={styles.invoiceLabel}>
            Payment Request Unavailable
          </span>
          <span className={styles.expiryBadge} data-urgent="true">
            Paused
          </span>
        </div>
        <div className={styles.unavailableCard}>
          <div className={styles.unavailableTitle}>
            <span aria-hidden="true">⚠️</span>
            <span>Verification Paused</span>
          </div>
          <p className={styles.unavailableMessage}>{view.message}</p>
        </div>
      </section>
    );
  }

  // 3. Ready State
  const { request } = view;
  const isUrgent =
    activeSeconds !== null && activeSeconds > 0 && activeSeconds <= 120;
  const isExpired = activeSeconds !== null && activeSeconds <= 0;

  return (
    <section className={styles.checkoutSummary} aria-labelledby={titleId}>
      {/* Hidden live region for screen readers */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {screenReaderAnnouncement}
      </div>

      {/* Header with invoice label and expiry countdown */}
      <div className={styles.header}>
        <span id={titleId} className={styles.invoiceLabel}>
          {request.label || `Invoice ${request.invoiceId}`}
        </span>
        <div
          className={styles.expiryBadge}
          data-urgent={isUrgent}
          data-expired={isExpired}
          aria-label={
            isExpired
              ? "Invoice has expired"
              : `Time remaining: ${activeSeconds !== null ? formatSeconds(activeSeconds) : "Active"}`
          }
        >
          <span aria-hidden="true">⏱️</span>
          <span>
            {activeSeconds !== null ? formatSeconds(activeSeconds) : "Active"}
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className={styles.body}>
        {/* Left Column: Amount, zatoshis, address, actions */}
        <div>
          {/* Amount Section */}
          <div className={styles.amountSection}>
            <span id={amountLabelId} className={styles.dataLabel}>
              Amount Due (Exact)
            </span>
            <div className={styles.amountRow}>
              <span className={styles.amountMain}>
                {request.exactAmountZec}{" "}
                <span className={styles.amountUnit}>ZEC</span>
              </span>
              <button
                type="button"
                className={styles.copyButton}
                onClick={() => handleCopyAmount(request.exactAmountZec)}
                aria-label={`Copy amount ${request.exactAmountZec} ZEC`}
                data-copied={copiedAmount}
              >
                {copiedAmount ? "✓ Copied" : "Copy Amount"}
              </button>
            </div>
            <span className={styles.amountZats}>
              {Number(request.exactAmountZats).toLocaleString("en")} zatoshis
            </span>
          </div>

          {/* Address Section */}
          <div className={styles.addressSection}>
            <div className={styles.addressHeader}>
              <span id={addressLabelId} className={styles.dataLabel}>
                Merchant Transparent Address
              </span>
              <span
                className={styles.fingerprintBadge}
                title="Address fingerprint"
                aria-label={`Address fingerprint: ${request.addressFingerprint}`}
              >
                {request.addressFingerprint}
              </span>
            </div>

            <div className={styles.addressBox}>
              <span
                className={styles.fullAddress}
                aria-labelledby={addressLabelId}
              >
                {request.recipientAddress}
              </span>
              <button
                type="button"
                className={styles.copyButton}
                onClick={() => handleCopyAddress(request.recipientAddress)}
                aria-label={`Copy address ${request.recipientAddress}`}
                data-copied={copiedAddress}
              >
                {copiedAddress ? "✓ Copied" : "Copy Address"}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: QR Code & Wallet link */}
        <div className={styles.qrColumn}>
          <div className={styles.qrContainer}>
            {qrCode ? (
              qrCode
            ) : (
              <QrCode
                value={request.zip321Uri}
                size={180}
                ariaLabel={`ZIP-321 QR code for invoice ${request.invoiceId}`}
              />
            )}
          </div>

          <a
            href={request.zip321Uri}
            className={styles.walletLink}
            target="_blank"
            rel="noopener noreferrer"
            title="Open payment request in wallet"
          >
            <span>Open in Zcash Wallet</span>
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>

      {/* Meta Footer */}
      <div className={styles.metaFooter}>
        <div className={styles.metaItem}>
          <small>Network</small>
          <strong>Zcash Testnet</strong>
        </div>
        <div className={styles.metaItem}>
          <small>Confirmation Target</small>
          <strong>
            {request.confirmationTarget}{" "}
            {request.confirmationTarget === 1 ? "Block" : "Blocks"}
          </strong>
        </div>
      </div>

      {/* Testnet & Transparent Warning Banner */}
      <div className={styles.warningBanner}>
        <span className={styles.warningIcon} aria-hidden="true">
          ℹ️
        </span>
        <span>
          <strong>Testnet Only:</strong> Send exact transparent ZEC from your
          Testnet wallet. This MVP confirms payments made to transparent
          addresses only. Do not send real Mainnet ZEC.
        </span>
      </div>
    </section>
  );
}
