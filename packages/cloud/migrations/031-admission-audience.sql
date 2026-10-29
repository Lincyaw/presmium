ALTER TABLE cloud_admission_quotes ADD COLUMN audience text CHECK(audience IS NULL OR audience='student');
