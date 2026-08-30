import "server-only";

import type { Database, DatabaseTransaction } from "@/lib/db";

export type PersistedInvoiceStatus =
  | "waiting"
  | "pending"
  | "pending_after_expiry"
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
  lastCheckedAt: string | null;
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

export interface PaymentOutputRecord extends NewPaymentOutput {
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface NewPendingPaymentOutput {
  invoiceId: string;
  txid: string;
  outputIndex: number;
  valueZatoshis: bigint;
  mempoolEnteredAt: string;
  expiryHeight: number;
  observedAt: string;
}

export interface PendingPaymentOutputRecord extends NewPendingPaymentOutput {
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ReconcileInvoicePaymentInput {
  invoiceId: string;
  outputs: readonly Omit<NewPaymentOutput, "invoiceId" | "observedAt">[];
  pendingOutputs?: readonly Omit<
    NewPendingPaymentOutput,
    "invoiceId" | "observedAt"
  >[];
  status: PersistedInvoiceStatus;
  receivedZatoshis: bigint;
  observedAt: string;
}

export interface ReconciledInvoicePayment {
  invoice: InvoiceRecord;
  outputs: readonly PaymentOutputRecord[];
  pendingOutputs: readonly PendingPaymentOutputRecord[];
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
  last_checked_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface PaymentOutputRow extends Record<string, unknown> {
  invoice_id: string;
  txid: string;
  output_index: number;
  value_zats: string | number | bigint;
  block_height: number;
  block_hash: string;
  confirmations: number;
  first_seen_at: string | Date;
  last_seen_at: string | Date;
}

interface PendingPaymentOutputRow extends Record<string, unknown> {
  invoice_id: string;
  txid: string;
  output_index: number;
  value_zats: string | number | bigint;
  mempool_entered_at: string | Date;
  expiry_height: number;
  first_seen_at: string | Date;
  last_seen_at: string | Date;
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
    lastCheckedAt:
      row.last_checked_at === null ? null : toIsoDateTime(row.last_checked_at),
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  };
}

function mapPaymentOutput(row: PaymentOutputRow): PaymentOutputRecord {
  return {
    invoiceId: row.invoice_id,
    txid: row.txid,
    outputIndex: row.output_index,
    valueZatoshis: BigInt(row.value_zats),
    blockHeight: row.block_height,
    blockHash: row.block_hash,
    confirmations: row.confirmations,
    observedAt: toIsoDateTime(row.last_seen_at),
    firstSeenAt: toIsoDateTime(row.first_seen_at),
    lastSeenAt: toIsoDateTime(row.last_seen_at),
  };
}

function mapPendingPaymentOutput(
  row: PendingPaymentOutputRow,
): PendingPaymentOutputRecord {
  return {
    invoiceId: row.invoice_id,
    txid: row.txid,
    outputIndex: row.output_index,
    valueZatoshis: BigInt(row.value_zats),
    mempoolEnteredAt: toIsoDateTime(row.mempool_entered_at),
    expiryHeight: row.expiry_height,
    observedAt: toIsoDateTime(row.last_seen_at),
    firstSeenAt: toIsoDateTime(row.first_seen_at),
    lastSeenAt: toIsoDateTime(row.last_seen_at),
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
  last_checked_at,
  created_at,
  updated_at
`;

const paymentOutputColumns = `
  invoice_id,
  txid,
  output_index,
  value_zats,
  block_height,
  block_hash,
  confirmations,
  first_seen_at,
  last_seen_at
`;

const pendingPaymentOutputColumns = `
  invoice_id,
  txid,
  output_index,
  value_zats,
  mempool_entered_at,
  expiry_height,
  first_seen_at,
  last_seen_at
`;

async function findPaymentOutputs(
  executor: DatabaseTransaction,
  invoiceId: string,
): Promise<readonly PaymentOutputRecord[]> {
  const rows = await executor.query<PaymentOutputRow>(
    `
      SELECT ${paymentOutputColumns}
      FROM payment_outputs
      WHERE invoice_id = $1
      ORDER BY block_height, txid, output_index
    `,
    [invoiceId],
  );
  return rows.map(mapPaymentOutput);
}

async function findPendingPaymentOutputs(
  executor: DatabaseTransaction,
  invoiceId: string,
): Promise<readonly PendingPaymentOutputRecord[]> {
  const rows = await executor.query<PendingPaymentOutputRow>(
    `
      SELECT ${pendingPaymentOutputColumns}
      FROM pending_payment_outputs
      WHERE invoice_id = $1
      ORDER BY first_seen_at, txid, output_index
    `,
    [invoiceId],
  );
  return rows.map(mapPendingPaymentOutput);
}

async function upsertPaymentOutput(
  executor: DatabaseTransaction,
  input: NewPaymentOutput,
): Promise<void> {
  const rows = await executor.query<{ invoice_id: string }>(
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

async function upsertPendingPaymentOutput(
  executor: DatabaseTransaction,
  input: NewPendingPaymentOutput,
): Promise<void> {
  const rows = await executor.query<{ invoice_id: string }>(
    `
      INSERT INTO pending_payment_outputs (
        invoice_id,
        txid,
        output_index,
        value_zats,
        mempool_entered_at,
        expiry_height,
        first_seen_at,
        last_seen_at
      ) VALUES (
        $1,
        $2,
        $3,
        $4::bigint,
        $5::timestamptz,
        $6,
        $7::timestamptz,
        $7::timestamptz
      )
      ON CONFLICT (txid, output_index) DO UPDATE SET
        value_zats = EXCLUDED.value_zats,
        mempool_entered_at = LEAST(
          pending_payment_outputs.mempool_entered_at,
          EXCLUDED.mempool_entered_at
        ),
        expiry_height = EXCLUDED.expiry_height,
        last_seen_at = EXCLUDED.last_seen_at
      WHERE pending_payment_outputs.invoice_id = EXCLUDED.invoice_id
      RETURNING invoice_id
    `,
    [
      input.invoiceId,
      input.txid,
      input.outputIndex,
      input.valueZatoshis,
      input.mempoolEnteredAt,
      input.expiryHeight,
      input.observedAt,
    ],
  );

  if (!rows[0]) throw new PaymentOutputAlreadyAssignedError();
}

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
    await upsertPaymentOutput(this.database, input);
  }

  findPaymentOutputsByInvoiceId(
    invoiceId: string,
  ): Promise<readonly PaymentOutputRecord[]> {
    return findPaymentOutputs(this.database, invoiceId);
  }

  findPendingPaymentOutputsByInvoiceId(
    invoiceId: string,
  ): Promise<readonly PendingPaymentOutputRecord[]> {
    return findPendingPaymentOutputs(this.database, invoiceId);
  }

  async reconcilePaymentOutputs(
    input: ReconcileInvoicePaymentInput,
  ): Promise<ReconciledInvoicePayment | null> {
    return this.database.transaction(async (transaction) => {
      const invoiceRows = await transaction.query<InvoiceRow>(
        `SELECT ${invoiceColumns} FROM invoices WHERE id = $1 FOR UPDATE`,
        [input.invoiceId],
      );
      const currentRow = invoiceRows[0];
      if (!currentRow) return null;

      const current = mapInvoice(currentRow);
      if (
        current.lastCheckedAt !== null &&
        Date.parse(current.lastCheckedAt) > Date.parse(input.observedAt)
      ) {
        return {
          invoice: current,
          outputs: await findPaymentOutputs(transaction, input.invoiceId),
          pendingOutputs: await findPendingPaymentOutputs(
            transaction,
            input.invoiceId,
          ),
        };
      }

      for (const output of input.outputs) {
        await upsertPaymentOutput(transaction, {
          invoiceId: input.invoiceId,
          ...output,
          observedAt: input.observedAt,
        });
      }

      if (input.pendingOutputs !== undefined) {
        for (const output of input.pendingOutputs) {
          await upsertPendingPaymentOutput(transaction, {
            invoiceId: input.invoiceId,
            ...output,
            observedAt: input.observedAt,
          });
        }

        if (input.pendingOutputs.length === 0) {
          await transaction.query(
            `DELETE FROM pending_payment_outputs WHERE invoice_id = $1`,
            [input.invoiceId],
          );
        } else {
          const pendingIdentityClauses = input.pendingOutputs.map(
            (_, index) =>
              `(txid = $${index * 2 + 2} AND output_index = $${index * 2 + 3})`,
          );
          const pendingIdentityParameters = input.pendingOutputs.flatMap(
            (output) => [output.txid, output.outputIndex],
          );
          await transaction.query(
            `
              DELETE FROM pending_payment_outputs
              WHERE invoice_id = $1
                AND NOT (${pendingIdentityClauses.join(" OR ")})
            `,
            [input.invoiceId, ...pendingIdentityParameters],
          );
        }
      }

      if (input.outputs.length === 0) {
        await transaction.query(
          `DELETE FROM payment_outputs WHERE invoice_id = $1`,
          [input.invoiceId],
        );
      } else {
        const identityClauses = input.outputs.map(
          (_, index) =>
            `(txid = $${index * 2 + 2} AND output_index = $${index * 2 + 3})`,
        );
        const identityParameters = input.outputs.flatMap((output) => [
          output.txid,
          output.outputIndex,
        ]);
        await transaction.query(
          `
            DELETE FROM payment_outputs
            WHERE invoice_id = $1
              AND NOT (${identityClauses.join(" OR ")})
          `,
          [input.invoiceId, ...identityParameters],
        );
      }

      const updatedRows = await transaction.query<InvoiceRow>(
        `
          UPDATE invoices
          SET
            status = $2,
            received_zats = $3::bigint,
            last_checked_at = $4::timestamptz,
            updated_at = CASE
              WHEN invoices.status IS DISTINCT FROM $2
                OR invoices.received_zats IS DISTINCT FROM $3::bigint
              THEN $4::timestamptz
              ELSE invoices.updated_at
            END
          WHERE id = $1
          RETURNING ${invoiceColumns}
        `,
        [
          input.invoiceId,
          input.status,
          input.receivedZatoshis,
          input.observedAt,
        ],
      );

      return {
        invoice: mapInvoice(updatedRows[0]),
        outputs: await findPaymentOutputs(transaction, input.invoiceId),
        pendingOutputs: await findPendingPaymentOutputs(
          transaction,
          input.invoiceId,
        ),
      };
    });
  }

  transaction<Result>(
    callback: (transaction: DatabaseTransaction) => Promise<Result>,
  ): Promise<Result> {
    return this.database.transaction(callback);
  }
}
