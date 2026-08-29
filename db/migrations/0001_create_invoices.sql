CREATE TABLE IF NOT EXISTS invoices (
  id text PRIMARY KEY,
  management_token_hash text NOT NULL UNIQUE,
  recipient_address text NOT NULL,
  label varchar(80) NOT NULL,
  base_amount_zats bigint NOT NULL CHECK (base_amount_zats > 0),
  amount_code_zats integer NOT NULL CHECK (amount_code_zats BETWEEN 1 AND 9999),
  expected_amount_zats bigint NOT NULL CHECK (
    expected_amount_zats = base_amount_zats + amount_code_zats
    AND expected_amount_zats <= 2100000000000000
  ),
  creation_height integer NOT NULL CHECK (creation_height >= 0),
  expires_at timestamptz NOT NULL,
  confirmation_target integer NOT NULL CHECK (confirmation_target BETWEEN 1 AND 10),
  status text NOT NULL DEFAULT 'waiting' CHECK (
    status IN (
      'waiting',
      'partial',
      'confirming',
      'paid',
      'overpaid',
      'expired',
      'expired_partial'
    )
  ),
  received_zats bigint NOT NULL DEFAULT 0 CHECK (received_zats >= 0),
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (expires_at > created_at),
  CHECK (updated_at >= created_at),
  UNIQUE (recipient_address, expected_amount_zats)
);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS invoices_recipient_created_idx
  ON invoices (recipient_address, creation_height, created_at);

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS payment_outputs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  txid char(64) NOT NULL,
  output_index integer NOT NULL CHECK (output_index >= 0),
  value_zats bigint NOT NULL CHECK (value_zats > 0),
  block_height integer NOT NULL CHECK (block_height >= 0),
  block_hash char(64) NOT NULL,
  confirmations integer NOT NULL CHECK (confirmations >= 0),
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  CHECK (last_seen_at >= first_seen_at),
  UNIQUE (txid, output_index)
);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS payment_outputs_invoice_idx
  ON payment_outputs (invoice_id, block_height);
