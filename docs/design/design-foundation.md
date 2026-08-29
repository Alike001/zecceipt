# Zecceipt Design Foundation

Issue: #3  
Status: shared contract for contributor UI work

## Product signal

Zecceipt is a merchant payment-confirmation tool, not a wallet, exchange, or block explorer. Its primary visual metaphor is a receipt edge: small perforations and notches identify invoice and evidence surfaces without turning the interface into decoration.

The product must always say **Zcash Testnet** and **transparent recipient** where ambiguity could make someone believe real ZEC or shielded-recipient confirmation is supported.

Visible Testnet amount labels use **TAZ**, the valueless Testnet currency code. Existing shared fields such as `amountZec` remain stable because they represent a decimal amount in Zcash base units; contributor components must render those values as TAZ whenever `network` is `testnet`.

## Concept references

- [`landing.png`](./concepts/landing.png): page hierarchy, alternating bands, product preview, evidence and privacy explanation.
- [`create-invoice.png`](./concepts/create-invoice.png): merchant form hierarchy, field states, Testnet boundary and RPC failure treatment.
- [`checkout-receipt.png`](./concepts/checkout-receipt.png): checkout hierarchy, payment timeline, receipt anatomy and fail-safe RPC state.

These concepts are implementation references, not production assets. Real interface text, QR codes, status, evidence and controls are rendered in code.

## Visual tokens

| Role                | Token                  | Value     |
| ------------------- | ---------------------- | --------- |
| Dark canvas         | `--color-ink`          | `#0b0c0b` |
| Raised dark surface | `--color-ink-soft`     | `#131512` |
| Light canvas        | `--color-paper`        | `#f5f3ec` |
| True white          | `--color-white`        | `#ffffff` |
| Primary ink         | `--color-text`         | `#121310` |
| Dark-surface text   | `--color-text-on-ink`  | `#f7f6f0` |
| Muted ink           | `--color-muted`        | `#64655f` |
| Muted on dark       | `--color-muted-on-ink` | `#a8aaa2` |
| Zcash action accent | `--color-zec`          | `#f4b728` |
| Accent hover        | `--color-zec-strong`   | `#ffc43d` |
| Confirmed           | `--color-success`      | `#4f9c52` |
| RPC interruption    | `--color-info`         | `#6ca5ff` |
| Hairline on light   | `--color-line`         | `#d7d5ce` |
| Hairline on dark    | `--color-line-on-ink`  | `#31332f` |

Spacing uses a 4px base. The shared sequence is `4, 8, 12, 16, 24, 32, 48, 64, 96`. Controls are at least 44px tall. Corners remain between 6px and 10px except circular state marks.

Headlines use a compact system grotesk stack; body copy uses the platform sans stack; addresses, hashes, amounts, timestamps and RPC method names use the shared monospace stack.

## Shared component boundaries

Contributor components import their props from `@/types` and must not redefine domain or status unions locally.

- Merchant UI: `MerchantInvoiceFormProps`
- Checkout summary and QR slot: `CheckoutPaymentSummaryProps`
- Live network and RPC proof: `NetworkProofProps`
- Payment timeline: `PaymentStatusProps`
- Paid receipt: `ReceiptProps`

The types intentionally keep amounts as decimal strings or integer-zatoshi strings. UI code must never convert settlement amounts to floating-point numbers.

`rpc_unavailable` preserves a `lastKnownStatus`. It is an observation failure, not a financial state transition. Components must keep the last known payment meaning visible and explain that verification is paused.

## Copy and state rules

- Say “Create an invoice” or “Create a payment request,” not “Connect wallet.”
- Label Testnet payment amounts as “TAZ,” with helper copy explaining that TAZ has no real monetary value.
- Say “Payment received” only for `paid` or `overpaid` data supplied by the verifier.
- Say “Verification paused” for RPC outages; never imply that funds are missing.
- Show full copy access for every address and transaction ID, even when a fingerprint is displayed.
- Treat the landing payment frame as an explicitly labelled interface preview. Live network values must be supplied through `NetworkProofViewModel`; no hard-coded height is permitted.
- Fixture values are allowed only in tests and isolated previews. They cannot appear as live chain claims.

## Responsive behavior

- Desktop content maxes out at `1200px` with fluid gutters.
- The hero becomes one column below `900px`; its payment preview follows the primary copy.
- Four-step rails become a vertical ordered list below `760px`.
- Evidence and privacy comparisons stack without horizontal scrolling.
- Hashes and addresses use `overflow-wrap: anywhere`; copy actions remain keyboard reachable.
- Reduced-motion users receive no scanning or heartbeat animation.

## Fidelity ledger

The production browser render was checked against `concepts/landing.png` at 1440px and 390px widths.

| Comparison point       | Concept evidence                                                                         | Browser evidence                                                                  | Resolution                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Hero hierarchy         | Large left-aligned promise beside one dominant invoice frame                             | `renders/landing-desktop.png` keeps the same two-region hierarchy                 | Widened the copy column and reduced the maximum title size after the first render wrapped to four lines |
| Palette and bands      | Near-black first viewport, warm paper process/privacy sections, controlled yellow accent | Both saved renders preserve the alternating dark/light cadence                    | Tokens match the concept values; no palette reinterpretation                                            |
| Receipt motif          | Side notches distinguish the checkout and evidence specimen                              | Invoice preview and evidence band use small opposing notches                      | Kept the motif off ordinary sections to avoid decorative repetition                                     |
| Live-network treatment | Four-column rail below the hero with loading and availability states                     | Desktop uses four columns; mobile stacks without horizontal overflow              | Browser measurement at 390px reported `scrollWidth === viewport`                                        |
| Evidence anatomy       | Wide receipt evidence with field labels and named RPC methods                            | Render shows transaction/output/amount/block/confirmation rows plus three methods | Replaced sample hashes and heights with honest explanatory placeholders                                 |
| Privacy boundary       | Two-column “sees / stays private” comparison                                             | Desktop comparison remains side-by-side and stacks on mobile                      | Reduced headline scale after the first pass to preserve readable balance                                |
| Mobile continuation    | Primary copy, invoice frame, state rail, process, evidence and privacy stack in order    | `renders/landing-mobile.png` shows the complete order at 390px                    | CTA controls expand to full width and ordered steps become a vertical timeline                          |

Intentional deviation: the hero frame is labelled **Interface preview** and uses shortened sample payment data. This prevents marketing UI from being mistaken for a live transaction. Every network value remains in the typed loading/live/unavailable slot until the real API is integrated.
