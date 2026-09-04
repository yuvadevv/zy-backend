-- migration_manual_cms_v1.sql

-- Add new columns to manuals table for complete CMS support
ALTER TABLE manuals ADD COLUMN vendor_id TEXT REFERENCES vendors(id);
ALTER TABLE manuals ADD COLUMN price_override REAL;
ALTER TABLE manuals ADD COLUMN delivery_override REAL;
ALTER TABLE manuals ADD COLUMN print_type TEXT DEFAULT 'Black & White';
ALTER TABLE manuals ADD COLUMN print_side TEXT DEFAULT 'Single Side';
ALTER TABLE manuals ADD COLUMN binding_type TEXT DEFAULT 'Spiral';

-- Add academic mapping shortcuts to manuals to simplify filtering
ALTER TABLE manuals ADD COLUMN branch_id TEXT REFERENCES branches(id);
ALTER TABLE manuals ADD COLUMN academic_year_id TEXT REFERENCES academic_years(id);
ALTER TABLE manuals ADD COLUMN semester_id TEXT REFERENCES semesters(id);

CREATE INDEX IF NOT EXISTS idx_manuals_vendor ON manuals(vendor_id);
CREATE INDEX IF NOT EXISTS idx_manuals_branch ON manuals(branch_id);
CREATE INDEX IF NOT EXISTS idx_manuals_semester ON manuals(semester_id);
