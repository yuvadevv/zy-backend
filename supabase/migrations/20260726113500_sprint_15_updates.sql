-- Add block to student_academic_records
ALTER TABLE public.student_academic_records 
ADD COLUMN IF NOT EXISTS block VARCHAR(50);

-- Add delivery_notes to student_profiles
ALTER TABLE public.student_profiles
ADD COLUMN IF NOT EXISTS delivery_notes TEXT;
