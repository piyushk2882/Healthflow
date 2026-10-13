import { Response } from "express";
import { supabaseAdmin } from "../config/supabaseAdmin";
import { AuthRequest } from "../middleware/auth.middleware";
import {
  MedicationRow,
  MedicationScheduleRow,
  MedicationLogRow,
  MedicationStatus,
  MedicationLogStatus,
  VALID_MEDICATION_STATUSES,
  VALID_MEDICATION_LOG_STATUSES,
  toMedicationResponse,
  toScheduleResponse,
  toLogResponse,
  CreateMedicationBody,
  UpdateMedicationBody,
  CreateScheduleBody,
  UpdateScheduleBody,
  CreateMedicationLogBody
} from "../types/medication.types";


// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Get patient record from authenticated user's profile_id.
 * Reuses the same pattern as healthEvent.controller.ts.
 */
const getPatientByUserId = async (userId: string) => {
  const { data, error } = await supabaseAdmin
    .from("patients")
    .select("id")
    .eq("profile_id", userId)
    .single();

  if (error || !data) {
    throw new Error("Patient record not found");
  }

  return data;
};

/**
 * Get doctor record from authenticated user's profile_id.
 */
const getDoctorByUserId = async (userId: string) => {
  const { data, error } = await supabaseAdmin
    .from("doctors")
    .select("id")
    .eq("profile_id", userId)
    .single();

  if (error || !data) {
    throw new Error("Doctor record not found");
  }

  return data;
};

/**
 * Verify that a doctor has an ACTIVE relationship with a patient.
 */
const verifyDoctorPatientRelationship = async (
  doctorId: string,
  patientId: string
): Promise<boolean> => {
  const { data, error } = await supabaseAdmin
    .from("patient_doctor")
    .select("id")
    .eq("doctor_id", doctorId)
    .eq("patient_id", patientId)
    .eq("status", "ACTIVE")
    .single();

  return !error && !!data;
};

/**
 * Verify that a medication belongs to a specific patient.
 * Returns the medication row or null.
 */
const getMedicationForPatient = async (
  medicationId: string,
  patientId: string
): Promise<MedicationRow | null> => {
  const { data, error } = await supabaseAdmin
    .from("medications")
    .select("*")
    .eq("id", medicationId)
    .eq("patient_id", patientId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as unknown as MedicationRow;
};

/**
 * Resolve patient ID from the authenticated user based on their role.
 *
 * For PATIENT: returns their own patient record ID.
 * For DOCTOR: requires patientId in the request, verifies active relationship.
 * For ADMIN: requires patientId in the request.
 */
const resolvePatientId = async (
  req: AuthRequest,
  patientIdFromBody?: string
): Promise<{ patientId: string; doctorId?: string; error?: string; status?: number }> => {
  const role = req.user!.role;

  if (role === "PATIENT") {
    const patient = await getPatientByUserId(req.user!.id);
    return { patientId: patient.id };
  }

  if (role === "DOCTOR") {
    const doctor = await getDoctorByUserId(req.user!.id);
    let targetPatientId: string = patientIdFromBody || "";

    // If patientId not explicitly passed in body, auto-resolve to doctor's active patient
    if (!targetPatientId) {
      const { data: rels } = await supabaseAdmin
        .from("patient_doctor")
        .select("patient_id")
        .eq("doctor_id", doctor.id)
        .eq("status", "ACTIVE")
        .order("assigned_at", { ascending: false });

      if (!rels || rels.length === 0) {
        return {
          patientId: "",
          error: "You do not have any active patients assigned. Please establish an active patient relationship first.",
          status: 403
        };
      }
      targetPatientId = rels[0].patient_id;
    }

    const hasRelationship = await verifyDoctorPatientRelationship(
      doctor.id,
      targetPatientId
    );

    if (!hasRelationship) {
      return {
        patientId: "",
        error: "You do not have an active relationship with this patient",
        status: 403
      };
    }

    return { patientId: targetPatientId, doctorId: doctor.id };
  }

  if (role === "ADMIN") {
    if (!patientIdFromBody) {
      return {
        patientId: "",
        error: "patientId is required for admin access",
        status: 400
      };
    }
    return { patientId: patientIdFromBody };
  }

  return { patientId: "", error: "Unauthorized role", status: 403 };
};

/**
 * Resolve patient ID for read operations using query parameters.
 * For PATIENT: uses their own patient ID.
 * For DOCTOR: uses query parameter, or auto-resolves to active patient from patient_doctor.
 * For ADMIN: requires patientId query parameter.
 */
const resolvePatientIdForRead = async (
  req: AuthRequest
): Promise<{ patientId: string; doctorId?: string; error?: string; status?: number }> => {
  const role = req.user!.role;
  const patientIdFromQuery = req.query.patientId as string | undefined;

  if (role === "PATIENT") {
    const patient = await getPatientByUserId(req.user!.id);
    return { patientId: patient.id };
  }

  if (role === "DOCTOR") {
    const doctor = await getDoctorByUserId(req.user!.id);
    let targetPatientId: string = patientIdFromQuery || "";

    // If patientId not explicitly passed in query, auto-resolve to doctor's active patient
    if (!targetPatientId) {
      const { data: rels } = await supabaseAdmin
        .from("patient_doctor")
        .select("patient_id")
        .eq("doctor_id", doctor.id)
        .eq("status", "ACTIVE")
        .order("assigned_at", { ascending: false });

      if (!rels || rels.length === 0) {
        return {
          patientId: "",
          error: "You do not have any active patients assigned. Please establish an active patient relationship first.",
          status: 403
        };
      }
      targetPatientId = rels[0].patient_id;
    }

    const hasRelationship = await verifyDoctorPatientRelationship(
      doctor.id,
      targetPatientId
    );

    if (!hasRelationship) {
      return {
        patientId: "",
        error: "You do not have an active relationship with this patient",
        status: 403
      };
    }

    return { patientId: targetPatientId, doctorId: doctor.id };
  }

  if (role === "ADMIN") {
    if (!patientIdFromQuery) {
      return {
        patientId: "",
        error: "patientId query parameter is required for admin access",
        status: 400
      };
    }
    return { patientId: patientIdFromQuery };
  }

  return { patientId: "", error: "Unauthorized role", status: 403 };
};

/**
 * Validate a TIME string in HH:mm or HH:mm:ss format.
 */
const isValidTimeFormat = (time: string): boolean => {
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time);
};

