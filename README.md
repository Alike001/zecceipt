# Zecceipt

**Confirm transparent Zcash Testnet payments. Issue verifiable receipts.**

Zecceipt is a non-custodial merchant payment-confirmation app. A merchant
creates an invoice for a transparent Zcash Testnet address and a customer sends
the exact requested amount. Zecceipt uses Zcash JSON-RPC to discover matching
transparent outputs, track their confirmations, and render a public receipt.

> **Hackathon RPC requirement:** invoice creation already makes three live,
> server-side calls: `validateaddress`, `getblockchaininfo`, and
> `getblockcount`. The typed RPC client supports five payment-related methods
> in total; the complete table is below.

## What is implemented

| Surface                                | Current behavior                                                                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                    | Renders the product landing page with a server-fetched Testnet network rail showing height, RPC availability, and observation time.                                    |
| `/create`                              | Validates the address on blur, creates a durable invoice, links to its checkout, and keeps a public recent-invoice list in browser storage.                            |
| `/checkout/{invoiceId}`                | Loads the public invoice, renders its exact amount and ZIP-321 QR, polls immediately and every eight seconds, and displays a receipt after settlement.                 |
| `GET /api/network`                     | Reports live/syncing/unavailable Testnet state, height, and RPC evidence. Returns `503` when live network evidence is unavailable.                                     |
| `POST /api/addresses/validate`         | Checks a syntactically eligible transparent Testnet address with `validateaddress`; keeps provider failures distinct from invalid addresses.                           |
| `POST /api/invoices`                   | Validates the recipient, reads current chain state, stores an invoice in PostgreSQL, and returns public checkout and private management contracts.                     |
| `GET /api/invoices/{invoiceId}/status` | Scans blocks after invoice creation, reconciles matching recipient outputs, persists status, and returns RPC evidence without turning provider failures into “unpaid.” |

The public customer-to-merchant browser flow is wired end to end. The API also
returns `/merchant/invoices/{invoiceId}` and a one-time management token, but a
private merchant-management page is not routed yet. The `/create` page stores
only public recent-invoice details in the browser and links back to public
checkout pages. See the [judge walkthrough](docs/judge-demo.md) for the exact
demo sequence.

## RPC methods

Every outbound RPC call goes through a server-only, allow-listed JSON-RPC
client. Provider errors become an unavailable state; they are never interpreted
as proof that an invoice is unpaid.

