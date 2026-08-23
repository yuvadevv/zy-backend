-- supabase/migrations/20260712000002_academic_indexes_constraints.sql

-- Performance Indexes (B-Tree) on Foreign Keys
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON public.user_roles(role_id);
CREATE INDEX idx_admins_user_id ON public.admins(user_id);
CREATE INDEX idx_admins_college_id ON public.admins(college_id);

CREATE INDEX idx_departments_college_id ON public.departments(college_id);
CREATE INDEX idx_branches_department_id ON public.branches(department_id);
CREATE INDEX idx_semesters_academic_year_id ON public.semesters(academic_year_id);
CREATE INDEX idx_sections_semester_id ON public.sections(semester_id);
CREATE INDEX idx_section_classrooms_section_id ON public.section_classrooms(section_id);
CREATE INDEX idx_section_classrooms_classroom_id ON public.section_classrooms(classroom_id);

CREATE INDEX idx_vendor_branches_vendor_id ON public.vendor_branches(vendor_id);
CREATE INDEX idx_vendor_users_user_id ON public.vendor_users(user_id);

CREATE INDEX idx_academic_records_student_id ON public.student_academic_records(student_id);
CREATE INDEX idx_academic_records_college_id ON public.student_academic_records(college_id);
CREATE INDEX idx_academic_records_department_id ON public.student_academic_records(department_id);
CREATE INDEX idx_academic_records_branch_id ON public.student_academic_records(branch_id);

-- Search Indexes (B-Tree for exact match, consider pg_trgm for partial match in future)
CREATE INDEX idx_student_profiles_search_name ON public.student_profiles(search_name);
CREATE INDEX idx_student_profiles_email ON public.student_profiles(email);
CREATE INDEX idx_student_profiles_phone ON public.student_profiles(phone_number);
CREATE INDEX idx_student_academic_records_roll_number ON public.student_academic_records(roll_number);

-- Check Constraints
ALTER TABLE public.student_profiles 
ADD CONSTRAINT chk_student_profiles_email 
CHECK (email ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+[.][A-Za-z]+$');

ALTER TABLE public.student_profiles 
ADD CONSTRAINT chk_student_profiles_phone 
CHECK (phone_number ~* '^[0-9+() -]{10,20}$' OR phone_number IS NULL);

ALTER TABLE public.student_profiles 
ADD CONSTRAINT chk_student_profiles_completion 
CHECK (profile_completion_percentage >= 0 AND profile_completion_percentage <= 100);

ALTER TABLE public.classrooms 
ADD CONSTRAINT chk_classrooms_capacity 
CHECK (capacity >= 0);

ALTER TABLE public.wallets 
ADD CONSTRAINT chk_wallets_balance 
CHECK (balance >= 0);

ALTER TABLE public.academic_years
ADD CONSTRAINT chk_academic_years_order 
CHECK (order_index > 0);

ALTER TABLE public.semesters
ADD CONSTRAINT chk_semesters_order 
CHECK (order_index > 0);