/**
 * Validate a DATE string in YYYY-MM-DD format.
 */
const isValidDateFormat = (date: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + "T00:00:00Z");
  return !isNaN(parsed.getTime());
};


// =====================================================
// MEDICATION ENDPOINTS
// =====================================================


/**
 * GET /api/medications
 * Return the authenticated patient's medications.
 * Doctors/Admins must pass ?patientId=<uuid>
 */
export const getMedications = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const resolved = await resolvePatientIdForRead(req);
    if (resolved.error) {
      return res.status(resolved.status || 400).json({
        success: false,
        message: resolved.error
      });
    }

    const statusFilter = req.query.status as string | undefined;

    let query = supabaseAdmin
      .from("medications")
      .select(`
        *,
        medication_schedules (*)
      `)
      .eq("patient_id", resolved.patientId)
      .order("created_at", { ascending: false });

    if (
      statusFilter &&
      VALID_MEDICATION_STATUSES.includes(statusFilter as MedicationStatus)
    ) {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Get Medications Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch medications"
      });
    }

    const rows = (data || []) as unknown as (MedicationRow & {
      medication_schedules?: MedicationScheduleRow[];
    })[];

    const medications = rows.map((row) =>
      toMedicationResponse(
        row,
        row.medication_schedules || []
      )
    );

    return res.status(200).json({
      success: true,
      count: medications.length,
      data: { medications }
    });

  } catch (error) {
    console.error("Get Medications Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch medications"
    });
  }
};


/**
 * GET /api/medications/:id
 * Return one medication including its schedules.
 */
export const getMedicationById = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const id = req.params.id as string;
    const resolved = await resolvePatientIdForRead(req);
    if (resolved.error) {
      return res.status(resolved.status || 400).json({
        success: false,
        message: resolved.error
      });
    }

    const { data, error } = await supabaseAdmin
      .from("medications")
      .select(`
        *,
        medication_schedules (*)
      `)
      .eq("id", id)
      .eq("patient_id", resolved.patientId)
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        message: "Medication not found"
      });
    }

    const row = data as unknown as MedicationRow & {
      medication_schedules?: MedicationScheduleRow[];
    };

    return res.status(200).json({
      success: true,
      data: {
        medication: toMedicationResponse(
          row,
          row.medication_schedules || []
        )
      }
    });

  } catch (error) {
    console.error("Get Medication Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch medication"
    });
  }
};


