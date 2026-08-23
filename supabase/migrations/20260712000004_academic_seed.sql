-- supabase/migrations/20260712000004_academic_seed.sql

-- Insert Default Roles
INSERT INTO public.roles (name, description) VALUES
('STUDENT', 'Standard student account'),
('VENDOR', 'Print partner vendor account'),
('FACULTY', 'College faculty account'),
('HOD', 'Head of Department account'),
('ADMIN', 'System administrator'),
('SUPER_ADMIN', 'Super administrator with full access')
ON CONFLICT (name) DO NOTHING;

-- Define UUID variables for hierarchical seeding
DO $$
DECLARE
    v_college_id UUID := gen_random_uuid();
    v_department_id UUID := gen_random_uuid();
    v_branch_id UUID := gen_random_uuid();
    v_year_id UUID := gen_random_uuid();
    v_semester_id UUID := gen_random_uuid();
    v_section_id UUID := gen_random_uuid();
    v_classroom_id UUID := gen_random_uuid();
    v_vendor_id UUID := gen_random_uuid();
    v_vendor_branch_id UUID := gen_random_uuid();
BEGIN

    -- 1. Seed College (with new fields)
    INSERT INTO public.colleges (id, name, code, address, city, state, country, pincode, website, support_email) 
    VALUES (
        v_college_id, 
        'Ramachandra College of Engineering', 
        'RCE',
        'NH-16 Bypass Road, Vatluru',
        'Eluru',
        'Andhra Pradesh',
        'India',
        '534007',
        'https://rcee.ac.in',
        'support@rcee.ac.in'
    );

    -- 2. Seed Department
    INSERT INTO public.departments (id, college_id, name, code)
    VALUES (v_department_id, v_college_id, 'Engineering', 'ENG');

    -- 3. Seed Branch (with short_name)
    INSERT INTO public.branches (id, department_id, name, code, short_name)
    VALUES (v_branch_id, v_department_id, 'Artificial Intelligence & Machine Learning', 'AIML', 'AIML');

    -- 4. Seed Academic Year
    INSERT INTO public.academic_years (id, name, order_index)
    VALUES (v_year_id, '1st Year', 1);

    -- 5. Seed Semester
    INSERT INTO public.semesters (id, academic_year_id, name, order_index)
    VALUES (v_semester_id, v_year_id, 'Semester 1', 1);

    -- 6. Seed Section
    INSERT INTO public.sections (id, semester_id, name)
    VALUES (v_section_id, v_semester_id, 'A');

    -- 7. Seed Classroom (with capacity fields)
    INSERT INTO public.classrooms (id, building_name, floor, room_number, capacity, class_strength, available_seats)
    VALUES (v_classroom_id, 'Block A', '3rd Floor', '301', 60, 50, 10);

    -- 8. Seed Section Classroom Mapping
    INSERT INTO public.section_classrooms (section_id, classroom_id, effective_from)
    VALUES (v_section_id, v_classroom_id, CURRENT_DATE);

    -- 9. Initialize Academic Settings
    INSERT INTO public.academic_settings (current_academic_year_id, current_semester_id, registration_open, printing_enabled)
    VALUES (v_year_id, v_semester_id, TRUE, TRUE);

    -- 10. Seed Default Vendor
    INSERT INTO public.vendors (id, name, contact_number, email)
    VALUES (v_vendor_id, 'RCE Main Print Shop', '9876543210', 'vendor@rcee.ac.in');

    INSERT INTO public.vendor_branches (id, vendor_id, address, city, pincode)
    VALUES (v_vendor_branch_id, v_vendor_id, 'Block B Ground Floor', 'Eluru', '534007');

END $$;
