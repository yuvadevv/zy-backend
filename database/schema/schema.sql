-- schema.sql

CREATE TABLE colleges (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL
);

CREATE TABLE branches (
    id TEXT PRIMARY KEY,
    college_id TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    FOREIGN KEY (college_id) REFERENCES colleges(id),
    UNIQUE (college_id, code)
);
CREATE INDEX idx_branches_college ON branches(college_id);

CREATE TABLE academic_years (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    value INTEGER UNIQUE NOT NULL
);

CREATE TABLE semesters (
    id TEXT PRIMARY KEY,
    academic_year_id TEXT NOT NULL,
    label TEXT NOT NULL,
    value INTEGER UNIQUE NOT NULL,
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)
);
CREATE INDEX idx_semesters_year ON semesters(academic_year_id);

CREATE TABLE subjects (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    semester_id TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (semester_id) REFERENCES semesters(id)
);
CREATE INDEX idx_subjects_branch_sem ON subjects(branch_id, semester_id);

CREATE TABLE manuals (
    id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    pages INTEGER NOT NULL,
    base_price REAL NOT NULL,
    availability_status TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
);
CREATE INDEX idx_manuals_subject ON manuals(subject_id);

CREATE TABLE students (
    id TEXT PRIMARY KEY,
    roll_number TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    college_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    study_year_id TEXT NOT NULL,
    semester_id TEXT NOT NULL,
    section TEXT,
    account_status TEXT NOT NULL,
    password_hash TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (college_id) REFERENCES colleges(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (study_year_id) REFERENCES academic_years(id),
    FOREIGN KEY (semester_id) REFERENCES semesters(id)
);
CREATE INDEX idx_students_roll ON students(roll_number);
CREATE INDEX idx_students_phone ON students(phone);

CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    document_type TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    page_count INTEGER NOT NULL,
    r2_object_key TEXT UNIQUE NOT NULL,
    scan_status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (student_id) REFERENCES students(id)
);
CREATE INDEX idx_documents_student ON documents(student_id);
CREATE INDEX idx_documents_expires_at ON documents(expires_at);

CREATE TABLE orders (
    internal_id TEXT PRIMARY KEY,
    public_id TEXT UNIQUE NOT NULL,
    student_id TEXT NOT NULL,
    status TEXT NOT NULL,
    internal_status TEXT NOT NULL,
    delivery_type TEXT NOT NULL,
    delivery_building TEXT,
    delivery_room TEXT,
    platform_fee REAL NOT NULL,
    gst REAL NOT NULL,
    delivery_fee REAL NOT NULL,
    discount REAL NOT NULL,
    grand_total REAL NOT NULL,
    estimated_delivery INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (student_id) REFERENCES students(id)
);
CREATE INDEX idx_orders_public_id ON orders(public_id);
CREATE INDEX idx_orders_student ON orders(student_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);

CREATE TABLE order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    item_type TEXT NOT NULL,
    manual_id TEXT,
    document_id TEXT,
    copies INTEGER NOT NULL,
    page_count INTEGER NOT NULL,
    print_type TEXT NOT NULL,
    color_mode INTEGER NOT NULL,
    binding_type TEXT NOT NULL,
    base_price REAL NOT NULL,
    printing_cost REAL NOT NULL,
    binding_cost REAL NOT NULL,
    item_total REAL NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(internal_id),
    FOREIGN KEY (manual_id) REFERENCES manuals(id),
    FOREIGN KEY (document_id) REFERENCES documents(id)
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE TABLE payments (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_order_id TEXT UNIQUE NOT NULL,
    provider_payment_id TEXT UNIQUE,
    provider_signature TEXT,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL,
    paid_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(internal_id)
);
CREATE INDEX idx_payments_order ON payments(order_id);

CREATE TABLE sequences (
    prefix_key TEXT PRIMARY KEY,
    last_sequence INTEGER NOT NULL
);
