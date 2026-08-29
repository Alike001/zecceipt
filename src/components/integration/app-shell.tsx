import Link from "next/link";
import type { ReactNode } from "react";

import { Brand } from "@/components/marketing/brand";

import styles from "./integration.module.css";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Brand inverted={false} />
          <nav aria-label="Application navigation">
            <Link href="/">Home</Link>
            <Link href="/create">Create invoice</Link>
          </nav>
          <span className={styles.networkLabel}>Zcash Testnet · TAZ</span>
        </div>
      </header>
      {children}
      <footer className={styles.footer}>
        <span>Zecceipt observes payments. It never holds wallet keys.</span>
        <Link href="/">Privacy boundary and RPC methods</Link>
      </footer>
    </main>
  );
}
