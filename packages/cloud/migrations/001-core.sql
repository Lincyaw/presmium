CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer text NOT NULL,
  subject text NOT NULL,
  email text,
  name text NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject)
);
CREATE TABLE sessions (
  id_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE oidc_flows (
  id_hash text PRIMARY KEY,
  browser_hash text NOT NULL,
  verifier text NOT NULL,
  nonce text NOT NULL,
  state text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE billing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  plan text NOT NULL DEFAULT 'free',
  currency text NOT NULL DEFAULT 'USD',
  budget_limit_minor bigint CHECK (budget_limit_minor >= 0),
  stripe_customer_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id),
  billing_account_id uuid NOT NULL UNIQUE REFERENCES billing_accounts(id),
  personal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_personal_space ON spaces(owner_id) WHERE personal;
CREATE TABLE memberships (
  space_id uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','editor','reader')),
  can_execute boolean NOT NULL DEFAULT false,
  can_spend boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id,user_id)
);
CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('editor','reader')),
  can_execute boolean NOT NULL DEFAULT false,
  can_spend boolean NOT NULL DEFAULT false,
  token_hash text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  accepted_by uuid REFERENCES users(id),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE agent_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  space_id uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  scopes text[] NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE subscriptions (
  account_id uuid PRIMARY KEY REFERENCES billing_accounts(id),
  provider_id text NOT NULL UNIQUE,
  status text NOT NULL,
  price_id text,
  period_start timestamptz,
  period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE billing_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'pending',
  error_code text,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE TABLE usage_periods (
  account_id uuid NOT NULL REFERENCES billing_accounts(id),
  period_start date NOT NULL,
  allowance_minor bigint NOT NULL CHECK (allowance_minor >= 0),
  reserved_minor bigint NOT NULL DEFAULT 0 CHECK (reserved_minor >= 0),
  consumed_minor bigint NOT NULL DEFAULT 0 CHECK (consumed_minor >= 0),
  PRIMARY KEY(account_id,period_start)
);
CREATE TABLE reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES billing_accounts(id),
  period_start date NOT NULL,
  operation_id text NOT NULL,
  meter text NOT NULL,
  reserved_minor bigint NOT NULL CHECK (reserved_minor >= 0),
  actual_minor bigint CHECK (actual_minor >= 0),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','settled','released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  UNIQUE(account_id,operation_id),
  FOREIGN KEY(account_id,period_start) REFERENCES usage_periods(account_id,period_start)
);
CREATE TABLE usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES billing_accounts(id),
  reservation_id uuid REFERENCES reservations(id),
  operation_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('reserve','settle','release','grant')),
  amount_minor bigint NOT NULL,
  meter text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id,operation_id,kind)
);
CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  space_id uuid REFERENCES spaces(id),
  user_id uuid REFERENCES users(id),
  action text NOT NULL,
  target text,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  head_version uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id),
  parent_id uuid REFERENCES document_versions(id),
  content jsonb NOT NULL,
  fingerprint text NOT NULL,
  files jsonb NOT NULL DEFAULT '{}',
  user_id uuid NOT NULL REFERENCES users(id),
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE documents ADD FOREIGN KEY(head_version) REFERENCES document_versions(id);
CREATE INDEX document_history ON document_versions(document_id,created_at DESC);
CREATE TABLE document_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id),
  user_id uuid NOT NULL REFERENCES users(id),
  request_id text NOT NULL,
  digest text NOT NULL,
  payload jsonb NOT NULL,
  result jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  UNIQUE(document_id,user_id,request_id)
);
CREATE TABLE document_receipts (
  document_id uuid NOT NULL REFERENCES documents(id),
  user_id uuid NOT NULL REFERENCES users(id),
  request_id text NOT NULL,
  digest text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(document_id,user_id,request_id)
);
CREATE TABLE objects (
  key text PRIMARY KEY,
  space_id uuid NOT NULL REFERENCES spaces(id),
  bytes bigint NOT NULL CHECK(bytes >= 0),
  sha256 text NOT NULL,
  media_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
