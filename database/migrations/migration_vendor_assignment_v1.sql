-- migration_vendor_assignment_v1.sql

ALTER TABLE orders ADD COLUMN vendor_id TEXT REFERENCES vendors(id);
CREATE INDEX IF NOT EXISTS idx_orders_vendor_id ON orders(vendor_id);
