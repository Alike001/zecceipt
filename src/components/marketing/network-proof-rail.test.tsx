import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NetworkProofRail } from "@/components/marketing/network-proof-rail";

describe("NetworkProofRail", () => {
  it("renders supplied live Testnet data", () => {
    render(
      <NetworkProofRail
        view={{
          status: "live",
          snapshot: {
            network: "testnet",
            blockHeight: 3_456_789,
            observedAt: "2026-08-29T10:15:30.000Z",
            rpcMethods: ["getblockchaininfo", "getblockcount"],
          },
        }}
      />,
    );

    expect(screen.getByText("3,456,789")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("10:15:30 UTC")).toBeInTheDocument();
  });

  it("does not present an RPC outage as a healthy or unpaid state", () => {
    const onRetry = vi.fn();

    render(
      <NetworkProofRail
        view={{
          status: "unavailable",
          message: "The Testnet RPC did not respond.",
        }}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("Verification paused")).toBeInTheDocument();
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
    expect(screen.queryByText(/unpaid/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
