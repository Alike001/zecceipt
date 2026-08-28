# Zecceipt

**Confirm Zcash payments. Issue verifiable receipts.**

Zecceipt is a merchant payment-confirmation application for Zcash Testnet. A merchant creates a payment request for a transparent Testnet address, a customer pays that address, and Zecceipt verifies the matching transaction output through Zcash JSON-RPC before showing a receipt.

## MVP boundary

- Zcash Testnet only.
- Transparent recipient addresses only.
- Read-only blockchain observation through a server-side QuickNode endpoint.
- No custody, signing, wallet seeds, private keys, or movement of merchant funds.
- No claim that shielded addresses, amounts, or plaintext transaction details can be revealed.

## Status

The repository is being bootstrapped. Application setup and verified development commands will be added in [Issue #2](https://github.com/Alike001/zecceipt/issues/2).

Follow progress in the [Zecceipt MVP milestone](https://github.com/Alike001/zecceipt/milestone/1).

## License

[MIT](LICENSE)