/**
 * POST /api/medications
 * Create a new medication.
 */
export const createMedication = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const body = req.body as CreateMedicationBody;

    // Validation
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return res.status(400).json({
        success: false,
        message: "name is required"
      });
    }

    if (!body.frequency || typeof body.frequency !== "string" || !body.frequency.trim()) {
      return res.status(400).json({
        success: false,
        message: "frequency is required"
      });
    }

    if (!body.startDate) {
      return res.status(400).json({
        success: false,
        message: "startDate is required"
      });
    }

    if (!isValidDateFormat(body.startDate)) {
      return res.status(400).json({
        success: false,
        message: "startDate must be a valid date in YYYY-MM-DD format"
      });
    }

    if (body.endDate !== undefined && body.endDate !== null) {
      if (!isValidDateFormat(body.endDate)) {
        return res.status(400).json({
          success: false,
          message: "endDate must be a valid date in YYYY-MM-DD format"
        });
      }

      if (body.endDate < body.startDate) {
        return res.status(400).json({
          success: false,
          message: "endDate cannot be before startDate"
        });
      }
    }

    if (
      body.status &&
      !VALID_MEDICATION_STATUSES.includes(body.status)
    ) {
      return res.status(400).json({
        success: false,
        message: `status must be one of: ${VALID_MEDICATION_STATUSES.join(", ")}`
      });
    }

    // Resolve patient ID and doctor ID
    const resolved = await resolvePatientId(req, body.patientId);
    if (resolved.error) {
      return res.status(resolved.status || 400).json({
        success: false,
        message: resolved.error
      });
    }

    // Build insert record
    const insertData: Record<string, unknown> = {
      patient_id: resolved.patientId,
      name: body.name.trim(),
      dosage: body.dosage || null,
      frequency: body.frequency.trim(),
      instructions: body.instructions || null,
      start_date: body.startDate,
      end_date: body.endDate || null,
      status: body.status || "ACTIVE",
      prescribed_by: resolved.doctorId || null
    };

    const { data, error } = await supabaseAdmin
      .from("medications")
      .insert(insertData)
      .select("*")
      .single();

    if (error || !data) {
      console.error("Create Medication Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create medication"
      });
    }

    const row = data as unknown as MedicationRow;

    return res.status(201).json({
      success: true,
      message: "Medication created successfully",
      data: {
        medication: toMedicationResponse(row)
      }
    });

  } catch (error) {
    console.error("Create Medication Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create medication"
    });
  }
};


/**
 * PUT /api/medications/:id
 * Update medication information.
 */
export const updateMedication = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const id = req.params.id as string;
    const body = req.body as UpdateMedicationBody;

    // Resolve patient ID
    const resolved = await resolvePatientIdForRead(req);
    if (resolved.error) {
      return res.status(resolved.status || 400).json({
        success: false,
        message: resolved.error
      });
    }

    // Verify medication belongs to patient
    const existingMedication = await getMedicationForPatient(
      id,
      resolved.patientId
    );

    if (!existingMedication) {
      return res.status(404).json({
        success: false,
        message: "Medication not found"
      });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return res.status(400).json({
          success: false,
          message: "name cannot be empty"
        });
      }
      updateData.name = body.name.trim();
    }

    if (body.dosage !== undefined) {
      updateData.dosage = body.dosage || null;
    }

    if (body.frequency !== undefined) {
      if (typeof body.frequency !== "string" || !body.frequency.trim()) {
        return res.status(400).json({
          success: false,
          message: "frequency cannot be empty"
        });
      }
      updateData.frequency = body.frequency.trim();
    }

    if (body.instructions !== undefined) {
      updateData.instructions = body.instructions || null;
    }

    if (body.startDate !== undefined) {
      if (!isValidDateFormat(body.startDate)) {
        return res.status(400).json({
          success: false,
          message: "startDate must be a valid date in YYYY-MM-DD format"
        });
      }
      updateData.start_date = body.startDate;
    }

    if (body.endDate !== undefined) {
      if (body.endDate !== null && !isValidDateFormat(body.endDate)) {
        return res.status(400).json({
          success: false,
          message: "endDate must be a valid date in YYYY-MM-DD format"
        });
      }
      updateData.end_date = body.endDate;
    }

    // Cross-validate date range
    const effectiveStartDate =
      (updateData.start_date as string) || existingMedication.start_date;
    const effectiveEndDate =
      updateData.end_date !== undefined
        ? (updateData.end_date as string | null)
        : existingMedication.end_date;

    if (effectiveEndDate && effectiveEndDate < effectiveStartDate) {
      return res.status(400).json({
        success: false,
        message: "endDate cannot be before startDate"
      });
    }

    if (body.status !== undefined) {
      if (!VALID_MEDICATION_STATUSES.includes(body.status)) {
        return res.status(400).json({
          success: false,
          message: `status must be one of: ${VALID_MEDICATION_STATUSES.join(", ")}`
        });
      }
      updateData.status = body.status;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update"
      });
    }

    const { data, error } = await supabaseAdmin
      .from("medications")
      .update(updateData)
      .eq("id", id)
      .eq("patient_id", resolved.patientId)
      .select("*")
      .single();

    if (error || !data) {
      console.error("Update Medication Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update medication"
      });
    }

    const row = data as unknown as MedicationRow;

    return res.status(200).json({
      success: true,
      message: "Medication updated successfully",
      data: {
        medication: toMedicationResponse(row)
      }
    });

  } catch (error) {
    console.error("Update Medication Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update medication"
    });
  }
};


