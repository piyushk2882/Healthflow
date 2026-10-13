-- =====================================================
-- HEALTHFLOW: DOCTOR REGISTRATION & APPROVAL SCHEMA
-- Migration: 004_doctor_registration_and_approval.sql
-- =====================================================

-- 1. ADD VERIFICATION STATUS TO DOCTORS TABLE
ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK (verification_status IN ('PENDING', 'APPROVED', 'REJECTED'));

-- 2. CREATE UNIQUE INDEX ON MEDICAL LICENSE NUMBER
-- Prevents duplicate accounts with the same medical registration/license number
CREATE UNIQUE INDEX IF NOT EXISTS idx_doctors_license_number
  ON public.doctors(license_number)
  WHERE license_number IS NOT NULL;

-- 3. CREATE INDEX ON VERIFICATION STATUS
CREATE INDEX IF NOT EXISTS idx_doctors_verification_status
  ON public.doctors(verification_status);

-- 4. UPDATE HANDLE_NEW_USER TRIGGER FUNCTION
-- Type-safe with public.user_role enum and exception handler to prevent any signup disruption
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  role_text TEXT;
  role_enum public.user_role;
  full_name_val TEXT;
BEGIN
  -- Read role and full_name from auth user metadata
  role_text := UPPER(COALESCE(NEW.raw_user_meta_data->>'role', 'PATIENT'));
  full_name_val := COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User');

  -- Ensure role maps safely to public.user_role enum (strictly PATIENT or DOCTOR, never ADMIN)
  IF role_text = 'DOCTOR' OR role_text = 'CAREGIVER' THEN
    role_enum := 'DOCTOR'::public.user_role;
  ELSE
    role_enum := 'PATIENT'::public.user_role;
  END IF;

  -- Create or update profile using typed enum
  INSERT INTO public.profiles (id, role, full_name)
  VALUES (NEW.id, role_enum, full_name_val)
  ON CONFLICT (id) DO UPDATE
  SET role = EXCLUDED.role,
      full_name = EXCLUDED.full_name,
      updated_at = NOW();

  -- If PATIENT, ensure a patient record exists
  IF role_enum = 'PATIENT'::public.user_role THEN
    INSERT INTO public.patients (profile_id)
    VALUES (NEW.id)
    ON CONFLICT (profile_id) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Prevent trigger errors from aborting user registration
    RAISE WARNING 'handle_new_user trigger encountered an error: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