| Method                                                                    | Visible purpose in Zecceipt                                                                       | Current integration                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`validateaddress`](https://zcash.github.io/rpc/validateaddress.html)     | Ask the node to validate an eligible `tm` or `t2` recipient before an invoice is stored.          | Called by address checking and `POST /api/invoices`.                 |
| [`getblockchaininfo`](https://zcash.github.io/rpc/getblockchaininfo.html) | Confirm that the endpoint serves Testnet and expose node sync state.                              | Called by invoice creation and `GET /api/network`.                   |
| [`getblockcount`](https://zcash.github.io/rpc/getblockcount.html)         | Record invoice creation height and bound each later payment scan at the current height.           | Called by invoice creation, network proof, and payment verification. |
| [`getaddresstxids`](https://zcash.github.io/rpc/getaddresstxids.html)     | Discover transaction IDs for the transparent recipient between creation and current height.       | Called by the invoice-status verifier.                               |
| [`getrawtransaction`](https://zcash.github.io/rpc/getrawtransaction.html) | Inspect mined outputs, output indexes, integer zatoshi values, block evidence, and confirmations. | Called for each candidate transaction found by the status verifier.  |

The first three calls satisfy the three-method hackathon requirement during
invoice creation. During verification, Zecceipt sums positive outputs to the
invoice recipient, persists each transaction ID and output index, and declares
the invoice paid only when the integer-zatoshi total equals the expected total
and the configured confirmation target is met. A larger confirmed total is
reported as overpaid.

## Privacy and security boundary

Zecceipt intentionally supports **transparent Testnet recipients only**.
Transparent addresses, transferred amounts, and transaction relationships are
public blockchain data. The app must observe those details to match a payment,
so this MVP does not provide shielded-payment privacy.

- Testnet only; never send real ZEC.
- No wallet connection, custody, signing, spending, seed phrase, viewing key,
  or private key is required.
- Shielded and Unified recipients are rejected. Zecceipt cannot reveal shielded
  addresses, amounts, or plaintext transaction details.
- Amounts are parsed and compared as integer zatoshis, not floating-point
  numbers.
- The QuickNode URL, database URL, and management secret stay server-side.
  None may use the `NEXT_PUBLIC_` prefix.
- A newly created invoice returns its plaintext management token once. Only an
  HMAC hash is stored; treat the returned token like a password and never put it
  in screenshots, logs, URLs, or commits.
- An RPC timeout, malformed response, wrong network, or provider failure means
  **verification unavailable**, not **unpaid**.

## MVP limitations

- Only transparent `tm` and `t2` Testnet recipients are accepted.
- Verification scans mined transactions from the block after invoice creation;
  it does not treat a mempool transaction as payment evidence.
- A matched transaction must include reliable height, block hash, block time,
  confirmations, recipient, value, transaction ID, and output-index evidence.
- Outputs mined after the invoice expiry time are ignored. Testnet block timing
  can therefore affect short-lived demo invoices.
- QuickNode and PostgreSQL are runtime dependencies. Provider or database
  downtime prevents fresh verification; the last persisted state remains
  distinct from a live observation.
- Public checkout URLs are intentionally shareable. The generated private
  management contract is not yet exposed through a merchant-authenticated page.
- The recent-invoice list belongs to one browser's local storage and is not a
  merchant account or cross-device dashboard.

## Run a clean clone

### Prerequisites

- [Node.js](https://nodejs.org/) 20.9 or newer and npm
- A PostgreSQL database
- A QuickNode **Zcash Testnet** HTTPS endpoint. QuickNode's
  [Zcash quickstart](https://www.quicknode.com/docs/zcash/quickstart) explains
  how to create an endpoint and copy its HTTP URL.

### Install and configure

```bash
git clone https://github.com/Alike001/zecceipt.git
cd zecceipt
npm ci
cp .env.example .env.local
```

PowerShell equivalent:

```powershell
Copy-Item .env.example .env.local
```

Fill `.env.local` with your own values. Never commit this file.

| Variable                    | Required value                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| `QUICKNODE_ZCASH_RPC_URL`   | The complete HTTPS URL copied from a QuickNode Zcash **Testnet** endpoint.                     |
| `DATABASE_URL`              | A PostgreSQL or PostgreSQL-compatible connection URL. Use a pooled URL for serverless hosting. |
| `INVOICE_MANAGEMENT_SECRET` | At least 32 random characters used to hash merchant-management tokens.                         |

Generate a suitable management secret locally with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

The migration script runs outside Next.js and therefore needs `DATABASE_URL`
in the command environment. Export it through your shell's secure environment
handling or your hosting provider's secret manager, then apply migrations
without printing the value:

```bash
npm run db:migrate
```

Remove the temporary shell variable after migration when you are not using a
dedicated development terminal.

Start the app and open <http://localhost:3000>:

```bash
npm run dev
```

The app renders explicit unavailable states when a server dependency cannot be
reached. An invoice cannot be created without valid RPC and database
configuration.

## Run the customer-to-merchant demo

1. Open <http://localhost:3000> and confirm the network rail identifies
   Testnet. A syncing state is visible but not a failure; an unavailable state
   means the demo should pause.
2. Select **Create an invoice**, or open <http://localhost:3000/create>.
3. Enter a transparent Testnet address you control, a base amount, label,
   expiry, and confirmation target. Leaving the address field triggers a live
   `validateaddress` check.
4. Create the invoice and open the generated public checkout link.
5. In a funded Testnet wallet, scan the ZIP-321 QR or carefully copy the
   checkout's transparent address and **exact** amount. Never send real ZEC.
6. Keep the checkout open. It polls the server immediately and about every
   eight seconds. Once the transaction is mined, the timeline advances through
   partial or confirming states as appropriate.
7. After the matched outputs reach the confirmation target, the page displays
   paid or overpaid status and a receipt containing the transaction ID, output
   index, amount, block evidence, and confirmation count.

Use the [judge walkthrough](docs/judge-demo.md) for a timed presentation and
redaction checklist. Testnet block timing is outside the app's control, so
prepare a previously paid invoice as a receipt fallback while still showing the
new live send.

## Exercise the live APIs

Confirm the configured endpoint is serving a sufficiently synchronized Zcash
Testnet node:

```bash
curl --fail-with-body http://localhost:3000/api/network
```

A successful response has `status` equal to `live` or `syncing`, identifies the
network as `testnet`, and includes `getblockchaininfo` and `getblockcount`
evidence. A `503` is an unavailable result and should stop the payment demo.

Create an invoice after replacing the recipient placeholder with a transparent
Testnet address that you control:

```bash
curl --fail-with-body \
  --request POST http://localhost:3000/api/invoices \
  --header "Content-Type: application/json" \
  --data '{
    "recipientAddress": "REPLACE_WITH_YOUR_tm_OR_t2_TESTNET_ADDRESS",
    "amountZec": "0.00100000",
    "label": "Judge demo coffee",
    "expiryMinutes": "30",
    "confirmationTarget": "1"
  }'
```

The `201` response contains:

- `publicCheckout`: the public invoice ID, exact amount, recipient, expiry,
  creation height, and working public checkout path;
- `merchantManagement`: the private management token and reserved management
  path—redact this entire object from screenshots; and
- `rpcEvidence`: successful evidence for the three invoice-creation RPC calls.

Open `publicCheckout.checkoutPath`, send `publicCheckout.exactAmountZec` to its
recipient, and inspect the same server-side verification response used by the
checkout poller:

```bash
curl --fail-with-body http://localhost:3000/api/invoices/REPLACE_WITH_INVOICE_ID/status
```

The response contains the safe payment state and the RPC evidence collected for
that scan. It never contains the management token.

## Deploy without leaking secrets

Zecceipt requires a Node.js server because it uses route handlers, server-only
RPC calls, and PostgreSQL. A static export is not supported.

1. Create a managed PostgreSQL database and a QuickNode Zcash Testnet endpoint.
2. Add the three variables from `.env.example` to the hosting provider's secret
   or environment-variable settings. Do not commit `.env.local`, paste values
   into build logs, or rename them with `NEXT_PUBLIC_`.
3. Run `npm ci` with `DATABASE_URL` available to the migration process. Vercel
   automatically runs `npm run vercel-build`, which applies the idempotent
   migrations before `next build`. On another host, run `npm run db:migrate`
   and then `npm run build` explicitly.
4. Confirm the build completes without printing any environment-variable
   values.
5. Start the production server with `npm run start`.
6. After deployment, request `/api/network` and confirm it says `testnet` before
   creating an invoice.

The host must support Node.js 20.9+, outbound HTTPS to QuickNode, and outbound
PostgreSQL connections. See the official
[Next.js deployment guide](https://nextjs.org/docs/app/getting-started/deploying)
and [environment-variable guide](https://nextjs.org/docs/app/guides/environment-variables)
for platform-specific behavior.

## Verification

Run the same repository checks used before a pull request:

```bash
npm run verify
```

This checks formatting, lint, TypeScript, unit/component tests, the repository
secret scan, and the production build. With
`QUICKNODE_ZCASH_RPC_URL` exported in the test process, the normally skipped
live contract test also exercises all five allow-listed methods:

```bash
npm test -- src/lib/zcash/live-contract.test.ts
```

## Product evidence

These screenshots come from implemented components, not external mockups:

- [Landing page, desktop](docs/design/renders/landing-desktop.png)
- [Landing page, mobile](docs/design/renders/landing-mobile.png)
- [Merchant form, desktop](src/components/merchant/screenshots/merchant-form-desktop.png)
- [Merchant form, mobile](src/components/merchant/screenshots/merchant-form-mobile.png)
- [Live network evidence](src/components/network/screenshots/network-proof-live.png)
- [Unavailable network state](src/components/network/screenshots/network-proof-unavailable-mobile.png)

Files under `docs/design/concepts/` are design references, not proof of routed
product behavior.

Implementation progress is tracked in the
[Zecceipt MVP issues](https://github.com/Alike001/zecceipt/issues) and
[milestone](https://github.com/Alike001/zecceipt/milestone/1).

## License

[MIT](LICENSE)
