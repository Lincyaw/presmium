-- Execution and price are fixed when the budget is reserved, including across profile upgrades.
ALTER TABLE cloud_environments ADD COLUMN profile_snapshot jsonb;
ALTER TABLE cloud_runtime_jobs ADD COLUMN profile_snapshot jsonb;
