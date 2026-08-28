# AGENTS.md

## Project Snapshot

Zecceipt confirms transparent Zcash Testnet payments and turns matched transaction outputs into merchant receipts. It observes payments but never holds keys, signs transactions, or moves funds.

## Working Rules

- Work from a GitHub issue on a fresh branch based on current `main`.
- Keep pull requests focused on one issue and within its declared file ownership.
- Only the project lead merges into `main`.
- Keep RPC and database credentials server-side.
- Represent settlement amounts as integer zatoshis; never decide payment status with floating-point arithmetic.
- Match invoices to decoded transaction outputs by recipient, value, transaction ID, and output index.
- Treat RPC failures as unavailable state, never as proof of payment.

## Commands

Use the committed npm lockfile. Node.js 20.9 or newer is required.

```text
npm ci
npm run dev
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run secret:check
npm run build
npm run verify
```

## Quality Gates

- Run every command established by the application scaffold before requesting review.
- Add focused tests for changed behavior and include screenshots for UI changes.
- Keep live QuickNode checks out of untrusted fork pull-request workflows; use sanitized fixtures there.
- The lead runs real RPC smoke tests locally before merging payment-related work.
- Inspect production output for secret or endpoint leakage before deployment.

## Context Workflow

- GitHub issues define task scope, dependencies, allowed files, and acceptance criteria.
- The Zecceipt MVP milestone defines the delivery sequence.
- Fetch current official documentation before implementing framework, SDK, API, CLI, or cloud-service behavior.

## PR And Review Expectations

- Use conventional commits such as `feat(rpc): ...`, `fix(receipt): ...`, and `test(payment): ...`.
- Include the issue reference, verification commands and results, screenshots when applicable, and any new dependency with justification.
- Contributors work through forks and open pull requests into this repository.
- Use squash merging after CI passes and the lead completes review.

## Do Not

- Do not commit `.env` files, QuickNode URLs or tokens, database credentials, wallet seeds, private keys, or viewing keys.
- Do not use address balance alone as evidence that an invoice was paid.
- Do not ship mock live data, manual `mark paid` controls, or hidden fallback values in the judged path.
- Do not claim the MVP can confirm shielded or Unified recipient details.
- Do not change shared contracts, core RPC code, persistence, migrations, or invoice state rules from contributor-owned UI issues without lead approval.
