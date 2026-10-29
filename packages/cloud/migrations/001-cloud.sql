-- Presmium Cloud: accounts, one space and one Studio per user, MCP access, shares. Documents live in each
-- Studio's own workspace (a git repository on its volume), never in this database.
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

CREATE TABLE spaces (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE studios (
  space_id uuid PRIMARY KEY REFERENCES spaces(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-f0-9]{32}$'),
  control_token text NOT NULL,
  desired_state text NOT NULL DEFAULT 'stopped' CHECK (desired_state IN ('running', 'stopped')),
  state text NOT NULL DEFAULT 'stopped' CHECK (state IN ('stopped', 'starting', 'running', 'stopping', 'failed')),
  generation integer NOT NULL DEFAULT 0,
  container_id text,
  address text,
  started_at timestamptz,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  error_code text,
  lease_owner text,
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX studios_active ON studios(updated_at) WHERE state <> 'stopped' OR desired_state = 'running';

-- One-use tickets and the gate sessions they become, one per Studio host.
CREATE TABLE gate_tickets (
  id_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  space_id uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  generation integer NOT NULL,
  host text NOT NULL CHECK (host IN ('studio', 'preview')),
  next text,
  author_session_hash text REFERENCES sessions(id_hash) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE gate_sessions (
  id_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  space_id uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  generation integer NOT NULL,
  host text NOT NULL CHECK (host IN ('studio', 'preview')),
  author_session_hash text REFERENCES sessions(id_hash) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE access_tokens (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
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
  space_id uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document text NOT NULL,
  title text NOT NULL,
  state text NOT NULL CHECK (state IN ('pending', 'ready', 'failed')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX shares_space ON shares(space_id, created_at DESC) WHERE revoked_at IS NULL;

-- The operator's quota pool (deploy/cloud/storage): one kernel-enforced slot per Studio volume.
CREATE TABLE cloud_runtime_storage_pools (
  instance_id text PRIMARY KEY,
  filesystem_uuid text NOT NULL UNIQUE,
  host_root text NOT NULL,
  manifest_digest text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE cloud_runtime_storage_slots (
  instance_id text NOT NULL REFERENCES cloud_runtime_storage_pools(instance_id),
  slot_id text NOT NULL,
  project_id integer NOT NULL CHECK (project_id > 0),
  capacity_bytes bigint NOT NULL CHECK (capacity_bytes > 0),
  inode_limit bigint NOT NULL CHECK (inode_limit > 0),
  resource_kind text CHECK (resource_kind = 'studio'),
  resource_id uuid,
  requested_bytes bigint,
  allocated_at timestamptz,
  PRIMARY KEY (instance_id, slot_id),
  UNIQUE (instance_id, project_id),
  UNIQUE (instance_id, resource_kind, resource_id),
  CHECK (
    (resource_kind IS NULL AND resource_id IS NULL AND requested_bytes IS NULL AND allocated_at IS NULL)
    OR (resource_kind IS NOT NULL AND resource_id IS NOT NULL AND requested_bytes = capacity_bytes AND allocated_at IS NOT NULL)
  )
);
