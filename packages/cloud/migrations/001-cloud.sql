-- Presmium Cloud's console: accounts, MCP access tokens and shares. Each user's Studio (a JupyterHub server) keeps
-- the documents in its own workspace, a git repository on the user's volume, never in this database.
CREATE TABLE users (
  id uuid PRIMARY KEY,
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
  return_to text NOT NULL DEFAULT '/',
  expected_subject text,
  expires_at timestamptz NOT NULL
);

CREATE TABLE access_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE TABLE shares (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document text NOT NULL,
  title text NOT NULL,
  state text NOT NULL CHECK (state IN ('pending', 'ready', 'failed')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX shares_user ON shares(user_id, created_at DESC) WHERE revoked_at IS NULL;
