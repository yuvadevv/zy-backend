-- supabase/migrations/20260712000003_academic_rls.sql

-- Enable RLS on all tables
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registered_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colleges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.section_classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_academic_records ENABLE ROW LEVEL SECURITY;

-- Helper function to check if a user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admins WHERE user_id = auth.uid() AND is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Academic Hierarchy Tables: Public can read active data, only admins can modify
CREATE POLICY "Public can read active colleges" ON public.colleges FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Admins can manage colleges" ON public.colleges USING (public.is_admin());

CREATE POLICY "Public can read active departments" ON public.departments FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Admins can manage departments" ON public.departments USING (public.is_admin());

CREATE POLICY "Public can read active branches" ON public.branches FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Admins can manage branches" ON public.branches USING (public.is_admin());

CREATE POLICY "Public can read active academic years" ON public.academic_years FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Admins can manage academic years" ON public.academic_years USING (public.is_admin());

CREATE POLICY "Public can read active semesters" ON public.semesters FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Admins can manage semesters" ON public.semesters USING (public.is_admin());

CREATE POLICY "Public can read active sections" ON public.sections FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Admins can manage sections" ON public.sections USING (public.is_admin());

CREATE POLICY "Public can read active classrooms" ON public.classrooms FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Admins can manage classrooms" ON public.classrooms USING (public.is_admin());

CREATE POLICY "Public can read section_classrooms" ON public.section_classrooms FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Admins can manage section_classrooms" ON public.section_classrooms USING (public.is_admin());

CREATE POLICY "Public can read active settings" ON public.academic_settings FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Admins can manage settings" ON public.academic_settings USING (public.is_admin());

-- Roles, Admins, and Tracking
CREATE POLICY "Users can read active roles" ON public.roles FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Users can read their own roles" ON public.user_roles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can manage user roles" ON public.user_roles USING (public.is_admin());

CREATE POLICY "Users can read own admin status" ON public.admins FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "System can manage admins" ON public.admins USING (FALSE); -- Only Service Role manages admins

CREATE POLICY "Users can read own login history" ON public.login_history FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own login history" ON public.login_history FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can manage own devices" ON public.registered_devices USING (user_id = auth.uid());

-- Wallets
CREATE POLICY "Users can read own wallet" ON public.wallets FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins and Service Role can manage wallets" ON public.wallets USING (public.is_admin());

-- Vendors
CREATE POLICY "Vendors can read own vendor info" ON public.vendors FOR SELECT USING (
    id IN (SELECT vendor_id FROM public.vendor_branches WHERE id IN (SELECT vendor_branch_id FROM public.vendor_users WHERE user_id = auth.uid()))
);
CREATE POLICY "Admins can manage vendors" ON public.vendors USING (public.is_admin());

CREATE POLICY "Vendors can read own branches" ON public.vendor_branches FOR SELECT USING (
    id IN (SELECT vendor_branch_id FROM public.vendor_users WHERE user_id = auth.uid())
);
CREATE POLICY "Admins can manage vendor_branches" ON public.vendor_branches USING (public.is_admin());

CREATE POLICY "Vendors can read own users" ON public.vendor_users FOR SELECT USING (
    vendor_branch_id IN (SELECT vendor_branch_id FROM public.vendor_users WHERE user_id = auth.uid())
);
CREATE POLICY "Admins can manage vendor_users" ON public.vendor_users USING (public.is_admin());

-- Student Profiles: Strict Privacy
CREATE POLICY "Students can read own profile" ON public.student_profiles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Students can update own profile" ON public.student_profiles FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Students can insert own profile" ON public.student_profiles FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can read all profiles" ON public.student_profiles FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can update all profiles" ON public.student_profiles FOR UPDATE USING (public.is_admin());

-- Student Academic Records: Strict Privacy
CREATE POLICY "Students can read own academic record" ON public.student_academic_records FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "Admins can manage all academic records" ON public.student_academic_records USING (public.is_admin());
