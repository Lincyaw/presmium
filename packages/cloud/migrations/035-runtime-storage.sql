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
  resource_kind text CHECK (resource_kind IN ('job', 'environment')),
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
