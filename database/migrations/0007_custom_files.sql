CREATE TABLE custom_files (
    id TEXT PRIMARY KEY,
    order_id TEXT,
    service_type TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    stored_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    storage_provider TEXT NOT NULL,
    r2_bucket TEXT NOT NULL,
    r2_object_key TEXT UNIQUE NOT NULL,
    upload_status TEXT NOT NULL,
    is_temporary INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (order_id) REFERENCES orders(internal_id)
);
CREATE INDEX idx_custom_files_order ON custom_files(order_id);
CREATE INDEX idx_custom_files_status ON custom_files(upload_status);
