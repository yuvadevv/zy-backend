-- Add missing INSERT and UPDATE RLS policies for student_academic_records
CREATE POLICY "Students can update own academic record" 
ON public.student_academic_records 
FOR UPDATE 
USING (student_id = auth.uid());

CREATE POLICY "Students can insert own academic record" 
ON public.student_academic_records 
FOR INSERT 
WITH CHECK (student_id = auth.uid());
