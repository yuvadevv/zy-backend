-- Migration to add authoritative stock field to manuals
ALTER TABLE manuals ADD COLUMN stock INTEGER NOT NULL DEFAULT 0;
