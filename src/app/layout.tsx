import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zecceipt",
  description:
    "Confirm transparent Zcash Testnet payments and issue verifiable receipts.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
