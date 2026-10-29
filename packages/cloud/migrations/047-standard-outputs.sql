ALTER TABLE cloud_admission_quotes ADD COLUMN output_form text CHECK(output_form IN ('web','slides','notebook','lecture'));