/**
 * DELETE /api/medications/:id
 * Soft-delete: set status to DISCONTINUED if logs exist.
 * Hard-delete only if no medication logs exist.
 */
export const deleteMedication = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const id = req.params.id as string;

    const resolved = await resolvePatientIdForRead(req);
    if (resolved.error) {
      return res.status(resolved.status || 400).json({
        success: false,
        message: resolved.error
      });
    }

    // Verify medication belongs to patient
    const existingMedication = await getMedicationForPatient(
      id,
      resolved.patientId
    );

    if (!existingMedication) {
      return res.status(404).json({
        success: false,
        message: "Medication not found"
      });
    }

    // Check if there are medication logs
    const { count, error: countError } = await supabaseAdmin
      .from("medication_logs")
      .select("id", { count: "exact", head: true })
      .eq("medication_id", id);

    if (countError) {
      console.error("Count Logs Error:", countError);
      return res.status(500).json({
        success: false,
        message: "Failed to check medication history"
      });
    }

    if (count && count > 0) {
      // Soft delete: change status to DISCONTINUED
      const { data, error } = await supabaseAdmin
        .from("medications")
        .update({ status: "DISCONTINUED" })
        .eq("id", id)
        .eq("patient_id", resolved.patientId)
        .select("*")
        .single();

      if (error || !data) {
        console.error("Discontinue Medication Error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to discontinue medication"
        });
      }

      const row = data as unknown as MedicationRow;

      return res.status(200).json({
        success: true,
        message: "Medication discontinued (historical logs preserved)",
        data: {
          medication: toMedicationResponse(row)
        }
      });
    }

    // No logs: safe to hard delete
    const { error: deleteError } = await supabaseAdmin
      .from("medications")
      .delete()
      .eq("id", id)
      .eq("patient_id", resolved.patientId);

    if (deleteError) {
      console.error("Delete Medication Error:", deleteError);
      return res.status(500).json({
        success: false,
        message: "Failed to delete medication"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Medication deleted successfully"
    });

  } catch (error) {
    console.error("Delete Medication Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete medication"
    });
  }
};


// =====================================================
// SCHEDULE ENDPOINTS
// =====================================================


/**
 * GET /api/medications/:id/schedules
 * Return schedules for a medication.
 */
export const getSchedules = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const id = req.params.id as string;

    const resolved = await resolvePatientIdForRead(req);
    if (resolved.error) {
      return res.status(resolved.status || 400).json({
        success: false,
        message: resolved.error
      });
    }

    // Verify medication belongs to patient
    const medication = await getMedicationForPatient(
      id,
      resolved.patientId
    );

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: "Medication not found"
      });
    }

    const { data, error } = await supabaseAdmin
      .from("medication_schedules")
      .select("*")
      .eq("medication_id", id)
      .order("scheduled_time", { ascending: true });

    if (error) {
      console.error("Get Schedules Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch schedules"
      });
    }

    const rows = (data || []) as unknown as MedicationScheduleRow[];

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: {
        schedules: rows.map(toScheduleResponse)
      }
    });

  } catch (error) {
    console.error("Get Schedules Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch schedules"
    });
  }
};


