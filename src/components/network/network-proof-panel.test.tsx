import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NetworkProofPanel } from "@/components/network/network-proof-panel";

const snapshot = {
  network: "testnet" as const,
  blockHeight: 3_456_789,
  blockHash: "00000000012ca72884d5b14f2f75d2a474956f685e436b2f3f33873a4af50123",
  observedAt: "2026-08-29T10:15:30.000Z",
  verificationProgress: 0.9996,
  rpcMethods: [
    "getblockchaininfo" as const,
    "getblockcount" as const,
    "validateaddress" as const,
  ],
};

describe("NetworkProofPanel", () => {
  it("renders only supplied live values and identifies the RPC method catalog", () => {
    render(
      <NetworkProofPanel
        view={{
          status: "live",
          snapshot,
          evidence: [
            {
              method: "getblockchaininfo",
              state: "success",
              observedAt: snapshot.observedAt,
              latencyMs: 184,
            },
            {
              method: "getblockcount",
              state: "success",
              observedAt: snapshot.observedAt,
              latencyMs: 92,
            },
            {
              method: "validateaddress",
              state: "error",
              observedAt: snapshot.observedAt,
              latencyMs: null,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("3,456,789")).toBeInTheDocument();
    expect(screen.getByText(snapshot.blockHash)).toBeInTheDocument();
    expect(screen.getAllByText("Zcash Testnet")).not.toHaveLength(0);

    const methods = screen.getByRole("list", {
      name: "Zcash RPC evidence methods",
    });
    expect(within(methods).getByText("getblockchaininfo")).toBeInTheDocument();
    expect(within(methods).getByText("getblockcount")).toBeInTheDocument();
    expect(within(methods).getByText("validateaddress")).toBeInTheDocument();
    expect(within(methods).getByText("getaddresstxids")).toBeInTheDocument();
    expect(within(methods).getByText("getrawtransaction")).toBeInTheDocument();
    expect(within(methods).getAllByText("Responded")).toHaveLength(2);
    expect(within(methods).getByText("RPC error")).toBeInTheDocument();
  });

  it("shows supplied node sync progress without presenting the node as ready", () => {
    render(<NetworkProofPanel view={{ status: "syncing", snapshot }} />);

    expect(screen.getAllByText("Node syncing")).not.toHaveLength(0);
    expect(screen.queryByText("Node ready")).not.toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Chain verification progress" }),
    ).toHaveAttribute("aria-valuenow", "99.96");
    expect(screen.getByText("99.96%")).toBeInTheDocument();
  });

  it("keeps stale data visible with an explicit freshness warning", () => {
    render(<NetworkProofPanel view={{ status: "stale", snapshot }} />);

    expect(screen.getAllByText("Data may be stale")).not.toHaveLength(0);
    expect(screen.getByText("3,456,789")).toBeInTheDocument();
    expect(screen.queryByText("Node ready")).not.toBeInTheDocument();
  });

  it("never presents unavailable state or evidence as healthy", () => {
    const onRetry = vi.fn();
    const longError =
      "The Testnet RPC endpoint returned a long upstream error that must wrap without changing payment state or implying that customer funds are missing.";
    render(
      <NetworkProofPanel
        onRetry={onRetry}
        view={{
          status: "unavailable",
          message: longError,
          lastSuccessfulAt: "2026-08-29T10:10:00.000Z",
        }}
      />,
    );

    const panel = screen.getByRole("region", { name: "Testnet observation" });
    expect(panel).toHaveAttribute("data-network-status", "unavailable");
    expect(within(panel).getAllByText("Verification paused")).not.toHaveLength(
      0,
    );
    expect(within(panel).getByText(longError)).toBeInTheDocument();
    expect(within(panel).queryByText("Node ready")).not.toBeInTheDocument();
    expect(within(panel).queryByText("Responded")).not.toBeInTheDocument();
    expect(within(panel).getAllByText("Not checked")).toHaveLength(6);
    expect(
      within(panel).queryByText(/payment (missing|unpaid)/i),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(panel).getByRole("button", { name: /retry connection/i }),
    );
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("announces loading state without inventing a block height", () => {
    render(
      <NetworkProofPanel
        view={{ status: "loading", message: "Contacting Testnet RPC…" }}
      />,
    );

    const panel = screen.getByRole("region", { name: "Testnet observation" });
    expect(panel).toHaveAttribute("aria-busy", "true");
    expect(within(panel).getAllByText("Connecting")).not.toHaveLength(0);
    expect(
      within(panel).getByText("Contacting Testnet RPC…"),
    ).toBeInTheDocument();
    expect(within(panel).queryByText("3,456,789")).not.toBeInTheDocument();
  });
});
