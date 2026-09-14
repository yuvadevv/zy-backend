CREATE TABLE oversized_file_requests (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    order_id TEXT,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT,
    pdf_count INTEGER NOT NULL DEFAULT 0,
    total_pages INTEGER NOT NULL DEFAULT 0,
    printing_options TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX idx_oversized_requests_student ON oversized_file_requests(student_id);
CREATE INDEX idx_oversized_requests_status ON oversized_file_requests(status);