/**
 * POST /api/medications/:id/schedules
 * Create a medication schedule.
 */
export const createSchedule = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const id = req.params.id as string;
    const body = req.body as CreateScheduleBody;

    // Validate scheduledTime
    if (!body.scheduledTime) {
      return res.status(400).json({
        success: false,
        message: "scheduledTime is required"
      });
    }

    if (!isValidTimeFormat(body.scheduledTime)) {
      return res.status(400).json({
        success: false,
        message: "scheduledTime must be in HH:mm or HH:mm:ss format"
      });
    }

    // Resolve patient ID
    const resolved = await resolvePatientId(req);
    if (resolved.error) {
      return res.status(resolved.status || 400).json({
        success: false,
        message: resolved.error
      });
    }

    // Verify medication belongs to patient
    const medication = await getMedicationForPatient(
      id,
      resolved.patientId
    );

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: "Medication not found"
      });
    }

    const { data, error } = await supabaseAdmin
      .from("medication_schedules")
      .insert({
        medication_id: id,
        scheduled_time: body.scheduledTime,
        dose: body.dose || null
      })
      .select("*")
      .single();

    if (error || !data) {
      console.error("Create Schedule Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create schedule"
      });
    }

    const row = data as unknown as MedicationScheduleRow;

    return res.status(201).json({
      success: true,
      message: "Schedule created successfully",
      data: {
        schedule: toScheduleResponse(row)
      }
    });

  } catch (error) {
    console.error("Create Schedule Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create schedule"
    });
  }
};


/**
 * PUT /api/medications/:id/schedules/:scheduleId
 * Update a medication schedule.
 */
export const updateSchedule = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const id = req.params.id as string;
    const scheduleId = req.params.scheduleId as string;
    const body = req.body as UpdateScheduleBody;

    // Resolve patient ID
    const resolved = await resolvePatientIdForRead(req);
    if (resolved.error) {
      return res.status(resolved.status || 400).json({
        success: false,
        message: resolved.error
      });
    }

    // Verify medication belongs to patient
    const medication = await getMedicationForPatient(
      id,
      resolved.patientId
    );

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: "Medication not found"
      });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (body.scheduledTime !== undefined) {
      if (!isValidTimeFormat(body.scheduledTime)) {
        return res.status(400).json({
          success: false,
          message: "scheduledTime must be in HH:mm or HH:mm:ss format"
        });
      }
      updateData.scheduled_time = body.scheduledTime;
    }

    if (body.dose !== undefined) {
      updateData.dose = body.dose || null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update"
      });
    }

    const { data, error } = await supabaseAdmin
      .from("medication_schedules")
      .update(updateData)
      .eq("id", scheduleId)
      .eq("medication_id", id)
      .select("*")
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found"
      });
    }

    const row = data as unknown as MedicationScheduleRow;

    return res.status(200).json({
      success: true,
      message: "Schedule updated successfully",
      data: {
        schedule: toScheduleResponse(row)
      }
    });

  } catch (error) {
    console.error("Update Schedule Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update schedule"
    });
  }
};


/**
 * DELETE /api/medications/:id/schedules/:scheduleId
 * Delete a medication schedule.
 */
export const deleteSchedule = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const id = req.params.id as string;
    const scheduleId = req.params.scheduleId as string;

    const resolved = await resolvePatientIdForRead(req);
    if (resolved.error) {
      return res.status(resolved.status || 400).json({
        success: false,
        message: resolved.error
      });
    }

    // Verify medication belongs to patient
    const medication = await getMedicationForPatient(
      id,
      resolved.patientId
    );

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: "Medication not found"
      });
    }

    // Verify the schedule belongs to the medication
    const { data: existingSchedule } = await supabaseAdmin
      .from("medication_schedules")
      .select("id")
      .eq("id", scheduleId)
      .eq("medication_id", id)
      .single();

    if (!existingSchedule) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found"
      });
    }

    const { error } = await supabaseAdmin
      .from("medication_schedules")
      .delete()
      .eq("id", scheduleId)
      .eq("medication_id", id);

    if (error) {
      console.error("Delete Schedule Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to delete schedule"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Schedule deleted successfully"
    });

  } catch (error) {
    console.error("Delete Schedule Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete schedule"
    });
  }
};


