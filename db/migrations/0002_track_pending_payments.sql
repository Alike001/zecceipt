ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;

-- statement-breakpoint

ALTER TABLE invoices ADD CONSTRAINT invoices_status_check CHECK (
  status IN (
    'waiting',
    'pending',
    'pending_after_expiry',
    'partial',
    'confirming',
    'paid',
    'overpaid',
    'expired',
    'expired_partial'
  )
);

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS pending_payment_outputs (
  invoice_id text NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  txid char(64) NOT NULL,
  output_index integer NOT NULL CHECK (output_index >= 0),
  value_zats bigint NOT NULL CHECK (value_zats > 0),
  mempool_entered_at timestamptz NOT NULL,
  expiry_height integer NOT NULL CHECK (expiry_height >= 0),
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  CHECK (last_seen_at >= first_seen_at),
  PRIMARY KEY (txid, output_index)
);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS pending_payment_outputs_invoice_idx
  ON pending_payment_outputs (invoice_id, expiry_height);
