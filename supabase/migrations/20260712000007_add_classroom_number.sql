-- Add classroom_number to student_academic_records
ALTER TABLE public.student_academic_records 
ADD COLUMN IF NOT EXISTS classroom_number VARCHAR(100);
