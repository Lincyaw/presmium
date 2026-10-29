CREATE TABLE cloud_content_previews (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL REFERENCES spaces(id),
  document_id uuid NOT NULL REFERENCES documents(id),
  job_id uuid NOT NULL REFERENCES cloud_runtime_jobs(id),
  user_id uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cloud_content_previews_owner ON cloud_content_previews(user_id,document_id,job_id,expires_at);

CREATE TABLE cloud_publications (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL REFERENCES spaces(id),
  document_id uuid NOT NULL REFERENCES documents(id),
  source_version uuid NOT NULL REFERENCES document_versions(id),
  job_id uuid NOT NULL REFERENCES cloud_runtime_jobs(id),
  user_id uuid NOT NULL REFERENCES users(id),
  request_id text NOT NULL,
  title text NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id,user_id,request_id)
);
CREATE INDEX cloud_publications_document ON cloud_publications(space_id,document_id,created_at DESC);
