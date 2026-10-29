-- Retain execution/quote audit foreign keys after the persistent workspace is destroyed.
ALTER TABLE cloud_environments ADD COLUMN destroyed_at timestamptz;
