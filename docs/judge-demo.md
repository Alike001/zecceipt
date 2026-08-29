# Judge demo

This walkthrough demonstrates the routed customer-to-merchant flow on Zcash
Testnet. The active portion takes about four minutes; confirmation time depends
on Testnet block production.

## Before the session

- Use a fresh clone and complete the [README setup](../README.md#run-a-clean-clone).
- Use a QuickNode endpoint configured for **Zcash Testnet**, never Mainnet.
- Prepare a transparent Testnet merchant address you control and a funded
  Testnet customer wallet.
- Create and settle one rehearsal invoice. Keep its public checkout URL as a
  receipt fallback if a new Testnet block is slow during judging.
- Open the app without exposing the QuickNode URL, `DATABASE_URL`, management
  secret, management token, wallet balances, or wallet recovery material.

## Four-minute walkthrough

### 0:00 — Establish the boundary and live network

Open `/` and say:

> Zecceipt is a non-custodial confirmation app for transparent Zcash Testnet
> payments. It observes public chain data but never signs, spends, or receives
> wallet secrets. Transparent recipients and amounts are public; shielded and
> Unified recipients are outside this MVP.

Point out the server-fetched network state, Testnet height, observation time,
and visible RPC catalog. `getblockchaininfo` and `getblockcount` are live
evidence on this screen. If the panel says unavailable, stop: an RPC failure is
not evidence that a customer has not paid.

### 0:40 — Create the merchant invoice

Open `/create`, enter the merchant's transparent Testnet address, and leave the
field. Point out the valid-address response from the server-side
`validateaddress` call.

Enter a small Testnet amount, a recognizable label, a 30-minute expiry, and a
confirmation target of one. Create the invoice and say:

> Invoice creation independently calls `validateaddress`,
> `getblockchaininfo`, and `getblockcount` before storing the invoice. These are
> the three immediately visible hackathon methods. The server records the
> creation height and allocates a unique integer-zatoshi amount code.

Open the success link. The browser's recent-invoice list stores public checkout
details only; it does not store the returned private management token.

### 1:30 — Show the customer checkout

On `/checkout/{invoiceId}`, point out:

- the `testnet` badge and expiry;
- the exact ZEC and integer-zatoshi amounts;
- the full transparent recipient plus its fingerprint;
- the ZIP-321 QR and copy controls; and
- the waiting status, which is not yet a payment claim.

The checkout polls its server status route immediately and approximately every
eight seconds.

### 2:10 — Send the Testnet payment

In the customer wallet:

1. Scan the QR or carefully copy the transparent recipient.
2. Confirm the wallet amount exactly matches `exactAmountZec`, not the base
   amount originally entered by the merchant.
3. Send Testnet funds, retain the transaction ID, and return to the checkout.

Explain the server flow while waiting:

1. `getblockcount` bounds the scan at the current Testnet tip.
2. `getaddresstxids` finds transactions for the recipient after invoice
   creation.
3. `getrawtransaction` supplies mined outputs, block evidence, and
   confirmations.
4. Zecceipt persists each matching transaction ID/output index and sums values
   as integer zatoshis. It reports paid only at the exact confirmed total and
   overpaid above it.

The live send may remain waiting until it is mined. If judging time is short,
keep that new invoice open as proof of the real customer action, then open the
clearly labeled rehearsal checkout to demonstrate the settled state.

### 3:20 — Show status evidence and receipt

On a mined/settled checkout, show the RPC evidence in the status timeline. With
a confirmation target above the current count the state is confirming; at the
target it becomes paid or overpaid and the receipt appears.

Point out the receipt's invoice ID, network, expected and paid totals,
settlement time, transaction ID, output index, block evidence, and confirmation
count. Refresh the URL to show that the invoice and matched outputs are durable
PostgreSQL records rather than client-only state.

Close with the remaining product boundary: public checkout is complete, but
the private `/merchant/invoices/{invoiceId}` management page returned by the
creation API is not routed yet. The `/create` page's recent list is local to one
browser and links to public checkouts.

## Screenshot and evidence checklist

| Capture                                | What it proves                                                                                | Redaction/check                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Landing page with live network panel   | Server-fetched Testnet, height, observation time, live evidence, and the five-method catalog. | Show the app URL, never the provider endpoint.                            |
| `/create` with valid address state     | Real server-side `validateaddress` behavior and transparent-only boundary.                    | Use a Testnet receive address intended for the demo.                      |
| Invoice success state and recent row   | Durable invoice creation and a working link to public checkout.                               | Do not open or capture the raw `merchantManagement` API object.           |
| New public checkout before payment     | Exact amount, zatoshis, recipient, fingerprint, ZIP-321 QR, expiry, and waiting state.        | Verify the badge says Testnet.                                            |
| Customer wallet send                   | A real customer-to-merchant Testnet action and transaction ID.                                | Hide balance, account name, unrelated history, and all recovery material. |
| Confirming or paid timeline            | Live `getblockcount`, `getaddresstxids`, and `getrawtransaction` evidence tied to a status.   | If using the rehearsal invoice, label it clearly.                         |
| Settled receipt after refresh          | Persisted txid/output index, amount, block data, confirmations, and public receipt.           | Confirm no management token or endpoint URL is visible.                   |
| Unavailable state, captured separately | Honest fail-closed behavior when RPC evidence cannot be refreshed.                            | Say “unavailable,” never “unpaid.”                                        |

Repository-provided fallback component captures:

- [Landing desktop](design/renders/landing-desktop.png) and
  [mobile](design/renders/landing-mobile.png)
- [Merchant form desktop](../src/components/merchant/screenshots/merchant-form-desktop.png)
  and [mobile](../src/components/merchant/screenshots/merchant-form-mobile.png)
- [Live network panel](../src/components/network/screenshots/network-proof-live.png)
- [Unavailable network panel](../src/components/network/screenshots/network-proof-unavailable-mobile.png)

These demonstrate implemented presentation states, but live browser/API
captures are stronger evidence. Images in `docs/design/concepts/` are concept
references and must not be presented as implemented-product proof.

## Final claim checklist

- Testnet and transparent-recipient limitation stated.
- No custody, signing, seed phrase, private key, or viewing key claimed.
- Three invoice-creation methods named and visible.
- All five allow-listed methods and their purposes explained.
- Recipient, integer value, txid, output index, block, and confirmation evidence
  shown before calling a payment settled.
- RPC unavailable state kept distinct from unpaid state.
- No secret, management token, recovery data, or real endpoint credential shown.
- Public checkout distinguished from the not-yet-routed private management page.
