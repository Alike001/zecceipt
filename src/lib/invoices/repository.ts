import "server-only";

import type { Database, DatabaseTransaction } from "@/lib/db";

export type PersistedInvoiceStatus =
  | "waiting"
  | "partial"
  | "confirming"
  | "paid"
  | "overpaid"
  | "expired"
  | "expired_partial";

export interface InvoiceRecord {
  id: string;
  managementTokenHash: string;
  recipientAddress: string;
  label: string;
  baseAmountZatoshis: bigint;
  amountCodeZatoshis: bigint;
  expectedAmountZatoshis: bigint;
  creationHeight: number;
  expiresAt: string;
  confirmationTarget: number;
  status: PersistedInvoiceStatus;
  receivedZatoshis: bigint;
  createdAt: string;
  updatedAt: string;
}

export interface NewInvoiceRecord {
  id: string;
  managementTokenHash: string;
  recipientAddress: string;
  label: string;
  baseAmountZatoshis: bigint;
  creationHeight: number;
  expiresAt: string;
  confirmationTarget: number;
  createdAt: string;
}

export interface NewPaymentOutput {
  invoiceId: string;
  txid: string;
  outputIndex: number;
  valueZatoshis: bigint;
  blockHeight: number;
  blockHash: string;
  confirmations: number;
  observedAt: string;
}

interface InvoiceRow extends Record<string, unknown> {
  id: string;
  management_token_hash: string;
  recipient_address: string;
  label: string;
  base_amount_zats: string | number | bigint;
  amount_code_zats: string | number | bigint;
  expected_amount_zats: string | number | bigint;
  creation_height: number;
  expires_at: string | Date;
  confirmation_target: number;
  status: PersistedInvoiceStatus;
  received_zats: string | number | bigint;
  created_at: string | Date;
  updated_at: string | Date;
}

export class InvoiceAmountCodesExhaustedError extends Error {
  constructor() {
    super("No invoice amount code is available for this address and amount.");
    this.name = "InvoiceAmountCodesExhaustedError";
  }
}

export class PaymentOutputAlreadyAssignedError extends Error {
  constructor() {
    super("This blockchain output is already assigned to an invoice.");
    this.name = "PaymentOutputAlreadyAssignedError";
  }
}

function toIsoDateTime(value: string | Date): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function mapInvoice(row: InvoiceRow): InvoiceRecord {
  return {
    id: row.id,
    managementTokenHash: row.management_token_hash,
    recipientAddress: row.recipient_address,
    label: row.label,
    baseAmountZatoshis: BigInt(row.base_amount_zats),
    amountCodeZatoshis: BigInt(row.amount_code_zats),
    expectedAmountZatoshis: BigInt(row.expected_amount_zats),
    creationHeight: row.creation_height,
    expiresAt: toIsoDateTime(row.expires_at),
    confirmationTarget: row.confirmation_target,
    status: row.status,
    receivedZatoshis: BigInt(row.received_zats),
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  };
}

const invoiceColumns = `
  id,
  management_token_hash,
  recipient_address,
  label,
  base_amount_zats,
  amount_code_zats,
  expected_amount_zats,
  creation_height,
  expires_at,
  confirmation_target,
  status,
  received_zats,
  created_at,
  updated_at
`;

export class InvoiceRepository {
  constructor(private readonly database: Database) {}

  async create(input: NewInvoiceRecord): Promise<InvoiceRecord> {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const rows = await this.database.query<InvoiceRow>(
        `
          WITH candidate AS (
            SELECT generated.code
            FROM generate_series(1, 9999) AS generated(code)
            WHERE NOT EXISTS (
              SELECT 1
              FROM invoices existing
              WHERE existing.recipient_address = $3
                AND existing.expected_amount_zats = $5::bigint + generated.code
            )
            ORDER BY generated.code
            LIMIT 1
          )
          INSERT INTO invoices (
            id,
            management_token_hash,
            recipient_address,
            label,
            base_amount_zats,
            amount_code_zats,
            expected_amount_zats,
            creation_height,
            expires_at,
            confirmation_target,
            status,
            received_zats,
            created_at,
            updated_at
          )
          SELECT
            $1,
            $2,
            $3,
            $4,
            $5::bigint,
            candidate.code,
            $5::bigint + candidate.code,
            $6,
            $7::timestamptz,
            $8,
            'waiting',
            0,
            $9::timestamptz,
            $9::timestamptz
          FROM candidate
          ON CONFLICT (recipient_address, expected_amount_zats) DO NOTHING
          RETURNING ${invoiceColumns}
        `,
        [
          input.id,
          input.managementTokenHash,
          input.recipientAddress,
          input.label,
          input.baseAmountZatoshis,
          input.creationHeight,
          input.expiresAt,
          input.confirmationTarget,
          input.createdAt,
        ],
      );

      if (rows[0]) return mapInvoice(rows[0]);
    }

    throw new InvoiceAmountCodesExhaustedError();
  }

  async findById(id: string): Promise<InvoiceRecord | null> {
    const rows = await this.database.query<InvoiceRow>(
      `SELECT ${invoiceColumns} FROM invoices WHERE id = $1 LIMIT 1`,
      [id],
    );
    return rows[0] ? mapInvoice(rows[0]) : null;
  }

  async recordPaymentOutput(input: NewPaymentOutput): Promise<void> {
    const rows = await this.database.query<{ invoice_id: string }>(
      `
        INSERT INTO payment_outputs (
          invoice_id,
          txid,
          output_index,
          value_zats,
          block_height,
          block_hash,
          confirmations,
          first_seen_at,
          last_seen_at
        ) VALUES (
          $1,
          $2,
          $3,
          $4::bigint,
          $5,
          $6,
          $7,
          $8::timestamptz,
          $8::timestamptz
        )
        ON CONFLICT (txid, output_index) DO UPDATE SET
          value_zats = EXCLUDED.value_zats,
          block_height = EXCLUDED.block_height,
          block_hash = EXCLUDED.block_hash,
          confirmations = EXCLUDED.confirmations,
          last_seen_at = EXCLUDED.last_seen_at
        WHERE payment_outputs.invoice_id = EXCLUDED.invoice_id
        RETURNING invoice_id
      `,
      [
        input.invoiceId,
        input.txid,
        input.outputIndex,
        input.valueZatoshis,
        input.blockHeight,
        input.blockHash,
        input.confirmations,
        input.observedAt,
      ],
    );

    if (!rows[0]) {
      throw new PaymentOutputAlreadyAssignedError();
    }
  }

  transaction<Result>(
    callback: (transaction: DatabaseTransaction) => Promise<Result>,
  ): Promise<Result> {
    return this.database.transaction(callback);
  }
}
