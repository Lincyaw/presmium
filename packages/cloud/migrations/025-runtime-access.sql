CREATE TABLE cloud_runtime_tickets (
  id_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  environment_id uuid NOT NULL REFERENCES cloud_environments(id) ON DELETE CASCADE,
  billing_account_id uuid NOT NULL REFERENCES billing_accounts(id),
  generation integer NOT NULL CHECK (generation >= 1),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cloud_runtime_tickets_expiry ON cloud_runtime_tickets(expires_at);

CREATE TABLE cloud_runtime_sessions (
  id_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  environment_id uuid NOT NULL REFERENCES cloud_environments(id) ON DELETE CASCADE,
  billing_account_id uuid NOT NULL REFERENCES billing_accounts(id),
  generation integer NOT NULL CHECK (generation >= 1),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cloud_runtime_sessions_expiry ON cloud_runtime_sessions(expires_at);
CREATE INDEX cloud_runtime_sessions_environment ON cloud_runtime_sessions(environment_id, generation);