// =====================================================
// MEDICATION LOG ENDPOINTS
// =====================================================


/**
 * GET /api/medications/:id/logs
 * Return medication logs.
 */
export const getMedicationLogs = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const id = req.params.id as string;

    const resolved = await resolvePatientIdForRead(req);
    if (resolved.error) {
      return res.status(resolved.status || 400).json({
        success: false,
        message: resolved.error
      });
    }

    // Verify medication belongs to patient
    const medication = await getMedicationForPatient(
      id,
      resolved.patientId
    );

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: "Medication not found"
      });
    }

    const { data, error } = await supabaseAdmin
      .from("medication_logs")
      .select("*")
      .eq("medication_id", id)
      .order("scheduled_time", { ascending: false });

    if (error) {
      console.error("Get Medication Logs Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch medication logs"
      });
    }

    const rows = (data || []) as unknown as MedicationLogRow[];

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: {
        logs: rows.map(toLogResponse)
      }
    });

  } catch (error) {
    console.error("Get Medication Logs Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch medication logs"
    });
  }
};


/**
 * POST /api/medications/:id/logs
 * Create a medication log entry.
 */
export const createMedicationLog = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const id = req.params.id as string;
    const body = req.body as CreateMedicationLogBody;

    // Validate required fields
    if (!body.scheduledTime) {
      return res.status(400).json({
        success: false,
        message: "scheduledTime is required"
      });
    }

    // Validate scheduledTime is a valid ISO timestamp
    const scheduledDate = new Date(body.scheduledTime);
    if (isNaN(scheduledDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "scheduledTime must be a valid ISO timestamp"
      });
    }

    if (!body.status) {
      return res.status(400).json({
        success: false,
        message: "status is required"
      });
    }

    if (!VALID_MEDICATION_LOG_STATUSES.includes(body.status)) {
      return res.status(400).json({
        success: false,
        message: `status must be one of: ${VALID_MEDICATION_LOG_STATUSES.join(", ")}`
      });
    }

    // Validate takenAt if provided
    if (body.takenAt) {
      const takenDate = new Date(body.takenAt);
      if (isNaN(takenDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "takenAt must be a valid ISO timestamp"
        });
      }
    }

    // Resolve patient ID
    const resolved = await resolvePatientId(req);
    if (resolved.error) {
      return res.status(resolved.status || 400).json({
        success: false,
        message: resolved.error
      });
    }

    // Verify medication belongs to patient
    const medication = await getMedicationForPatient(
      id,
      resolved.patientId
    );

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: "Medication not found"
      });
    }

    const { data, error } = await supabaseAdmin
      .from("medication_logs")
      .insert({
        medication_id: id,
        scheduled_time: body.scheduledTime,
        taken_at: body.takenAt || null,
        status: body.status,
        notes: body.notes || null
      })
      .select("*")
      .single();

    if (error || !data) {
      console.error("Create Medication Log Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create medication log"
      });
    }

    const row = data as unknown as MedicationLogRow;

    return res.status(201).json({
      success: true,
      message: "Medication log created successfully",
      data: {
        log: toLogResponse(row)
      }
    });

  } catch (error) {
    console.error("Create Medication Log Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create medication log"
    });
  }
};


/**
 * GET /api/medications/patients/active
 * Return all active patients assigned to the authenticated doctor.
 */
export const getDoctorActivePatients = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user || req.user.role !== "DOCTOR") {
      return res.status(403).json({
        success: false,
        message: "Only doctors can access assigned patients"
      });
    }

    const doctor = await getDoctorByUserId(req.user.id);
    const { data: relationships, error } = await supabaseAdmin
      .from("patient_doctor")
      .select(`
        patient_id,
        assigned_at,
        patients (
          id,
          profile_id,
          profiles (
            full_name
          )
        )
      `)
      .eq("doctor_id", doctor.id)
      .eq("status", "ACTIVE");

    if (error) {
      console.error("Get Doctor Patients Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch assigned patients"
      });
    }

    const patients = (relationships || []).map((rel: any) => ({
      patientId: rel.patient_id,
      assignedAt: rel.assigned_at,
      fullName: rel.patients?.profiles?.full_name || "Patient"
    }));

    return res.status(200).json({
      success: true,
      data: { patients }
    });
  } catch (error) {
    console.error("Get Doctor Patients Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch assigned patients"
    });
  }
};

