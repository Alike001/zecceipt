import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("Home", () => {
  it("explains the transparent Testnet payment promise", () => {
    render(<Home />);

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
  });

  it("renders an honest loading slot instead of a hard-coded block height", () => {
    render(<Home />);

    expect(screen.getAllByText("Loading live data…")).toHaveLength(2);
    expect(screen.getByLabelText("Live Zcash network")).toHaveAttribute(
      "aria-busy",
    );
  });
});
