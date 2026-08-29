"use client";

import { useId, useState } from "react";

import type { PaymentStatusProps } from "@/types";

import styles from "./payment-status.module.css";

function formatTimestamp(iso: string) {
  try {
    return new Intl.DateTimeFormat("en", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function PaymentStatusTimeline({
  view,
  rpcEvidence,
}: PaymentStatusProps) {
  const [copiedTxid, setCopiedTxid] = useState<string | null>(null);
  const [screenReaderAnnouncement, setScreenReaderAnnouncement] = useState("");
  const titleId = useId();

  const handleCopyTxid = async (txid: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(txid);
      }
      setCopiedTxid(txid);
      setScreenReaderAnnouncement(`Copied transaction ID to clipboard.`);
      setTimeout(() => setCopiedTxid(null), 2000);
    } catch {
      // Fallback
    }
  };

  // Determine active step index (0 to 3) for the stepper
  let activeStep = 0;
  if (view.status === "waiting") {
    activeStep = 0;
  } else if (view.status === "partial" || view.status === "expired_partial") {
    activeStep = 1;
  } else if (view.status === "confirming") {
    activeStep = 2;
  } else if (view.status === "paid" || view.status === "overpaid") {
    activeStep = 3;
  } else if (view.status === "expired") {
    activeStep = 0;
  } else if (view.status === "rpc_unavailable") {
    // Mirror last known step
    if (view.lastKnownStatus === "waiting") activeStep = 0;
    else if (
      view.lastKnownStatus === "partial" ||
      view.lastKnownStatus === "expired_partial"
    )
      activeStep = 1;
    else if (view.lastKnownStatus === "confirming") activeStep = 2;
    else if (
      view.lastKnownStatus === "paid" ||
      view.lastKnownStatus === "overpaid"
    )
      activeStep = 3;
  }

  // Header badge info
  const renderBadge = () => {
    switch (view.status) {
      case "waiting":
        return (
          <span className={`${styles.statusBadge} ${styles.badgeWaiting}`}>
            <span aria-hidden="true">⏱️</span> Waiting for payment
          </span>
        );
      case "partial":
        return (
          <span className={`${styles.statusBadge} ${styles.badgePartial}`}>
            <span aria-hidden="true">⚠️</span> Partial payment
          </span>
        );
      case "confirming":
        return (
          <span className={`${styles.statusBadge} ${styles.badgeConfirming}`}>
            <span aria-hidden="true">🔄</span> Confirming ({view.confirmations}/
            {view.confirmationTarget})
          </span>
        );
      case "paid":
        return (
          <span className={`${styles.statusBadge} ${styles.badgePaid}`}>
            <span aria-hidden="true">✓</span> Payment received
          </span>
        );
      case "overpaid":
        return (
          <span className={`${styles.statusBadge} ${styles.badgeOverpaid}`}>
            <span aria-hidden="true">✓</span> Payment received (Overpaid)
          </span>
        );
      case "expired":
        return (
          <span className={`${styles.statusBadge} ${styles.badgeExpired}`}>
            <span aria-hidden="true">✕</span> Expired
          </span>
        );
      case "expired_partial":
        return (
          <span
            className={`${styles.statusBadge} ${styles.badgeExpiredPartial}`}
          >
            <span aria-hidden="true">⚠️</span> Expired (Partial funds)
          </span>
        );
      case "rpc_unavailable":
        return (
          <span className={`${styles.statusBadge} ${styles.badgeUnavailable}`}>
            <span aria-hidden="true">⚠️</span> Verification paused
          </span>
        );
    }
  };

  // State Card Content
  const renderStateCard = () => {
    switch (view.status) {
      case "waiting":
        return (
          <div className={styles.stateCard}>
            <div className={styles.stateCardHeading}>
              <span aria-hidden="true">📡</span>
              <span>Watching Testnet for incoming transaction…</span>
            </div>
            <p className={styles.stateCardDescription}>
              Expected amount: <strong>{view.expectedAmountZec} TAZ</strong>.
              Zecceipt checks the mempool and newly mined blocks continuously.
            </p>
          </div>
        );

      case "partial":
        return (
          <div
            className={styles.stateCard}
            style={{ borderColor: "rgba(244, 183, 40, 0.4)" }}
          >
            <div
              className={styles.stateCardHeading}
              style={{ color: "#ffc43d" }}
            >
              <span aria-hidden="true">⚠️</span>
              <span>Partial Payment Detected</span>
            </div>
            <p className={styles.stateCardDescription}>
              Received <strong>{view.receivedAmountZec} TAZ</strong> of{" "}
              <strong>{view.expectedAmountZec} TAZ</strong>. Remaining
              shortfall: <strong>{view.shortfallAmountZec} TAZ</strong>. Send
              the remaining amount to complete settlement.
            </p>
          </div>
        );

      case "confirming": {
        const pct = Math.min(
          100,
          Math.round((view.confirmations / view.confirmationTarget) * 100),
        );
        return (
          <div
            className={styles.stateCard}
            style={{ borderColor: "rgba(108, 165, 255, 0.35)" }}
          >
            <div
              className={styles.stateCardHeading}
              style={{ color: "var(--color-info, #6ca5ff)" }}
            >
              <span aria-hidden="true">🔄</span>
              <span>Transaction Detected — Confirming On-Chain</span>
            </div>
            <p className={styles.stateCardDescription}>
              Payment of <strong>{view.receivedAmountZec} TAZ</strong> has been
              detected in block height. Waiting for block confirmations to
              guarantee settlement finality.
            </p>
            <div className={styles.progressContainer}>
              <div className={styles.progressHeader}>
                <span>Confirmation Progress</span>
                <span className="mono">
                  {view.confirmations} of {view.confirmationTarget} blocks (
                  {pct}
                  %)
                </span>
              </div>
              <div
                className={styles.progressBarBg}
                role="progressbar"
                aria-valuenow={view.confirmations}
                aria-valuemin={0}
                aria-valuemax={view.confirmationTarget}
                aria-label={`Confirmation progress: ${view.confirmations} of ${view.confirmationTarget} blocks`}
              >
                <div
                  className={styles.progressBarFill}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
        );
      }

      case "paid":
        return (
          <div
            className={styles.stateCard}
            style={{ borderColor: "rgba(79, 156, 82, 0.4)" }}
          >
            <div
              className={styles.stateCardHeading}
              style={{ color: "#76bf72" }}
            >
              <span aria-hidden="true">✓</span>
              <span>Payment Received & Verified</span>
            </div>
            <p className={styles.stateCardDescription}>
              Full settlement of <strong>{view.receivedAmountZec} TAZ</strong>{" "}
              confirmed on Zcash Testnet. Verifiable receipt is ready below.
            </p>
          </div>
        );

      case "overpaid":
        return (
          <div
            className={styles.stateCard}
            style={{ borderColor: "rgba(79, 156, 82, 0.4)" }}
          >
            <div
              className={styles.stateCardHeading}
              style={{ color: "#76bf72" }}
            >
              <span aria-hidden="true">✓</span>
              <span>Payment Received (Overpayment Recorded)</span>
            </div>
            <p className={styles.stateCardDescription}>
              Expected <strong>{view.expectedAmountZec} TAZ</strong>, received{" "}
              <strong>{view.receivedAmountZec} TAZ</strong>. Payment exceeds
              invoice amount and is fully verified on Testnet.
            </p>
          </div>
        );

      case "expired":
        return (
          <div className={styles.stateCard}>
            <div
              className={styles.stateCardHeading}
              style={{ color: "var(--color-muted-on-ink, #a8aaa2)" }}
            >
              <span aria-hidden="true">⏱️</span>
              <span>Invoice Expired</span>
            </div>
            <p className={styles.stateCardDescription}>
              This payment request expired at{" "}
              <time dateTime={view.expiredAt}>
                {formatTimestamp(view.expiredAt)} UTC
              </time>{" "}
              with 0 TAZ received. No funds were matched.
            </p>
          </div>
        );

      case "expired_partial":
        return (
          <div
            className={styles.stateCard}
            style={{ borderColor: "rgba(255, 108, 108, 0.35)" }}
          >
            <div
              className={styles.stateCardHeading}
              style={{ color: "#ff8888" }}
            >
              <span aria-hidden="true">⚠️</span>
              <span>Invoice Expired with Partial Funds</span>
            </div>
            <p className={styles.stateCardDescription}>
              Invoice expired at{" "}
              <time dateTime={view.expiredAt}>
                {formatTimestamp(view.expiredAt)} UTC
              </time>
              . Received <strong>{view.receivedAmountZec} TAZ</strong>{" "}
              (Shortfall: <strong>{view.shortfallAmountZec} TAZ</strong>).
              Transaction details are listed below for merchant reference.
            </p>
          </div>
        );

      case "rpc_unavailable":
        return (
          <div
            className={styles.stateCard}
            style={{
              borderColor: "rgba(108, 165, 255, 0.5)",
              background: "rgba(108, 165, 255, 0.05)",
            }}
          >
            <div
              className={styles.stateCardHeading}
              style={{ color: "var(--color-info, #6ca5ff)" }}
            >
              <span aria-hidden="true">⚠️</span>
              <span>Verification Paused — Node RPC Unreachable</span>
            </div>
            <p className={styles.stateCardDescription}>{view.message}</p>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.75rem",
                color: "var(--color-muted-on-ink, #a8aaa2)",
              }}
            >
              <span>Last known observation:</span>
              <strong style={{ color: "var(--color-text-on-ink, #f7f6f0)" }}>
                {view.lastKnownStatus.replace("_", " ").toUpperCase()}
              </strong>
            </div>
          </div>
        );
    }
  };

  // Outputs list if present in view
  const outputs = "outputs" in view ? view.outputs : [];

  return (
    <section
      className={styles.statusContainer}
      aria-labelledby={titleId}
      role={view.status === "rpc_unavailable" ? "status" : "region"}
    >
      {/* Screen reader live region */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {screenReaderAnnouncement}
      </div>

      {/* Header */}
      <div className={styles.statusHeader}>
        <div className={styles.invoiceInfo}>
          <span id={titleId} className={styles.invoiceId}>
            Invoice {view.invoiceId}
          </span>
          <span className="mono" style={{ color: "var(--color-muted-on-ink)" }}>
            • Observed {formatTimestamp(view.observedAt)} UTC
          </span>
        </div>
        <div>{renderBadge()}</div>
      </div>

      {/* 4-Step Progress Track */}
      <ol className={styles.timelineTrack} aria-label="Payment progress steps">
        <li
          className={`${styles.timelineStep} ${
            activeStep >= 0 ? styles.stepComplete : ""
          } ${activeStep === 0 ? styles.stepActive : ""}`}
        >
          <span className={styles.stepNumber}>Step 01</span>
          <span className={styles.stepTitle}>Request Created</span>
        </li>
        <li
          className={`${styles.timelineStep} ${
            activeStep >= 1 ? styles.stepComplete : ""
          } ${activeStep === 1 ? styles.stepActive : ""}`}
        >
          <span className={styles.stepNumber}>Step 02</span>
          <span className={styles.stepTitle}>Payment Detected</span>
        </li>
        <li
          className={`${styles.timelineStep} ${
            activeStep >= 2 ? styles.stepComplete : ""
          } ${activeStep === 2 ? styles.stepActive : ""}`}
        >
          <span className={styles.stepNumber}>Step 03</span>
          <span className={styles.stepTitle}>Confirming</span>
        </li>
        <li
          className={`${styles.timelineStep} ${
            activeStep === 3 ? styles.stepComplete : ""
          }`}
        >
          <span className={styles.stepNumber}>Step 04</span>
          <span className={styles.stepTitle}>Settled & Ready</span>
        </li>
      </ol>

      {/* Main Body */}
      <div className={styles.statusBody}>
        {renderStateCard()}

        {/* Matched Transaction Outputs */}
        {outputs.length > 0 ? (
          <div className={styles.outputsSection}>
            <span className={styles.sectionTitle}>
              Matched Testnet Outputs ({outputs.length})
            </span>
            <div className={styles.outputsList}>
              {outputs.map((out) => (
                <div
                  key={`${out.txid}:${out.outputIndex}`}
                  className={styles.outputItem}
                >
                  <div className={styles.txDetails}>
                    <div className={styles.txHashRow}>
                      <span className={styles.txHash} title={out.txid}>
                        {out.txid}
                      </span>
                      <button
                        type="button"
                        className={styles.copyButton}
                        onClick={() => handleCopyTxid(out.txid)}
                        aria-label={`Copy transaction ID ${out.txid}`}
                      >
                        {copiedTxid === out.txid ? "✓ Copied" : "Copy TxID"}
                      </button>
                    </div>
                    <div className={styles.txMeta}>
                      <span>Output #{out.outputIndex}</span>
                      <span>•</span>
                      <span>Block #{out.blockHeight.toLocaleString("en")}</span>
                      <span>•</span>
                      <span>
                        {out.confirmations}{" "}
                        {out.confirmations === 1
                          ? "confirmation"
                          : "confirmations"}
                      </span>
                    </div>
                  </div>
                  <div className={styles.txAmount}>
                    {out.amountZec} TAZ
                    <div
                      style={{
                        fontSize: "0.68rem",
                        color: "var(--color-muted-on-ink)",
                        fontWeight: "normal",
                      }}
                    >
                      {Number(out.amountZats).toLocaleString("en")} zats
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* RPC Evidence Track if supplied */}
      {rpcEvidence && rpcEvidence.length > 0 ? (
        <div className={styles.rpcFooter}>
          <span className={styles.rpcTitle}>Zcash RPC Evidence Verified</span>
          <div className={styles.rpcList}>
            {rpcEvidence.map((item, idx) => (
              <span
                key={`${item.method}-${idx}`}
                className={styles.rpcChip}
                data-state={item.state}
              >
                <code>{item.method}</code>
                {item.latencyMs !== null ? (
                  <span>({item.latencyMs}ms)</span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
