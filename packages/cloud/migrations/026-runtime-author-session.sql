ALTER TABLE cloud_runtime_tickets ADD COLUMN author_session_hash text REFERENCES sessions(id_hash) ON DELETE CASCADE;
ALTER TABLE cloud_runtime_sessions ADD COLUMN author_session_hash text REFERENCES sessions(id_hash) ON DELETE CASCADE;
