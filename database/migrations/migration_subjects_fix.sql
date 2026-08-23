PRAGMA foreign_keys=off;

CREATE TABLE new_subjects (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    semester_id TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (semester_id) REFERENCES semesters(id),
    UNIQUE(branch_id, semester_id, code)
);

INSERT INTO new_subjects SELECT * FROM subjects;

DROP TABLE subjects;

ALTER TABLE new_subjects RENAME TO subjects;

CREATE INDEX idx_subjects_branch_sem ON subjects(branch_id, semester_id);

PRAGMA foreign_keys=on;
