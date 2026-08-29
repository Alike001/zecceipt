"use client";

import { useId, useState } from "react";

import type { ReceiptProps, ReceiptViewModel } from "@/types";

import styles from "./receipt.module.css";

function formatTimestamp(iso: string) {
  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function buildReceiptPlainText(receipt: ReceiptViewModel): string {
  const lines = [
    "====================================",
    "       ZECCEIPT PAYMENT RECEIPT     ",
    "====================================",
    `Invoice:   ${receipt.label || receipt.invoiceId}`,
    `Invoice ID:${receipt.invoiceId}`,
    `Status:    ${receipt.status.toUpperCase()}`,
    `Amount:    ${receipt.paidAmountZec} TAZ`,
    `Expected:  ${receipt.expectedAmountZec} TAZ`,
    `Network:   Zcash Testnet (TAZ)`,
    `Settled:   ${formatTimestamp(receipt.settledAt)} UTC`,
    "------------------------------------",
    "MATCHED ON-CHAIN OUTPUTS:",
    ...receipt.outputs.map(
      (out, i) =>
        `#${i + 1} TxID: ${out.txid}\n   vout: ${out.outputIndex} | Block: #${out.blockHeight} | Confs: ${out.confirmations}\n   Amount: ${out.amountZec} TAZ (${out.amountZats} zats)`,
    ),
    "====================================",
    "Verified via Zcash JSON-RPC",
  ];
  return lines.join("\n");
}

export function ReceiptCard({ receipt, onCopyDetails }: ReceiptProps) {
  const [copiedTxid, setCopiedTxid] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [screenReaderAnnouncement, setScreenReaderAnnouncement] = useState("");
  const titleId = useId();

  const handleCopyTxid = async (txid: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(txid);
      }
      setCopiedTxid(txid);
      setScreenReaderAnnouncement(`Copied transaction hash to clipboard.`);
      setTimeout(() => setCopiedTxid(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCopyAll = async () => {
    const text = buildReceiptPlainText(receipt);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      setCopiedAll(true);
      setScreenReaderAnnouncement("Copied full receipt summary to clipboard.");
      if (onCopyDetails) {
        await onCopyDetails(receipt);
      }
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      if (onCopyDetails) {
        await onCopyDetails(receipt);
      }
    }
  };

  return (
    <article
      className={styles.receiptCard}
      aria-labelledby={titleId}
      role="article"
    >
      {/* Hidden live region */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {screenReaderAnnouncement}
      </div>

      {/* Header */}
      <header className={styles.receiptHeader}>
        <div className={styles.brandReceipt}>
          <span>Zecceipt</span>
          <span style={{ color: "var(--color-muted-on-ink)", fontWeight: 400 }}>
            / Verified Receipt
          </span>
        </div>
        <div
          className={styles.statusBadge}
          data-status={receipt.status}
          aria-label={`Payment status: ${receipt.status}`}
        >
          <span aria-hidden="true">✓</span>
          <span>
            {receipt.status === "overpaid"
              ? "Payment Received (Overpaid)"
              : "Payment Received"}
          </span>
        </div>
      </header>

      {/* Body */}
      <div className={styles.receiptBody}>
        {/* Invoice Summary */}
        <div className={styles.summaryRow}>
          <div className={styles.invoiceMeta}>
            <h2 id={titleId} className={styles.invoiceTitle}>
              {receipt.label || `Invoice ${receipt.invoiceId}`}
            </h2>
            <span className={styles.invoiceSubtitle}>
              Invoice ID: <code className="mono">{receipt.invoiceId}</code>
            </span>
          </div>

          <div className={styles.amountBox}>
            <span className={styles.amountLabel}>Total Settled</span>
            <span className={styles.amountPaid}>
              {receipt.paidAmountZec} <span className="mono">TAZ</span>
            </span>
          </div>
        </div>

        {/* Evidence Key-Value Grid */}
        <dl className={styles.evidenceGrid} aria-label="Settlement details">
          <div className={styles.evidenceItem}>
            <dt className={styles.evidenceLabel}>Network</dt>
            <dd className={styles.evidenceValue}>Zcash Testnet (TAZ)</dd>
          </div>

          <div className={styles.evidenceItem}>
            <dt className={styles.evidenceLabel}>Expected Amount</dt>
            <dd className={styles.evidenceValue}>
              {receipt.expectedAmountZec} TAZ
            </dd>
          </div>

          <div className={styles.evidenceItem}>
            <dt className={styles.evidenceLabel}>Settled At</dt>
            <dd className={styles.evidenceValue}>
              <time dateTime={receipt.settledAt}>
                {formatTimestamp(receipt.settledAt)} UTC
              </time>
            </dd>
          </div>

          <div className={styles.evidenceItem}>
            <dt className={styles.evidenceLabel}>Outputs Verified</dt>
            <dd className={styles.evidenceValue}>
              {receipt.outputs.length}{" "}
              {receipt.outputs.length === 1 ? "Output" : "Outputs"}
            </dd>
          </div>
        </dl>

        {/* On-Chain Matched Outputs List */}
        <div className={styles.outputsSection}>
          <span className={styles.sectionHeading}>
            On-Chain Matched Transaction Outputs
          </span>

          {receipt.outputs.map((out, idx) => (
            <div
              key={`${out.txid}:${out.outputIndex}`}
              className={styles.outputCard}
            >
              <div className={styles.outputHeader}>
                <div className={styles.txidWrapper}>
                  <span
                    style={{
                      color: "var(--color-muted-on-ink)",
                      fontSize: "0.72rem",
                    }}
                  >
                    Tx #{idx + 1}:
                  </span>
                  <code className={styles.txidText} title={out.txid}>
                    {out.txid}
                  </code>
                </div>
                <button
                  type="button"
                  className={styles.copyButton}
                  onClick={() => handleCopyTxid(out.txid)}
                  aria-label={`Copy transaction ID ${out.txid}`}
                >
                  {copiedTxid === out.txid ? "✓ Copied" : "Copy TxID"}
                </button>
              </div>

              <div className={styles.outputSpecs}>
                <div>
                  <span
                    style={{
                      color: "var(--color-muted-on-ink)",
                      display: "block",
                      fontSize: "0.65rem",
                    }}
                  >
                    VOUT INDEX
                  </span>
                  <strong>output #{out.outputIndex}</strong>
                </div>

                <div>
                  <span
                    style={{
                      color: "var(--color-muted-on-ink)",
                      display: "block",
                      fontSize: "0.65rem",
                    }}
                  >
                    BLOCK HEIGHT
                  </span>
                  <strong>#{out.blockHeight.toLocaleString("en")}</strong>
                </div>

                <div>
                  <span
                    style={{
                      color: "var(--color-muted-on-ink)",
                      display: "block",
                      fontSize: "0.65rem",
                    }}
                  >
                    CONFIRMATIONS
                  </span>
                  <strong>
                    {out.confirmations}{" "}
                    {out.confirmations === 1 ? "confirm" : "confirms"}
                  </strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Actions */}
      <footer className={styles.receiptFooter}>
        <span className={styles.testnetBadgeNotice}>
          🔒 Verified on Zcash Testnet with server-side RPC validation.
        </span>

        <div className={styles.receiptActions}>
          <button
            type="button"
            className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
            onClick={handleCopyAll}
            aria-label="Copy entire receipt summary"
          >
            <span aria-hidden="true">📋</span>
            <span>{copiedAll ? "✓ Receipt Copied" : "Copy Full Receipt"}</span>
          </button>
        </div>
      </footer>
    </article>
  );
}
