"use client";

import { useId } from "react";

import {
  ZCASH_RPC_METHODS,
  type NetworkProofProps,
  type NetworkProofViewModel,
  type RpcEvidenceItem,
  type ZcashRpcMethod,
} from "@/types";

import styles from "./network-proof.module.css";

const STATUS_COPY = {
  loading: {
    label: "Connecting",
    detail: "Waiting for a live Testnet response.",
    tone: "neutral",
  },
  live: {
    label: "Node ready",
    detail: "The supplied Testnet snapshot is current and ready.",
    tone: "success",
  },
  syncing: {
    label: "Node syncing",
    detail: "The node is catching up. Treat this view as provisional.",
    tone: "warning",
  },
  stale: {
    label: "Data may be stale",
    detail: "Keep the last observation visible while freshness is restored.",
    tone: "warning",
  },
  unavailable: {
    label: "Verification paused",
    detail: "Live RPC evidence is unavailable right now.",
    tone: "info",
  },
} as const;

const METHOD_PURPOSES: Record<ZcashRpcMethod, string> = {
  validateaddress: "Validate transparent recipients",
  getblockchaininfo: "Read chain and node sync state",
  getblockcount: "Read the latest observed block height",
  getaddresstxids: "Find transactions for a transparent address",
  getrawtransaction: "Inspect transaction outputs and confirmations",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "medium",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatProgress(value: number) {
  const percentage = Math.min(100, Math.max(0, value * 100));
  return {
    numeric: Number(percentage.toFixed(2)),
    label: percentage.toLocaleString("en", {
      minimumFractionDigits: percentage < 100 ? 2 : 0,
      maximumFractionDigits: 2,
    }),
  };
}

function StatusBadge({ status }: { status: NetworkProofViewModel["status"] }) {
  const copy = STATUS_COPY[status];

  return (
    <span
      className={`${styles.statusBadge} ${styles[`tone_${copy.tone}`]}`}
      data-tone={copy.tone}
    >
      <span aria-hidden className={styles.statusDot} />
      {copy.label}
    </span>
  );
}

export function TestnetNetworkBadge({
  status,
}: {
  status: NetworkProofViewModel["status"];
}) {
  return (
    <span className={styles.networkBadge}>
      <span aria-hidden className={styles.shieldIcon}>
        Z
      </span>
      <span>
        <strong>Zcash Testnet</strong>
        <small>Transparent verification</small>
      </span>
      <StatusBadge status={status} />
    </span>
  );
}

interface EvidencePresentation {
  evidence?: RpcEvidenceItem;
  label: string;
  tone: "success" | "error" | "neutral";
}

function getEvidencePresentation(
  method: ZcashRpcMethod,
  view: NetworkProofViewModel,
): EvidencePresentation {
  if (view.status === "loading" || view.status === "unavailable") {
    return {
      label: view.status === "loading" ? "Awaiting evidence" : "Not checked",
      tone: "neutral",
    };
  }

  const evidence = view.evidence?.find((item) => item.method === method);
  if (evidence) {
    return {
      evidence,
      label: evidence.state === "success" ? "Responded" : "RPC error",
      tone: evidence.state,
    };
  }

  if (view.snapshot.rpcMethods.includes(method)) {
    return { label: "Used for this view", tone: "neutral" };
  }

  return { label: "Payment verification", tone: "neutral" };
}

export function RpcEvidenceList({ view }: Pick<NetworkProofProps, "view">) {
  return (
    <ul className={styles.evidenceList} aria-label="Zcash RPC evidence methods">
      {ZCASH_RPC_METHODS.map((method) => {
        const presentation = getEvidencePresentation(method, view);

        return (
          <li key={method} data-tone={presentation.tone}>
            <span
              aria-hidden
              className={`${styles.evidenceMark} ${styles[`tone_${presentation.tone}`]}`}
            />
            <span className={styles.evidenceMethod}>
              <code>{method}</code>
              <small>{METHOD_PURPOSES[method]}</small>
            </span>
            <span className={styles.evidenceResult}>
              <strong>{presentation.label}</strong>
              {presentation.evidence ? (
                <small>
                  {presentation.evidence.latencyMs === null
                    ? "Latency unavailable"
                    : `${presentation.evidence.latencyMs.toLocaleString("en")} ms`}
                  {" · "}
                  <time dateTime={presentation.evidence.observedAt}>
                    {formatDateTime(presentation.evidence.observedAt)} UTC
                  </time>
                </small>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function LoadingMetrics({ message }: { message?: string }) {
  return (
    <div className={styles.metrics} aria-hidden>
      <div className={styles.metric}>
        <span>Latest block</span>
        <strong className={styles.loadingValue}>—</strong>
        <small>{message ?? "Loading live data…"}</small>
      </div>
      <div className={styles.metric}>
        <span>Observed at</span>
        <strong className={styles.loadingValue}>—</strong>
        <small>Waiting for Testnet</small>
      </div>
      <div className={styles.metric}>
        <span>Best block hash</span>
        <strong className={styles.loadingValue}>—</strong>
        <small>Waiting for RPC evidence</small>
      </div>
    </div>
  );
}

export function NetworkProofPanel({
  view,
  onRetry,
  className,
}: NetworkProofProps) {
  const titleId = useId();
  const copy = STATUS_COPY[view.status];
  const classes = [styles.panel, className].filter(Boolean).join(" ");

  return (
    <section
      aria-busy={view.status === "loading" || undefined}
      aria-labelledby={titleId}
      className={classes}
      data-network-status={view.status}
    >
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Live network proof</span>
          <h2 id={titleId}>Testnet observation</h2>
          <p>
            RPC responses supplied by the server show what Zecceipt observed.
            They never prove that a missing response means a missing payment.
          </p>
        </div>
        <TestnetNetworkBadge status={view.status} />
      </header>

      <div
        aria-live="polite"
        className={`${styles.stateBanner} ${styles[`state_${view.status}`]}`}
        role="status"
      >
        <span>
          <StatusBadge status={view.status} />
          <span>{copy.detail}</span>
        </span>
        {view.status === "unavailable" && onRetry ? (
          <button onClick={onRetry} type="button">
            Retry connection
            <span aria-hidden>↻</span>
          </button>
        ) : null}
      </div>

      {view.status === "loading" ? (
        <LoadingMetrics message={view.message} />
      ) : view.status === "unavailable" ? (
        <div className={styles.unavailableDetails}>
          <div>
            <span>Latest block</span>
            <strong>Unavailable</strong>
            <small>No current height was supplied.</small>
          </div>
          <div>
            <span>Last successful observation</span>
            {view.lastSuccessfulAt ? (
              <time dateTime={view.lastSuccessfulAt}>
                {formatDateTime(view.lastSuccessfulAt)} UTC
              </time>
            ) : (
              <strong>Not supplied</strong>
            )}
          </div>
          <p>{view.message}</p>
        </div>
      ) : (
        <>
          <div className={styles.metrics}>
            <div className={styles.metric}>
              <span>Latest block</span>
              <strong className={styles.mono}>
                {view.snapshot.blockHeight.toLocaleString("en")}
              </strong>
              <small>Height supplied by the live network view</small>
            </div>
            <div className={styles.metric}>
              <span>Observed at</span>
              <time className={styles.mono} dateTime={view.snapshot.observedAt}>
                {formatDateTime(view.snapshot.observedAt)} UTC
              </time>
              <small>Timestamp supplied with this snapshot</small>
            </div>
            <div className={styles.metric}>
              <span>Best block hash</span>
              {view.snapshot.blockHash ? (
                <code>{view.snapshot.blockHash}</code>
              ) : (
                <strong>Not supplied</strong>
              )}
              <small>
                Full value remains visible and wraps on small screens
              </small>
            </div>
          </div>

          {view.status === "syncing" &&
          view.snapshot.verificationProgress !== undefined ? (
            <div className={styles.syncProgress}>
              <span>
                <strong>Chain verification progress</strong>
                <span>
                  {formatProgress(view.snapshot.verificationProgress).label}%
                </span>
              </span>
              <div
                aria-label="Chain verification progress"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={
                  formatProgress(view.snapshot.verificationProgress).numeric
                }
                className={styles.progressTrack}
                role="progressbar"
              >
                <span
                  style={{
                    width: `${formatProgress(view.snapshot.verificationProgress).numeric}%`,
                  }}
                />
              </div>
            </div>
          ) : null}
        </>
      )}

      <div className={styles.evidence}>
        <div className={styles.evidenceHeading}>
          <div>
            <span className={styles.eyebrow}>RPC evidence</span>
            <h3>Methods used by Zecceipt</h3>
          </div>
          <p>
            A response state appears only when supplied by the server. Other
            allowlisted methods remain neutral.
          </p>
        </div>
        <RpcEvidenceList view={view} />
      </div>
    </section>
  );
}
