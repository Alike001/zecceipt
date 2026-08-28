import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("Home", () => {
  it("identifies the Zecceipt scaffold", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Zecceipt" }),
    ).toBeInTheDocument();
  });
});
