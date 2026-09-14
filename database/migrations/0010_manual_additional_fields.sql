-- 0010_manual_additional_fields.sql

ALTER TABLE manuals ADD COLUMN pdf_source TEXT DEFAULT 'r2';
ALTER TABLE manuals ADD COLUMN public_url TEXT;
ALTER TABLE manuals ADD COLUMN pricing_mode TEXT DEFAULT 'settings';
