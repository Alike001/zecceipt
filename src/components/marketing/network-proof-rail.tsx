"use client";

import type { NetworkProofProps } from "@/types";

function formatObservedAt(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(value));
}

function LoadingValue({ children }: { children: string }) {
  return <span className="network-rail__loading">{children}</span>;
}

export function NetworkProofRail({
  view,
  onRetry,
  className,
}: NetworkProofProps) {
  const classes = ["network-rail", className].filter(Boolean).join(" ");

  if (view.status === "loading") {
    return (
      <section className={classes} aria-label="Live Zcash network" aria-busy>
        <div className="network-rail__item">
          <span className="network-rail__label">Network</span>
          <LoadingValue>Checking Testnet…</LoadingValue>
        </div>
        <div className="network-rail__item">
          <span className="network-rail__label">Latest block</span>
          <LoadingValue>{view.message ?? "Loading live data…"}</LoadingValue>
        </div>
        <div className="network-rail__item">
          <span className="network-rail__label">RPC status</span>
          <LoadingValue>Connecting…</LoadingValue>
        </div>
        <div className="network-rail__item">
          <span className="network-rail__label">Last checked</span>
          <LoadingValue>—</LoadingValue>
        </div>
      </section>
    );
  }

  if (view.status === "unavailable") {
    return (
      <section
        className={`${classes} network-rail--unavailable`}
        aria-label="Live Zcash network unavailable"
        role="status"
      >
        <div className="network-rail__item">
          <span className="network-rail__label">Network</span>
          <strong>Testnet</strong>
        </div>
        <div className="network-rail__item">
          <span className="network-rail__label">Latest block</span>
          <span>Not available</span>
        </div>
        <div className="network-rail__item">
          <span className="network-rail__label">RPC status</span>
          <span className="network-rail__status network-rail__status--paused">
            Verification paused
          </span>
        </div>
        <div className="network-rail__item network-rail__item--message">
          <span className="network-rail__label">What this means</span>
          <span>{view.message}</span>
          {onRetry ? (
            <button
              className="network-rail__retry"
              onClick={onRetry}
              type="button"
            >
              Try again
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  const { snapshot } = view;
  const statusLabel =
    view.status === "live"
      ? "Connected"
      : view.status === "syncing"
        ? "Node syncing"
        : "Data may be stale";

  return (
    <section className={classes} aria-label="Live Zcash network" role="status">
      <div className="network-rail__item">
        <span className="network-rail__label">Network</span>
        <strong>Zcash Testnet</strong>
      </div>
      <div className="network-rail__item">
        <span className="network-rail__label">Latest block</span>
        <strong className="mono">
          {snapshot.blockHeight.toLocaleString("en")}
        </strong>
      </div>
      <div className="network-rail__item">
        <span className="network-rail__label">RPC status</span>
        <span
          className={`network-rail__status network-rail__status--${view.status}`}
        >
          {statusLabel}
        </span>
      </div>
      <div className="network-rail__item">
        <span className="network-rail__label">Last checked</span>
        <time className="mono" dateTime={snapshot.observedAt}>
          {formatObservedAt(snapshot.observedAt)} UTC
        </time>
      </div>
    </section>
  );
}
