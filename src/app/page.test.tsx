import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Home from "@/app/page";

const mocks = vi.hoisted(() => ({ getLiveNetworkView: vi.fn() }));

vi.mock("@/lib/zcash/network", () => ({
  getLiveNetworkView: mocks.getLiveNetworkView,
}));

describe("Home", () => {
  beforeEach(() => {
    mocks.getLiveNetworkView.mockResolvedValue({
      status: "live",
      snapshot: {
        network: "testnet",
        blockHeight: 4_310_128,
        observedAt: "2026-08-29T12:00:00.000Z",
        rpcMethods: ["getblockchaininfo", "getblockcount"],
      },
    });
  });

  it("explains the transparent Testnet payment promise", async () => {
    render(await Home());

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Know when the ZEC arrives.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/confirms transparent Testnet recipients only/i),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /create (an )?invoice/i }),
    ).toHaveLength(3);
    expect(screen.getByText("Generated per invoice")).toBeInTheDocument();
    expect(screen.queryByText("0.04200137 ZEC")).not.toBeInTheDocument();
  });

  it("renders live block data instead of a hard-coded block height", async () => {
    render(await Home());

    expect(screen.getAllByText("4,310,128")).toHaveLength(2);
    expect(screen.getByLabelText("Live Zcash network")).not.toHaveAttribute(
      "aria-busy",
    );
  });
});
