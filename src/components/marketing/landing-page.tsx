import Link from "next/link";

import { Brand } from "@/components/marketing/brand";
import { NetworkProofRail } from "@/components/marketing/network-proof-rail";
import type { NetworkProofViewModel } from "@/types";

interface LandingPageProps {
  network: NetworkProofViewModel;
}

const steps = [
  {
    title: "Create",
    body: "Enter your transparent Testnet address, amount, label, and expiry.",
  },
  {
    title: "Customer pays",
    body: "Your customer sends the exact TAZ shown on the Testnet checkout.",
  },
  {
    title: "Zecceipt verifies",
    body: "The app finds the matching transparent output and tracks confirmations.",
  },
  {
    title: "Receipt ready",
    body: "Both sides get readable evidence tied to the transaction output.",
  },
] as const;

const rpcMethods = [
  "getaddresstxids",
  "getrawtransaction",
  "getblockcount",
] as const;

export function LandingPage({ network }: LandingPageProps) {
  const hasSnapshot =
    network.status === "live" ||
    network.status === "syncing" ||
    network.status === "stale";
  const previewBlockHeight = hasSnapshot
    ? network.snapshot.blockHeight.toLocaleString("en")
    : network.status === "unavailable"
      ? "Unavailable"
      : "Loading live data…";
  const previewRpcStatus = hasSnapshot
    ? network.status === "live"
      ? "Connected"
      : network.status === "syncing"
        ? "Node syncing"
        : "Data may be stale"
    : network.status === "unavailable"
      ? "Verification paused"
      : "Connecting…";

  return (
    <main className="landing">
      <div className="landing__dark">
        <header className="site-header shell">
          <Brand />
          <nav className="site-nav" aria-label="Primary navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#live-network">Live network</a>
            <a href="#privacy-boundary">Limits</a>
          </nav>
          <Link
            className="button button--small"
            href="/create"
            prefetch={false}
          >
            Create invoice
          </Link>
        </header>

        <section className="hero shell" aria-labelledby="hero-title">
          <div className="hero__copy">
            <h1 id="hero-title">Know when the TAZ arrives.</h1>
            <p>
              Create a Testnet payment request. Zecceipt watches the transparent
              output, waits for confirmation, and turns it into a receipt.
            </p>
            <div className="hero__actions">
              <Link className="button" href="/create" prefetch={false}>
                Create an invoice
                <span aria-hidden="true">→</span>
              </Link>
              <a className="text-link" href="#rpc-proof">
                See how verification works
                <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>

          <div
            className="invoice-preview"
            aria-label="Example invoice interface"
          >
            <div className="invoice-preview__topline">
              <span>Interface preview</span>
              <span className="status-dot">Waiting for payment</span>
            </div>
            <h2>Example invoice</h2>
            <div className="invoice-preview__body">
              <div>
                <span className="data-label">Exact amount</span>
                <strong className="invoice-preview__amount mono">
                  Generated per invoice
                </strong>
                <span className="data-label">
                  Transparent address · Testnet
                </span>
                <code className="invoice-preview__address">
                  Merchant t-address
                </code>
              </div>
              <div
                className="qr-preview"
                aria-label="Invoice QR placement preview"
              >
                <span aria-hidden="true" />
                <small>Preview only · Real QR generated per invoice</small>
              </div>
            </div>
            <div className="invoice-preview__network">
              <span>
                <small>Network</small>
                Zcash Testnet
              </span>
              <span>
                <small>Block height</small>
                {previewBlockHeight}
              </span>
              <span>
                <small>RPC status</small>
                {previewRpcStatus}
              </span>
            </div>
          </div>
        </section>

        <div id="live-network" className="shell landing__network-anchor">
          <NetworkProofRail view={network} />
        </div>
      </div>

      <section
        className="process section shell"
        id="how-it-works"
        aria-labelledby="process-title"
      >
        <div className="section-heading">
          <h2 id="process-title">How it works</h2>
          <span aria-hidden="true" />
        </div>
        <ol className="process__steps">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className="process__number">{index + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="evidence-wrap shell" id="rpc-proof">
        <div className="evidence">
          <h2>A receipt backed by the chain.</h2>
          <div className="receipt-preview">
            <dl className="receipt-preview__fields">
              <div>
                <dt>Transaction ID</dt>
                <dd>Appears after a matching output is found</dd>
              </div>
              <div>
                <dt>Output</dt>
                <dd className="mono">txid + output index</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>Matched in integer zatoshis</dd>
              </div>
              <div>
                <dt>Block</dt>
                <dd>Height and hash from Testnet</dd>
              </div>
              <div>
                <dt>Confirmations</dt>
                <dd>Tracked against the invoice target</dd>
              </div>
            </dl>
            <div className="receipt-preview__rpc">
              <span>RPC methods used</span>
              {rpcMethods.map((method) => (
                <code key={method}>{method}</code>
              ))}
              <span className="receipt-preview__scan">
                Live evidence appears here
              </span>
            </div>
          </div>
        </div>
      </section>

      <section
        className="privacy section shell"
        id="privacy-boundary"
        aria-labelledby="privacy-title"
      >
        <div className="privacy__intro">
          <h2 id="privacy-title">
            Private by design.
            <br />
            Honest about the boundary.
          </h2>
          <p>
            Zecceipt confirms transparent Testnet recipients only. It never asks
            for a seed phrase or spending key, and it cannot reveal shielded
            amounts or addresses.
          </p>
        </div>
        <div className="privacy__comparison">
          <div>
            <h3>What Zecceipt sees</h3>
            <ul>
              <li>Transparent Testnet recipient</li>
              <li>Matching incoming output and amount</li>
              <li>Block height and confirmations</li>
              <li>Transaction and output identity</li>
            </ul>
          </div>
          <div>
            <h3>What stays private</h3>
            <ul>
              <li>Shielded addresses and amounts</li>
              <li>Seed phrases and spending keys</li>
              <li>Wallet access and signing authority</li>
              <li>Plaintext the chain does not publish</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="final-cta">
        <div className="shell final-cta__inner" id="create-invoice">
          <div>
            <h2>Turn a payment into proof.</h2>
            <p>Simple for you. Verifiable for your customer.</p>
          </div>
          <Link className="button" href="/create" prefetch={false}>
            Create an invoice
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <footer className="site-footer">
        <div className="shell site-footer__inner">
          <div>
            <Brand />
            <p>Built for Zcash Testnet.</p>
          </div>
          <nav aria-label="Footer navigation">
            <a href="https://github.com/Alike001/zecceipt">GitHub</a>
            <a href="#rpc-proof">RPC methods</a>
            <a href="#privacy-boundary">Limitations</a>
          </nav>
        </div>
      </footer>
    </main>
  );
}
