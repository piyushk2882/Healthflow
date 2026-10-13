-- =====================================================
-- HEALTHFLOW: MEDICATION MANAGEMENT SCHEMA
-- Migration: 003_medications.sql
-- =====================================================

-- =====================================================
-- 1. UPDATED_AT TRIGGER FUNCTION
--    Create only if it does not already exist.
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =====================================================
-- 2. MEDICATIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.medications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  patient_id    UUID NOT NULL
                REFERENCES public.patients(id)
                ON DELETE CASCADE,

  name          TEXT NOT NULL,

  dosage        TEXT,

  frequency     TEXT NOT NULL,

  instructions  TEXT,

  start_date    DATE NOT NULL,

  end_date      DATE,

  status        TEXT NOT NULL
                CHECK (status IN ('ACTIVE', 'COMPLETED', 'PAUSED', 'DISCONTINUED')),

  prescribed_by UUID
                REFERENCES public.doctors(id)
                ON DELETE SET NULL,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- end_date must not be before start_date
  CONSTRAINT medications_date_range_check
    CHECK (end_date IS NULL OR end_date >= start_date)
);

-- updated_at trigger
CREATE TRIGGER trigger_medications_updated_at
  BEFORE UPDATE ON public.medications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


-- =====================================================
-- 3. MEDICATION SCHEDULES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.medication_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  medication_id   UUID NOT NULL
                  REFERENCES public.medications(id)
                  ON DELETE CASCADE,

  scheduled_time  TIME NOT NULL,

  dose            TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =====================================================
-- 4. MEDICATION LOGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.medication_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  medication_id   UUID NOT NULL
                  REFERENCES public.medications(id)
                  ON DELETE CASCADE,

  scheduled_time  TIMESTAMPTZ NOT NULL,

  taken_at        TIMESTAMPTZ,

  status          TEXT NOT NULL
                  CHECK (status IN ('PENDING', 'TAKEN', 'MISSED', 'SKIPPED')),

  notes           TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =====================================================
-- 5. INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_medications_patient_id
  ON public.medications(patient_id);

CREATE INDEX IF NOT EXISTS idx_medications_status
  ON public.medications(status);

CREATE INDEX IF NOT EXISTS idx_medications_start_date
  ON public.medications(start_date);

CREATE INDEX IF NOT EXISTS idx_medications_end_date
  ON public.medications(end_date);

CREATE INDEX IF NOT EXISTS idx_medication_schedules_medication_id
  ON public.medication_schedules(medication_id);

CREATE INDEX IF NOT EXISTS idx_medication_logs_medication_id
  ON public.medication_logs(medication_id);

CREATE INDEX IF NOT EXISTS idx_medication_logs_scheduled_time
  ON public.medication_logs(scheduled_time);


-- =====================================================
-- 6. ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS on all three tables
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_logs ENABLE ROW LEVEL SECURITY;


-- --------------------------------------------------
-- MEDICATIONS RLS POLICIES
-- --------------------------------------------------

-- Patients can view their own medications
CREATE POLICY medications_patient_select
  ON public.medications FOR SELECT
  USING (
    patient_id IN (
      SELECT id FROM public.patients
      WHERE profile_id = auth.uid()
    )
  );

-- Patients can insert their own medications
CREATE POLICY medications_patient_insert
  ON public.medications FOR INSERT
  WITH CHECK (
    patient_id IN (
      SELECT id FROM public.patients
      WHERE profile_id = auth.uid()
    )
  );

-- Patients can update their own medications
CREATE POLICY medications_patient_update
  ON public.medications FOR UPDATE
  USING (
    patient_id IN (
      SELECT id FROM public.patients
      WHERE profile_id = auth.uid()
    )
  );

-- Patients can delete their own medications
CREATE POLICY medications_patient_delete
  ON public.medications FOR DELETE
  USING (
    patient_id IN (
      SELECT id FROM public.patients
      WHERE profile_id = auth.uid()
    )
  );

-- Doctors can view medications for their active patients
CREATE POLICY medications_doctor_select
  ON public.medications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patient_doctor pd
      JOIN public.doctors d ON d.id = pd.doctor_id
      WHERE pd.patient_id = medications.patient_id
        AND d.profile_id = auth.uid()
        AND pd.status = 'ACTIVE'
    )
  );

-- Doctors can insert medications for their active patients
CREATE POLICY medications_doctor_insert
  ON public.medications FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.patient_doctor pd
      JOIN public.doctors d ON d.id = pd.doctor_id
      WHERE pd.patient_id = medications.patient_id
        AND d.profile_id = auth.uid()
        AND pd.status = 'ACTIVE'
    )
  );

