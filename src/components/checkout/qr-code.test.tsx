import { render } from "@testing-library/react";
import jsQR from "jsqr";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { QrCode } from "@/components/checkout/qr-code";

const zip321Uri =
  "zcash:tm9iZ2fN6E4h9H5Zz5K8y1X2w3V4u5T6s7R?amount=0.25000000&message=Order%20884920";

describe("QrCode", () => {
  it("round-trips the exact ZIP-321 URI through a QR decoder", async () => {
    const { container } = render(
      <QrCode
        value={zip321Uri}
        size={1000}
        ariaLabel="Test ZIP-321 payment request"
      />,
    );
    const svg = container.querySelector("svg");

    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-label", "Test ZIP-321 payment request");

    const { data, info } = await sharp(Buffer.from(svg!.outerHTML))
      .resize(1000, 1000, { kernel: "nearest" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);

    expect(decoded?.data).toBe(zip321Uri);
  });
});
