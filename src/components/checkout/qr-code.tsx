"use client";

import { QRCodeSVG } from "qrcode.react";

export interface QrCodeProps {
  value: string;
  size?: number;
  className?: string;
  ariaLabel?: string;
}

export function QrCode({
  value,
  size = 200,
  className,
  ariaLabel = "Payment request QR code",
}: QrCodeProps) {
  return (
    <QRCodeSVG
      value={value}
      size={size}
      level="M"
      marginSize={4}
      title={ariaLabel}
      role="img"
      aria-label={ariaLabel}
      className={className}
      bgColor="#ffffff"
      fgColor="#0b0c0b"
      style={{
        display: "block",
        maxWidth: "100%",
        height: "auto",
        borderRadius: "0.4rem",
      }}
    />
  );
}
