PRAGMA foreign_keys=off;

INSERT OR IGNORE INTO colleges (id, name, code) VALUES ('COL-001', 'National Institute of Technology', 'NIT');

INSERT OR IGNORE INTO branches (id, college_id, name, code) VALUES
('b_aiml', 'COL-001', 'Artificial Intelligence & ML', 'AIML'),
('b_cse', 'COL-001', 'Computer Science', 'CSE'),
('b_ece', 'COL-001', 'Electronics & Communication', 'ECE'),
('b_eee', 'COL-001', 'Electrical & Electronics', 'EEE'),
('b_mech', 'COL-001', 'Mechanical Engineering', 'MECH'),
('b_civil', 'COL-001', 'Civil Engineering', 'CIVIL');

INSERT OR IGNORE INTO academic_years (id, label, value) VALUES
('y_1', '1st Year', 1),
('y_2', '2nd Year', 2),
('y_3', '3rd Year', 3),
('y_4', '4th Year', 4);

INSERT OR IGNORE INTO semesters (id, academic_year_id, label, value) VALUES
('s_1', 'y_1', 'Semester 1', 1),
('s_2', 'y_1', 'Semester 2', 2),
('s_3', 'y_2', 'Semester 3', 3),
('s_4', 'y_2', 'Semester 4', 4),
('s_5', 'y_3', 'Semester 5', 5),
('s_6', 'y_3', 'Semester 6', 6),
('s_7', 'y_4', 'Semester 7', 7),
('s_8', 'y_4', 'Semester 8', 8);

INSERT OR IGNORE INTO subjects (id, branch_id, semester_id, name, code) VALUES
('sub_ds', 'b_aiml', 's_1', 'Data Structures', 'CS101_AIML'),
('sub_ds_cse', 'b_cse', 's_3', 'Data Structures', 'CS101_CSE'),
('sub_algo', 'b_aiml', 's_2', 'Design and Analysis of Algorithms', 'CS102_AIML'),
('sub_algo_cse', 'b_cse', 's_4', 'Design and Analysis of Algorithms', 'CS102_CSE'),
('sub_os', 'b_aiml', 's_3', 'Operating Systems', 'CS103'),
('sub_dbms', 'b_cse', 's_5', 'Database Management Systems', 'CS104'),
('sub_ml', 'b_aiml', 's_5', 'Machine Learning', 'CS105');

INSERT OR IGNORE INTO manuals (id, subject_id, title, description, pages, base_price, availability_status) VALUES
('m_ds_v1', 'sub_ds', 'Data Structures Lab Manual', 'Complete lab manual for Data Structures covering arrays, linked lists, stacks, queues, trees, and graphs with C++ implementations.', 124, 150, 'in_stock'),
('m_ds_v2', 'sub_ds_cse', 'Data Structures Lab Manual', 'Complete lab manual for Data Structures covering arrays, linked lists, stacks, queues, trees, and graphs with C++ implementations.', 130, 155, 'in_stock'),
('m_algo_v1', 'sub_algo', 'Algorithms Lab Manual', 'Comprehensive guide to algorithmic paradigms including divide and conquer, greedy methods, and dynamic programming.', 98, 120, 'in_stock'),
('m_algo_v2', 'sub_algo_cse', 'Design and Analysis of Algorithms', 'Comprehensive guide to algorithmic paradigms.', 110, 125, 'in_stock');

PRAGMA foreign_keys=on;
