CREATE TABLE cloud_admission_quotes (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES spaces(id),
  user_id uuid NOT NULL REFERENCES users(id),
  billing_account_id uuid NOT NULL REFERENCES billing_accounts(id),
  kind text NOT NULL CHECK(kind IN ('compile','export-pdf','environment')),
  document_id uuid REFERENCES documents(id),
  source_version uuid REFERENCES document_versions(id),
  environment_id uuid REFERENCES cloud_environments(id),
  environment_generation integer,
  profile_id text NOT NULL,
  profile_snapshot jsonb NOT NULL,
  profile_digest text NOT NULL,
  input_manifest jsonb,
  amount_minor bigint NOT NULL CHECK(amount_minor>=0),
  currency text NOT NULL,
  expires_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'quoted' CHECK(state IN ('quoted','claimed','completed','rejected')),
  request_id text,
  result jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,request_id),
  CHECK((kind='environment' AND environment_id IS NOT NULL AND document_id IS NULL)
    OR (kind<>'environment' AND environment_id IS NULL AND document_id IS NOT NULL AND source_version IS NOT NULL))
);
CREATE INDEX cloud_admission_quotes_owner ON cloud_admission_quotes(workspace_id,user_id,created_at DESC);

CREATE TABLE cloud_environment_starts (
  environment_id uuid NOT NULL REFERENCES cloud_environments(id),
  operation_id text NOT NULL,
  generation integer NOT NULL,
  profile_digest text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(environment_id,operation_id)
);