-- Doctors can update medications for their active patients
CREATE POLICY medications_doctor_update
  ON public.medications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.patient_doctor pd
      JOIN public.doctors d ON d.id = pd.doctor_id
      WHERE pd.patient_id = medications.patient_id
        AND d.profile_id = auth.uid()
        AND pd.status = 'ACTIVE'
    )
  );


-- --------------------------------------------------
-- MEDICATION SCHEDULES RLS POLICIES
-- --------------------------------------------------

-- Patients can manage schedules for their own medications
CREATE POLICY medication_schedules_patient_select
  ON public.medication_schedules FOR SELECT
  USING (
    medication_id IN (
      SELECT m.id FROM public.medications m
      JOIN public.patients p ON p.id = m.patient_id
      WHERE p.profile_id = auth.uid()
    )
  );

CREATE POLICY medication_schedules_patient_insert
  ON public.medication_schedules FOR INSERT
  WITH CHECK (
    medication_id IN (
      SELECT m.id FROM public.medications m
      JOIN public.patients p ON p.id = m.patient_id
      WHERE p.profile_id = auth.uid()
    )
  );

CREATE POLICY medication_schedules_patient_update
  ON public.medication_schedules FOR UPDATE
  USING (
    medication_id IN (
      SELECT m.id FROM public.medications m
      JOIN public.patients p ON p.id = m.patient_id
      WHERE p.profile_id = auth.uid()
    )
  );

CREATE POLICY medication_schedules_patient_delete
  ON public.medication_schedules FOR DELETE
  USING (
    medication_id IN (
      SELECT m.id FROM public.medications m
      JOIN public.patients p ON p.id = m.patient_id
      WHERE p.profile_id = auth.uid()
    )
  );

-- Doctors can manage schedules for their active patients' medications
CREATE POLICY medication_schedules_doctor_select
  ON public.medication_schedules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.medications m
      JOIN public.patient_doctor pd ON pd.patient_id = m.patient_id
      JOIN public.doctors d ON d.id = pd.doctor_id
      WHERE m.id = medication_schedules.medication_id
        AND d.profile_id = auth.uid()
        AND pd.status = 'ACTIVE'
    )
  );

CREATE POLICY medication_schedules_doctor_insert
  ON public.medication_schedules FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.medications m
      JOIN public.patient_doctor pd ON pd.patient_id = m.patient_id
      JOIN public.doctors d ON d.id = pd.doctor_id
      WHERE m.id = medication_schedules.medication_id
        AND d.profile_id = auth.uid()
        AND pd.status = 'ACTIVE'
    )
  );

CREATE POLICY medication_schedules_doctor_update
  ON public.medication_schedules FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.medications m
      JOIN public.patient_doctor pd ON pd.patient_id = m.patient_id
      JOIN public.doctors d ON d.id = pd.doctor_id
      WHERE m.id = medication_schedules.medication_id
        AND d.profile_id = auth.uid()
        AND pd.status = 'ACTIVE'
    )
  );

CREATE POLICY medication_schedules_doctor_delete
  ON public.medication_schedules FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.medications m
      JOIN public.patient_doctor pd ON pd.patient_id = m.patient_id
      JOIN public.doctors d ON d.id = pd.doctor_id
      WHERE m.id = medication_schedules.medication_id
        AND d.profile_id = auth.uid()
        AND pd.status = 'ACTIVE'
    )
  );


-- --------------------------------------------------
-- MEDICATION LOGS RLS POLICIES
-- --------------------------------------------------

-- Patients can manage logs for their own medications
CREATE POLICY medication_logs_patient_select
  ON public.medication_logs FOR SELECT
  USING (
    medication_id IN (
      SELECT m.id FROM public.medications m
      JOIN public.patients p ON p.id = m.patient_id
      WHERE p.profile_id = auth.uid()
    )
  );

CREATE POLICY medication_logs_patient_insert
  ON public.medication_logs FOR INSERT
  WITH CHECK (
    medication_id IN (
      SELECT m.id FROM public.medications m
      JOIN public.patients p ON p.id = m.patient_id
      WHERE p.profile_id = auth.uid()
    )
  );

-- Doctors can view logs for their active patients' medications
CREATE POLICY medication_logs_doctor_select
  ON public.medication_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.medications m
      JOIN public.patient_doctor pd ON pd.patient_id = m.patient_id
      JOIN public.doctors d ON d.id = pd.doctor_id
      WHERE m.id = medication_logs.medication_id
        AND d.profile_id = auth.uid()
        AND pd.status = 'ACTIVE'
    )
  );


-- =====================================================
-- SERVICE ROLE BYPASS
-- =====================================================
-- The backend uses the service_role key (supabaseAdmin)
-- which bypasses RLS. These RLS policies add defense-in-depth
-- for any direct Supabase client access.
-- Backend APIs enforce ownership checks at the application layer.
