// =====================================================
// HEALTHFLOW: MEDICATION MANAGEMENT TYPES
// =====================================================


// --------------------------------------------------
// Status enums
// --------------------------------------------------

export type MedicationStatus =
  | "ACTIVE"
  | "COMPLETED"
  | "PAUSED"
  | "DISCONTINUED";

export type MedicationLogStatus =
  | "PENDING"
  | "TAKEN"
  | "MISSED"
  | "SKIPPED";


// --------------------------------------------------
// Validation constants
// --------------------------------------------------

export const VALID_MEDICATION_STATUSES: MedicationStatus[] = [
  "ACTIVE",
  "COMPLETED",
  "PAUSED",
  "DISCONTINUED"
];

export const VALID_MEDICATION_LOG_STATUSES: MedicationLogStatus[] = [
  "PENDING",
  "TAKEN",
  "MISSED",
  "SKIPPED"
];


// --------------------------------------------------
// Database row interfaces (snake_case)
// --------------------------------------------------

export interface MedicationRow {
  id: string;
  patient_id: string;
  name: string;
  dosage: string | null;
  frequency: string;
  instructions: string | null;
  start_date: string;
  end_date: string | null;
  status: MedicationStatus;
  prescribed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MedicationScheduleRow {
  id: string;
  medication_id: string;
  scheduled_time: string;
  dose: string | null;
  created_at: string;
}

export interface MedicationLogRow {
  id: string;
  medication_id: string;
  scheduled_time: string;
  taken_at: string | null;
  status: MedicationLogStatus;
  notes: string | null;
  created_at: string;
}


// --------------------------------------------------
// API response interfaces (camelCase)
// --------------------------------------------------

export interface MedicationScheduleResponse {
  id: string;
  scheduledTime: string;
  dose: string | null;
  createdAt: string;
}

export interface MedicationLogResponse {
  id: string;
  scheduledTime: string;
  takenAt: string | null;
  status: MedicationLogStatus;
  notes: string | null;
  createdAt: string;
}

export interface MedicationResponse {
  id: string;
  name: string;
  dosage: string | null;
  frequency: string;
  instructions: string | null;
  startDate: string;
  endDate: string | null;
  status: MedicationStatus;
  prescribedBy: string | null;
  createdAt: string;
  updatedAt: string;
  schedules?: MedicationScheduleResponse[];
}


// --------------------------------------------------
// Request body interfaces
// --------------------------------------------------

export interface CreateMedicationBody {
  name: string;
  dosage?: string;
  frequency: string;
  instructions?: string;
  startDate: string;
  endDate?: string;
  status?: MedicationStatus;
  patientId?: string; // only used by doctors
}

export interface UpdateMedicationBody {
  name?: string;
  dosage?: string;
  frequency?: string;
  instructions?: string;
  startDate?: string;
  endDate?: string | null;
  status?: MedicationStatus;
}

export interface CreateScheduleBody {
  scheduledTime: string;
  dose?: string;
}

export interface UpdateScheduleBody {
  scheduledTime?: string;
  dose?: string;
}

export interface CreateMedicationLogBody {
  scheduledTime: string;
  status: MedicationLogStatus;
  takenAt?: string;
  notes?: string;
}


// --------------------------------------------------
// Helpers: row → response transformers
// --------------------------------------------------

export function toMedicationResponse(
  row: MedicationRow,
  schedules?: MedicationScheduleRow[]
): MedicationResponse {
  const response: MedicationResponse = {
    id: row.id,
    name: row.name,
    dosage: row.dosage,
    frequency: row.frequency,
    instructions: row.instructions,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    prescribedBy: row.prescribed_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };

  if (schedules) {
    response.schedules = schedules.map(toScheduleResponse);
  }

  return response;
}

export function toScheduleResponse(
  row: MedicationScheduleRow
): MedicationScheduleResponse {
  return {
    id: row.id,
    scheduledTime: row.scheduled_time,
    dose: row.dose,
    createdAt: row.created_at
  };
}

export function toLogResponse(
  row: MedicationLogRow
): MedicationLogResponse {
  return {
    id: row.id,
    scheduledTime: row.scheduled_time,
    takenAt: row.taken_at,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at
  };
}
